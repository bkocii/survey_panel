# surveys/logic.py
from typing import Any, Dict, Union, Iterable
from .models import Response

Number = Union[int, float]


def _coerce(x: Any) -> Any:
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

    # If the actual is a list (multi-answer), normalize comparisons
    def _in_container(container: Iterable, x) -> bool:
        return any((_coerce(y) == x) for y in container)

    if isinstance(a, (list, tuple, set)):
        if op == "eq":     return _in_container(a, v)
        if op == "ne":     return not _in_container(a, v)
        if op == "in":     return any((_coerce(y) in v) for y in a) if isinstance(v, (list, tuple, set)) else False
        if op == "not_in": return all((_coerce(y) not in v) for y in a) if isinstance(v, (list, tuple, set)) else True
        # Numeric ops don’t make much sense on lists; default False
        return False

    if op == "eq":     return a == v
    if op == "ne":     return a != v
    if op == "in":     return (a in v) if isinstance(v, (list, tuple, set)) else False
    if op == "not_in": return (a not in v) if isinstance(v, (list, tuple, set)) else True
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
    Keys prefer question.code if present, else question.id.
    Values:
      - SINGLE/DROPDOWN/RATING/YESNO/NUMBER/SLIDER/TEXT/DATE: scalar (choice.value, text, numeric)
      - MULTI_CHOICE / multi-answers: list of scalars
    """
    amap: Dict[Any, Any] = {}

    qs = Response.objects.filter(
        user=user, survey=survey, submission__isnull=True
    ).select_related("question", "choice")

    for r in qs:
        key = r.question.code or r.question_id
        val = None
        if r.choice_id:
            # prefer numeric 'value' if present; fall back to choice id
            val = r.value if r.value is not None else r.choice_id
        elif r.text_answer not in (None, ""):
            try:
                val = float(r.text_answer) if "." in r.text_answer else int(r.text_answer)
            except Exception:
                val = r.text_answer

        # accumulate for multi-answer questions
        if key in amap:
            existing = amap[key]
            if isinstance(existing, list):
                existing.append(val)
            else:
                amap[key] = [existing, val]
        else:
            amap[key] = val if val is not None else None

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

