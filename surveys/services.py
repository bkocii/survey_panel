# surveys/services.py
from collections import defaultdict
from django.utils.html import escape
from django.utils.text import slugify
from surveys.models import SbsCellRouting
from .analytics import build_submission_answer_facts
from django.utils.timezone import now
from django.utils.dateparse import parse_datetime

from .models import Submission, Response
from ledger.models import  PointsLedger # adjust import if your app path differs


def validate_and_collect_matrix_responses(request, survey, question):
    """Validate all required side-by-side matrix inputs before saving."""
    grouped_matrix_columns = defaultdict(list)
    columns = question.matrix_columns.all().order_by('group', 'value')
    for col in columns:
        key = col.group or "Ungrouped"
        grouped_matrix_columns[key].append(col)
    grouped_matrix_columns = dict(grouped_matrix_columns)

    collected_responses = []
    next_q = None

    for row in question.matrix_rows.all():
        for group_label, cols in grouped_matrix_columns.items():
            input_type = cols[0].input_type  # all columns in a group share the same type

            # --- SELECT (one field per group) ---
            if input_type == 'select':
                group_slug = slugify(group_label)
                field_name = f"matrix_{row.id}_{group_slug}"
                val = (request.POST.get(field_name, '') or '').strip()

                is_required = any(col.required for col in cols) or row.required
                if is_required and not val:
                    return False, (
                        f"Please select a value for '{escape(row.text)}' under '{escape(group_label)}'."
                    ), None

                if val:
                    matching_col = next((c for c in cols if str(c.value) == val), None)
                    label = matching_col.label if matching_col else val
                    anchor_col = matching_col or cols[0]  # canonical column for the group

                    collected_responses.append({
                        'row': row,
                        'col': anchor_col,
                        'answer': label,
                        'value': val,
                        'group_label': group_label,
                    })
                    if not next_q:
                        route = SbsCellRouting.objects.filter(
                            question=question,
                            group_slug=group_slug,
                            row=row,
                            col=matching_col,  # or matching_col / anchor_col in that branch
                        ).select_related('next_question').first()

                        if route and route.next_question:
                            next_q = route.next_question
                        elif matching_col.next_question:
                            next_q = matching_col.next_question

            # --- RADIO (one field per group) ---
            elif input_type == 'radio':
                group_slug = slugify(group_label)
                field_name = f"matrix_{row.id}_{group_slug}"
                selected_val = (request.POST.get(field_name, '') or '').strip()

                group_required = any(col.required for col in cols) or row.required
                if group_required and not selected_val:
                    return False, (
                        f"Please select an option for '{escape(row.text)}' under '{escape(group_label)}'."
                    ), None

                if selected_val:
                    selected_col = next((c for c in cols if str(c.value) == selected_val), None)
                    if not selected_col:
                        return False, (
                            f"Invalid selection for '{escape(row.text)}' under '{escape(group_label)}'."
                        ), None

                    collected_responses.append({
                        'row': row,
                        'col': selected_col,
                        'answer': selected_col.label,
                        'value': selected_col.value,
                        'group_label': group_label,
                    })
                    if not next_q:
                        route = SbsCellRouting.objects.filter(
                            question=question,
                            group_slug=group_slug,
                            row=row,
                            col=selected_col,  # or matching_col / anchor_col in that branch
                        ).select_related('next_question').first()

                        if route and route.next_question:
                            next_q = route.next_question
                        elif selected_col.next_question:
                            next_q = selected_col.next_question

            # --- CHECKBOX (one field per group; multiple values) ---
            elif input_type == 'checkbox':
                group_slug = slugify(group_label)
                field_name = f"matrix_{row.id}_{group_slug}"
                selected_values = request.POST.getlist(field_name)

                group_required = any(col.required for col in cols) or row.required
                if group_required and not selected_values:
                    return False, (
                        f"Please select at least one option for '{escape(row.text)}' under '{escape(group_label)}'."
                    ), None

                for val in selected_values:
                    matching_col = next((c for c in cols if str(c.value) == val), None)
                    if matching_col:
                        collected_responses.append({
                            'row': row,
                            'col': matching_col,
                            'answer': matching_col.label,
                            'value': matching_col.value,
                            'group_label': group_label,
                        })
                        if not next_q:
                            route = SbsCellRouting.objects.filter(
                                question=question,
                                group_slug=group_slug,
                                row=row,
                                col=matching_col,  # or matching_col / anchor_col in that branch
                            ).select_related('next_question').first()

                            if route and route.next_question:
                                next_q = route.next_question
                            elif matching_col.next_question:
                                next_q = matching_col.next_question

            # --- TEXT (one field per group) ---
            elif input_type == 'text':
                # Template names the input with row+firstCol id, e.g. "matrix_{rowId}_{cols[0].id}"
                field_name = f"matrix_{row.id}_{cols[0].id}"
                val = (request.POST.get(field_name, '') or '').strip()
                group_slug = slugify(group_label)

                is_required = any(col.required for col in cols) or row.required
                if is_required and not val:
                    return False, (
                        f"Please complete '{escape(row.text)}' under '{escape(group_label)}'."
                    ), None

                if val:
                    # Use the first column in the group as the canonical anchor
                    anchor_col = cols[0]
                    collected_responses.append({
                        'row': row,
                        'col': anchor_col,
                        'answer': val,
                        'value': None,
                        'group_label': group_label,
                    })
                    if not next_q:
                        route = SbsCellRouting.objects.filter(
                            question=question,
                            group_slug=group_slug,
                            row=row,
                            col=anchor_col,  # or matching_col / anchor_col in that branch
                        ).select_related('next_question').first()

                        if route and route.next_question:
                            next_q = route.next_question
                        elif anchor_col.next_question:
                            next_q = anchor_col.next_question

            else:
                # Defensive: unknown type -> ignore gracefully
                continue
    return True, collected_responses, next_q


def get_next_question_in_sequence(questions, current_question):
    try:
        idx = questions.index(current_question)
        return questions[idx + 1]
    except (ValueError, IndexError):
        return None


def finalize_submission(*, request, survey, session_key):
    """
    Finalize the current user's in-progress survey run exactly once.
    """
    existing = Submission.objects.filter(user=request.user, survey=survey).first()
    if existing:
        return existing

    start_iso = request.session.get(session_key)
    start_dt = parse_datetime(start_iso) if start_iso else None
    if not start_dt:
        start_dt = now()

    submitted_dt = now()
    duration = int((submitted_dt - start_dt).total_seconds())

    optimal_seconds = None
    if survey.optimal_duration_minutes:
        optimal_seconds = survey.optimal_duration_minutes * 60

    delta = None
    if optimal_seconds is not None:
        delta = duration - optimal_seconds

    submission = Submission.objects.create(
        user=request.user,
        survey=survey,
        started_at=start_dt,
        duration_seconds=duration,
        delta_seconds=delta,
    )

    Response.objects.filter(
        user=request.user,
        survey=survey,
        submission__isnull=True,
    ).update(submission=submission)

    request.user.add_points(survey.points_reward)

    PointsLedger.objects.create(
        user=request.user,
        amount=survey.points_reward,
        type="survey_reward",
        survey_id=survey.id,
        submission_id=submission.id,
        note=f"Completed survey: {survey.title}",
    )

    # Step 5: build normalized analytics rows for this submission
    build_submission_answer_facts(submission)

    return submission
