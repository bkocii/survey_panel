# surveys/logic.py
from typing import Any, Dict, Union, Iterable
from .models import Response, Question
from collections import defaultdict

Number = Union[int, float]


def _coerce(x: Any) -> Any:
    # Recurse into iterables so ["1","2"] becomes [1,2]
    if isinstance(x, (list, tuple, set)):
        coerced = [_coerce(i) for i in x]
        return type(x)(coerced) if not isinstance(x, set) else set(coerced)

    if isinstance(x, str):
        try:
            return float(x) if "." in x else int(x)
        except Exception:
            return x

    return x


def eval_condition(cond: Dict[str, Any], answers: Dict[Any, Any]) -> bool:
    qref = cond.get("q")
    op   = cond.get("op", "eq")
    val  = cond.get("val")

    actual = answers.get(qref)
    # Also try numeric key if qref is "123"
    if actual is None and isinstance(qref, str) and qref.isdigit():
        actual = answers.get(int(qref))

    a = _coerce(actual)
    v = _coerce(val)

    # Normalize v for membership ops (fast + type-stable)
    v_set = None
    if isinstance(v, (list, tuple, set)):
        v_set = {_coerce(x) for x in v}

    # If the actual is a list (multi-answer), normalize comparisons
    def _in_container(container: Iterable, x) -> bool:
        return any((_coerce(y) == x) for y in container)

    if isinstance(a, (list, tuple, set)):
        if op == "eq":     return _in_container(a, v)
        if op == "ne":     return not _in_container(a, v)
        if op == "in":     return any((_coerce(y) in v_set) for y in a) if v_set is not None else False
        if op == "not_in": return all((_coerce(y) not in v_set) for y in a) if v_set is not None else True
        # Numeric ops don’t make much sense on lists; default False
        return False

    if op == "eq":     return a == v
    if op == "ne":     return a != v
    if op == "in":     return (a in v_set) if v_set is not None else False
    if op == "not_in": return (a not in v_set) if v_set is not None else True
    if op == "gt":     return isinstance(a, (int, float)) and isinstance(v, (int, float)) and a >  v
    if op == "gte":    return isinstance(a, (int, float)) and isinstance(v, (int, float)) and a >= v
    if op == "lt":     return isinstance(a, (int, float)) and isinstance(v, (int, float)) and a <  v
    if op == "lte":    return isinstance(a, (int, float)) and isinstance(v, (int, float)) and a <= v

    return False


def eval_rules(rules: Dict[str, Any], answers: Dict[Any, Any]) -> bool:
    if not rules:
        return True
    if "all" in rules:
        return all(eval_rules(r, answers) for r in rules["all"])
    if "any" in rules:
        return any(eval_rules(r, answers) for r in rules["any"])
    return eval_condition(rules, answers)


def answers_for_user_survey(user, survey) -> Dict[Any, Any]:
    """
    Build an answers map from in-progress responses (submission is NULL).

    Base keys:
      - question.code if present, else question.id

    Extra keys for MATRIX (non-SBS):
      - "<QREF>::col::<colKey>" = rowKey OR [rowKey1, rowKey2, ...]
        where rowKey is row.value or "id:<row_pk>"

    Extra keys for MATRIX (SBS):
      - "<QREF>::sbs::group::<group_slug>::row::<rowKey>" = value
        where value is numeric/text of that row+group cell; may be a list
        if multiple values exist (e.g. checkbox).
    """
    amap: Dict[Any, Any] = {}

    # (qref, colKey) -> list[rowKey] (we'll de-dupe)
    matrix_col_rows: Dict[tuple, list] = defaultdict(list)

    # (qref, group_slug, rowKey) -> val or [vals]
    sbs_cells: Dict[tuple, Any] = {}

    qs = (
        Response.objects
        .filter(user=user, survey=survey, submission__isnull=True)
        .select_related("question", "choice", "matrix_row", "matrix_column")
    )

    for r in qs:
        q = r.question
        qref = q.code or q.id

        # --- compute cell value (unchanged) ------------------------------
        cell_val = None
        if r.choice_id:
            cell_val = r.value if r.value is not None else r.choice_id
        elif r.value is not None:
            cell_val = r.value
        elif r.text_answer not in (None, ""):
            try:
                cell_val = float(r.text_answer) if "." in r.text_answer else int(r.text_answer)
            except Exception:
                cell_val = r.text_answer

        # --- base per-question key (unchanged) ---------------------------
        key = qref
        if key in amap:
            existing = amap[key]
            if isinstance(existing, list):
                amap[key] = existing + [cell_val]
            else:
                amap[key] = [existing, cell_val]
        else:
            amap[key] = cell_val if cell_val is not None else None

        # --- MATRIX extras -----------------------------------------------
        if q.question_type == "MATRIX":
            mode = getattr(q, "matrix_mode", None) or "single"
            col  = getattr(r, "matrix_column", None)
            row  = getattr(r, "matrix_row", None)

            # Non-SBS: record selected row for that column
            if mode != "side_by_side" and col is not None and row is not None:
                col_key = str(col.value) if col.value not in (None, "") else f"id:{col.id}"
                row_key = str(row.value) if getattr(row, "value", None) not in (None, "") else f"id:{row.id}"

                # only record when we actually have an answer
                if cell_val is not None:
                    matrix_col_rows[(qref, col_key)].append(row_key)

            # SBS: record the value of (group,row)
            elif mode == "side_by_side" and col is not None and row is not None:
                group_slug = (col.group or "").strip()
                if not group_slug:
                    continue

                row_key = str(row.value) if getattr(row, "value", None) not in (None, "") else f"id:{row.id}"
                t = (qref, group_slug, row_key)

                if t in sbs_cells:
                    existing = sbs_cells[t]
                    if isinstance(existing, list):
                        existing.append(cell_val)
                    else:
                        sbs_cells[t] = [existing, cell_val]
                else:
                    sbs_cells[t] = cell_val

    # --- Fold MATRIX non-SBS column selections into amap -----------------
    # De-dupe and collapse single vs list.
    for (qref, col_key), rows in matrix_col_rows.items():
        if not rows:
            continue

        # De-dupe but keep stable order
        seen = set()
        uniq = []
        for rk in rows:
            if rk in seen:
                continue
            seen.add(rk)
            uniq.append(rk)

        amap[f"{qref}::col::{col_key}"] = uniq[0] if len(uniq) == 1 else uniq

    # --- Fold MATRIX SBS cells into amap ---------------------------------
    for (qref, group_slug, row_key), val in sbs_cells.items():
        amap[f"{qref}::sbs::group::{group_slug}::row::{row_key}"] = val

    return amap


def is_visible(question, user, survey) -> bool:
    from .models import Question
    rules = question.visibility_rules or {}
    amap = answers_for_user_survey(user, survey)
    return eval_rules(rules, amap)


def next_displayable(start_q, user, survey) -> "Question|None":
    q = start_q
    visited = set()
    while q:
        if q.pk in visited:
            break
        visited.add(q.pk)
        if is_visible(q, user, survey):
            return q
        q = q.next_question
    return None


def find_next_visible_after(current_question, all_questions, user, survey):
    """
    Walk forward in the survey’s linear order starting right AFTER current_question.
    For each candidate, apply next_displayable() to honor per-question routing chains
    and visibility rules. Returns a visible question or None.
    """
    try:
        start_idx = all_questions.index(current_question)
    except ValueError:
        start_idx = -1

    for cand in all_questions[start_idx + 1:]:
        # this lets the candidate chase its own next_question chain while skipping hidden
        nxt = next_displayable(cand, user, survey)
        if nxt:
            return nxt
    return None


def safe_next_question(preferred_next, current_question, all_questions, user, survey):
    """
    Preferred path:
      1) Try the explicit routing target (and its chain) respecting visibility
      2) If that yields None, try the next visible question in linear order
      3) If none, return None (caller should finalize)
    """
    # 1) try the explicit target (which may itself skip forward via next_question chain)
    if preferred_next:
        cand = next_displayable(preferred_next, user, survey)
        if cand:
            return cand

    # 2) try the linear sequence after the current question
    return find_next_visible_after(current_question, all_questions, user, survey)

