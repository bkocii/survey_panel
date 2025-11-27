from django.utils.timezone import now
from django.db import transaction
import datetime
from collections import defaultdict
from django.conf import settings
from datetime import timedelta
import json
from django.views.decorators.csrf import csrf_exempt, csrf_protect
from django.views.decorators.http import require_POST
from .services import validate_and_collect_matrix_responses, get_next_question_in_sequence
from django.contrib import messages
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import HttpResponseForbidden, HttpResponseBadRequest, JsonResponse, Http404
from .models import Survey, Response, Choice, Question, Submission, MatrixRow, MatrixColumn
from .forms import SurveyResponseForm, WizardQuestionForm
from .logic import next_displayable, is_visible, safe_next_question, find_next_visible_after
from django.db import models
from django.utils.html import escape
from django.forms import inlineformset_factory
from django.core.paginator import Paginator
from django.db.models import Q
from django.contrib.postgres.search import SearchVector, SearchQuery, SearchRank
from django.db import connection
import re
from django.template.loader import render_to_string
from django.utils.html import mark_safe
from django.contrib.admin.views.decorators import staff_member_required
from django.utils.text import slugify

# # View to list all active surveys, requires login
@login_required
def survey_list(request):
    # IDs of surveys the user has already responded to
    completed_ids = Submission.objects.filter(user=request.user).values_list('survey_id', flat=True)

    # Surveys the user is allowed to access and hasn't completed yet
    surveys = Survey.objects.filter(is_active=True).filter(
        models.Q(groups__in=request.user.groups.all()) | models.Q(groups__isnull=True)
    ).exclude(id__in=completed_ids).distinct()

    return render(request, 'surveys/survey_list.html', {'surveys': surveys})


@login_required
def survey_question(request, survey_id, question_id=None):
    """
    Survey runner with:
      - Back button support via a session-stored navigation path
      - Editable answers (replace instead of duplicate)
      - Visibility-aware forward navigation (safe_next_question)
    """
    survey = get_object_or_404(Survey, id=survey_id, is_active=True)

    # 🔐 Already submitted? Block re-entry
    if Submission.objects.filter(user=request.user, survey=survey).exists():
        return redirect('surveys:already_submitted', survey_id=survey.id)

    # 🔐 Group access
    if survey.groups.exists() and not survey.groups.filter(id__in=request.user.groups.all()).exists():
        return HttpResponseForbidden("Access denied.")

    # 🧭 navigation path kept in session for "Back" support
    path_key = f"survey_{survey.id}_path"

    def get_path():
        return list(request.session.get(path_key, []))

    def set_path(p):
        request.session[path_key] = p
        request.session.modified = True

    def push_to_path(qid: int):
        """Append current question id if it's not already the tail."""
        p = get_path()
        if not p or p[-1] != qid:
            p.append(qid)
            set_path(p)

    def pop_current_and_prev() -> int | None:
        """
        Pops current id (tail) and returns previous id if present.
        If already at the first item, returns None.
        """
        p = get_path()
        if not p:
            return None
        _curr = p.pop()  # remove current
        prev = p[-1] if p else None
        set_path(p)
        return prev

    # ⏱ Start-time tracking (existing)
    session_key = f"survey_{survey.id}_start_time"
    if session_key not in request.session:
        request.session[session_key] = now().isoformat()
    start_time = now().fromisoformat(request.session[session_key])

    # ⏳ Time limit (existing)
    if survey.time_limit_minutes:
        time_passed = (now() - start_time).total_seconds()
        max_time = survey.time_limit_minutes * 60
        time_left = int(max(0, max_time - time_passed))

        if time_left <= 0:
            # time up → finalize early
            request.session.pop(session_key, None)
            # also clean nav path
            request.session.pop(path_key, None)
            if not Submission.objects.filter(user=request.user, survey=survey).exists():
                submission = Submission.objects.create(user=request.user, survey=survey)
                Response.objects.filter(
                    user=request.user, survey=survey, submission__isnull=True
                ).update(submission=submission)
                request.user.add_points(survey.points_reward)
            return redirect('surveys:survey_submit', survey_id=survey.id)
    else:
        time_left = None

    # All questions in fixed order
    all_questions = list(survey.questions.order_by("sort_index", 'id'))

    # 🔍 Resolve which question to show
    if question_id:
        # 🔙 Explicit question id (Back button or routed Next)
        # Show it as-is (we allow editing even if it already has a response).
        question = get_object_or_404(Question, id=question_id, survey=survey)

    else:
        # ➡️ AUTO MODE:
        # Find the first question that is BOTH:
        #   - visible (according to visibility_rules + routing via next_displayable)
        #   - unanswered (no in-progress Response for this user/survey)
        answered_ids = set(
            Response.objects.filter(
                user=request.user,
                survey=survey,
                submission__isnull=True,
            ).values_list("question_id", flat=True)
        )

        visible_unanswered = None

        for base_q in all_questions:
            # From each base question, follow its next_question chain
            # and visibility rules to find the first displayable candidate
            cand = next_displayable(base_q, request.user, survey)
            if not cand:
                continue

            # Skip if that candidate already has an in-progress answer
            has_answer = Response.objects.filter(
                user=request.user,
                survey=survey,
                question=cand,
                submission__isnull=True,
            ).exists()
            if has_answer:
                continue

            # ✅ Found a visible & unanswered question
            visible_unanswered = cand
            break

        if not visible_unanswered:
            # No visible unanswered questions remain → finalize
            request.session.pop(path_key, None)
            if not Submission.objects.filter(user=request.user, survey=survey).exists():
                submission = Submission.objects.create(user=request.user, survey=survey)
                Response.objects.filter(
                    user=request.user, survey=survey, submission__isnull=True
                ).update(submission=submission)
                request.user.add_points(survey.points_reward)
            return redirect('surveys:survey_submit', survey_id=survey.id)

        question = visible_unanswered

    # 🧭 track this question in the path for Back support
    push_to_path(question.id)

    # expose "first step" flag for template (length <= 1 means we're at the first visible question)
    is_first_step = len(get_path()) <= 1

    # Progress
    current_index = all_questions.index(question) + 1
    total_questions = len(all_questions)
    progress_percent = int((current_index / total_questions) * 100)

    # Side-by-side matrix grouping (existing)
    grouped_matrix_columns = defaultdict(list)
    if question.question_type == 'MATRIX' and question.matrix_mode == 'side_by_side':
        columns = question.matrix_columns.all().order_by('group', 'value')
        for col in columns:
            key = col.group or "Ungrouped"
            grouped_matrix_columns[key].append(col)
    grouped_matrix_columns = dict(grouped_matrix_columns)

    # 🆕 helper: replace a single-answer response atomically (delete then insert)
    def replace_single_answer(*, user, survey, question):
        Response.objects.filter(
            user=user, survey=survey, question=question, submission__isnull=True
        ).delete()

    if request.method == 'POST':
        # 🧭 NEW: detect which nav button was clicked
        nav = request.POST.get('nav', 'next')

        # ⬅️ Back: do NOT validate current; just go to previous shown question
        if nav == 'back':
            prev_id = pop_current_and_prev()
            if prev_id:
                return redirect('surveys:survey_question', survey_id=survey.id, question_id=prev_id)
            # no previous → keep current
            return redirect('surveys:survey_question', survey_id=survey.id, question_id=question.id)

        # ➡️ Next: proceed with validation/saving current answers
        answer = request.POST.get('answer')
        next_q = None

        # --- SINGLE-ANSWER TYPES ---
        if question.question_type in ['SINGLE_CHOICE', 'RATING', 'DROPDOWN']:
            if not answer:
                if question.required:
                    messages.error(request, "Please select an option before continuing.")
                    return render(request, 'surveys/survey_question.html', {
                        'survey': survey,
                        'question': question,
                        'current_index': current_index,
                        'total_questions': total_questions,
                        'progress_percent': progress_percent,
                        'previous_response': None,
                        'time_left': time_left,
                        'grouped_matrix_columns': grouped_matrix_columns,
                    })
                else:
                    # 🆕 user cleared selection on a non-required question: wipe existing response
                    replace_single_answer(user=request.user, survey=survey, question=question)
            else:
                try:
                    choice = Choice.objects.get(id=answer, question=question)
                except Choice.DoesNotExist:
                    messages.error(request, "Invalid option selected. Please try again.")
                    return render(request, 'surveys/survey_question.html', {
                        'survey': survey,
                        'question': question,
                        'current_index': current_index,
                        'total_questions': total_questions,
                        'progress_percent': progress_percent,
                        'previous_response': None,
                        'time_left': time_left,
                        'grouped_matrix_columns': grouped_matrix_columns,
                    })

                custom_other = request.POST.get('other_text', '').strip()
                replace_single_answer(user=request.user, survey=survey, question=question)
                Response.objects.create(
                    user=request.user,
                    survey=survey,
                    question=question,
                    choice=choice,
                    text_answer=custom_other if choice.text.lower() == 'other' else '',
                    value=choice.value if choice.value is not None else None,
                )
                next_q = choice.next_question

        elif question.question_type == 'YESNO':
            if question.required and not answer:
                messages.error(request, "This question is required. Please select Yes or No.")
                return render(request, 'surveys/survey_question.html', {
                    'survey': survey,
                    'question': question,
                    'current_index': current_index,
                    'total_questions': total_questions,
                    'progress_percent': progress_percent,
                    'previous_response': None,
                    'time_left': time_left,
                    'grouped_matrix_columns': grouped_matrix_columns,
                })
            if answer and answer.lower() in ['yes', 'no']:
                value = 1 if answer.lower() == "yes" else 0
                replace_single_answer(user=request.user, survey=survey, question=question)
                Response.objects.create(
                    user=request.user,
                    survey=survey,
                    question=question,
                    text_answer=answer.lower(),
                    value=value
                )
            else:
                # 🆕 cleared on non-required → wipe previous
                replace_single_answer(user=request.user, survey=survey, question=question)
            next_q = question.next_question or get_next_question_in_sequence(all_questions, question)

        elif question.question_type == 'NUMBER':
            raw = (answer or '').strip()
            if question.required and raw == '':
                messages.error(request, "This question is required. Please enter a number.")
                return render(request, 'surveys/survey_question.html', {
                    'survey': survey,
                    'question': question,
                    'current_index': current_index,
                    'total_questions': total_questions,
                    'progress_percent': progress_percent,
                    'previous_response': None,
                    'time_left': time_left,
                    'grouped_matrix_columns': grouped_matrix_columns,
                })
            if raw != '':
                try:
                    number_value = float(raw)
                except (TypeError, ValueError):
                    messages.error(request, "Invalid number input.")
                    return render(request, 'surveys/survey_question.html', {
                        'survey': survey,
                        'question': question,
                        'current_index': current_index,
                        'total_questions': total_questions,
                        'progress_percent': progress_percent,
                        'previous_response': None,
                        'time_left': time_left,
                        'grouped_matrix_columns': grouped_matrix_columns,
                    })
                replace_single_answer(user=request.user, survey=survey, question=question)
                Response.objects.create(
                    user=request.user,
                    survey=survey,
                    question=question,
                    text_answer=str(number_value),
                    value=number_value
                )
            else:
                # cleared on non-required
                replace_single_answer(user=request.user, survey=survey, question=question)
            next_q = question.next_question or get_next_question_in_sequence(all_questions, question)

        elif question.question_type == 'SLIDER':
            slider_moved = request.POST.get('slider_moved') == "true"
            answer = request.POST.get('answer')
            if question.required and not slider_moved:
                messages.error(request, "Please move the slider to select a value.")
                return render(request, 'surveys/survey_question.html', {
                    'survey': survey,
                    'question': question,
                    'current_index': current_index,
                    'total_questions': total_questions,
                    'progress_percent': progress_percent,
                    'previous_response': None,
                    'time_left': time_left,
                    'grouped_matrix_columns': grouped_matrix_columns,
                })
            if answer:
                try:
                    slider_value = int(answer)
                except (TypeError, ValueError):
                    messages.error(request, "Invalid slider value.")
                    return render(request, 'surveys/survey_question.html', {
                        'survey': survey,
                        'question': question,
                        'current_index': current_index,
                        'total_questions': total_questions,
                        'progress_percent': progress_percent,
                        'previous_response': None,
                        'time_left': time_left,
                        'grouped_matrix_columns': grouped_matrix_columns,
                    })
                if question.min_value is not None and slider_value < question.min_value:
                    messages.error(request, f"Value must be at least {question.min_value}.")
                    return render(request, 'surveys/survey_question.html', {...})
                if question.max_value is not None and slider_value > question.max_value:
                    messages.error(request, f"Value must be at most {question.max_value}.")
                    return render(request, 'surveys/survey_question.html', {...})
                replace_single_answer(user=request.user, survey=survey, question=question)
                Response.objects.create(
                    user=request.user,
                    survey=survey,
                    question=question,
                    text_answer=str(slider_value),
                    value=slider_value
                )
            else:
                # cleared on non-required
                replace_single_answer(user=request.user, survey=survey, question=question)
            next_q = question.next_question or get_next_question_in_sequence(all_questions, question)

        elif question.question_type == 'DATE':
            if not answer and question.required:
                messages.error(request, "Please select a date.")
                return render(request, 'surveys/survey_question.html', {
                    'survey': survey,
                    'question': question,
                    'current_index': current_index,
                    'total_questions': total_questions,
                    'progress_percent': progress_percent,
                    'previous_response': None,
                    'time_left': time_left,
                    'grouped_matrix_columns': grouped_matrix_columns,
                })
            if answer:
                try:
                    parsed_date = datetime.datetime.strptime(answer, '%Y-%m-%d').date()
                except ValueError:
                    return HttpResponseBadRequest("Invalid date format. Please use YYYY-MM-DD.")
                replace_single_answer(user=request.user, survey=survey, question=question)
                Response.objects.create(
                    user=request.user,
                    survey=survey,
                    question=question,
                    text_answer=parsed_date.isoformat(),
                )
            else:
                replace_single_answer(user=request.user, survey=survey, question=question)

        elif question.question_type == 'GEOLOCATION':
            # Read coords coming from the hidden inputs
            lat = (request.POST.get("latitude") or "").strip()
            lng = (request.POST.get("longitude") or "").strip()

            # Required → must have both lat & lng
            if question.required and (not lat or not lng):
                messages.error(request, "Please select a location on the map.")
                return render(request, 'surveys/survey_question.html', {
                    'survey': survey,
                    'question': question,
                    'current_index': current_index,
                    'total_questions': total_questions,
                    'progress_percent': progress_percent,
                    'previous_response': None,
                    'time_left': time_left,
                    'grouped_matrix_columns': grouped_matrix_columns,
                    'is_first_step': is_first_step,
                })

            # 🆕 Always replace previous in-progress geo answer (edit support)
            replace_single_answer(user=request.user, survey=survey, question=question)

            # If user actually picked a point (or it’s optional), save it
            if lat and lng:
                Response.objects.create(
                    user=request.user,
                    survey=survey,
                    question=question,
                    latitude=lat,
                    longitude=lng,
                )

            # Normal forward routing
            next_q = question.next_question or get_next_question_in_sequence(all_questions, question)

        elif question.question_type == 'TEXT':
            txt = (answer or '').strip()
            if question.required and not txt:
                messages.error(request, "This question is required. Please enter your answer.")
                return render(request, 'surveys/survey_question.html', {
                    'survey': survey,
                    'question': question,
                    'current_index': current_index,
                    'total_questions': total_questions,
                    'progress_percent': progress_percent,
                    'previous_response': None,
                    'time_left': time_left,
                    'grouped_matrix_columns': grouped_matrix_columns,
                })
            # Replace whether empty or not (empty = clearing on non-required)
            replace_single_answer(user=request.user, survey=survey, question=question)
            if txt:
                Response.objects.create(
                    user=request.user,
                    survey=survey,
                    question=question,
                    text_answer=txt,
                )
            next_q = question.next_question or get_next_question_in_sequence(all_questions, question)

        elif question.question_type in ['PHOTO_UPLOAD', 'PHOTO_MULTI_UPLOAD', 'VIDEO_UPLOAD', 'AUDIO_UPLOAD']:
            files = request.FILES.getlist('answer_file') if question.allow_multiple_files else [
                request.FILES.get('answer_file')
            ]
            allowed_types = {
                'PHOTO_UPLOAD': ['image/jpeg', 'image/png'],
                'PHOTO_MULTI_UPLOAD': ['image/jpeg', 'image/png'],
                'VIDEO_UPLOAD': ['video/mp4', 'video/quicktime'],
                'AUDIO_UPLOAD': ['audio/mpeg', 'audio/wav', 'audio/ogg'],
            }
            # 🆕 if not multiple, replace previous
            if not question.allow_multiple_files:
                replace_single_answer(user=request.user, survey=survey, question=question)
            for file in files:
                if not file:
                    continue
                if file.content_type not in allowed_types[question.question_type]:
                    return HttpResponseBadRequest("Invalid file type.")
                Response.objects.create(
                    user=request.user,
                    survey=survey,
                    question=question,
                    media_upload=file,
                )

        # --- MULTI-ANSWER TYPES ---
        elif question.question_type == 'MULTI_CHOICE':
            selected = request.POST.getlist('answer')
            if not selected:
                if question.required:
                    messages.error(request, "Please select at least one option before continuing.")
                    return render(request, 'surveys/survey_question.html', {
                        'survey': survey,
                        'question': question,
                        'current_index': current_index,
                        'total_questions': total_questions,
                        'progress_percent': progress_percent,
                        'previous_response': None,
                        'time_left': time_left,
                        'grouped_matrix_columns': grouped_matrix_columns,
                    })
                # 🆕 cleared on non-required → wipe previous
                Response.objects.filter(
                    user=request.user, survey=survey, question=question, submission__isnull=True
                ).delete()
            else:
                # 🆕 replace entire set
                Response.objects.filter(
                    user=request.user, survey=survey, question=question, submission__isnull=True
                ).delete()
                seen = set()
                for ans_id in selected:
                    if ans_id in seen:
                        continue
                    seen.add(ans_id)
                    try:
                        choice = Choice.objects.get(id=ans_id, question=question)
                    except Choice.DoesNotExist:
                        continue
                    custom_other = request.POST.get('other_text', '').strip()
                    Response.objects.create(
                        user=request.user,
                        survey=survey,
                        question=question,
                        choice=choice,
                        text_answer=custom_other if choice.text.lower() == 'other' else '',
                        value=choice.value if choice.value is not None else None,
                    )
                    if not next_q and choice.next_question:
                        next_q = choice.next_question

        elif question.question_type == 'IMAGE_CHOICE':
            selected_ids = request.POST.getlist('answer')
            if question.required and not selected_ids:
                messages.error(request, "Please select at least one option.")
                return render(request, 'surveys/survey_question.html', {
                    'survey': survey,
                    'question': question,
                    'current_index': current_index,
                    'total_questions': total_questions,
                    'progress_percent': progress_percent,
                    'previous_response': None,
                    'time_left': time_left,
                    'grouped_matrix_columns': grouped_matrix_columns,
                })
            # 🆕 replace entire set (even if empty to clear)
            Response.objects.filter(
                user=request.user, survey=survey, question=question, submission__isnull=True
            ).delete()
            for choice_id in selected_ids:
                try:
                    choice = Choice.objects.get(id=choice_id, question=question)
                except Choice.DoesNotExist:
                    continue
                Response.objects.create(
                    user=request.user,
                    survey=survey,
                    question=question,
                    choice=choice,
                    value=choice.value,
                )
                if not next_q and choice.next_question:
                    next_q = choice.next_question

        # 🆕 IMAGE_RATING (per-image rating with flexible scale)
        elif question.question_type == 'IMAGE_RATING':
            # Define rating scale bounds (use min/max_value if set, else 1–5)
            min_rating = int(question.min_value) if question.min_value is not None else 1
            max_rating = int(question.max_value) if question.max_value is not None else 5
            if min_rating > max_rating:
                min_rating, max_rating = max_rating, min_rating

            # Check if user rated at least one image
            has_any_rating = any(
                request.POST.get(f'rating_{c.id}')
                for c in question.choices.all()
            )

            if question.required and not has_any_rating:
                messages.error(request, "Please rate at least one image.")
                return render(request, 'surveys/survey_question.html', {
                    'survey': survey,
                    'question': question,
                    'current_index': current_index,
                    'total_questions': total_questions,
                    'progress_percent': progress_percent,
                    'previous_response': None,
                    'time_left': time_left,
                    'grouped_matrix_columns': grouped_matrix_columns,
                })

            # Replace previous ratings (for this in-progress submission)
            Response.objects.filter(
                user=request.user,
                survey=survey,
                question=question,
                submission__isnull=True,
            ).delete()

            for choice in question.choices.all():
                rating_str = request.POST.get(f'rating_{choice.id}')
                if not rating_str:
                    continue

                try:
                    rating_val = int(rating_str)
                except ValueError:
                    continue  # ignore invalid inputs silently (or you can error out)

                # Enforce bounds
                if rating_val < min_rating or rating_val > max_rating:
                    messages.error(request, "Invalid rating value.")
                    return render(request, 'surveys/survey_question.html', {
                        'survey': survey,
                        'question': question,
                        'current_index': current_index,
                        'total_questions': total_questions,
                        'progress_percent': progress_percent,
                        'previous_response': None,
                        'time_left': time_left,
                        'grouped_matrix_columns': grouped_matrix_columns,
                    })

                # ✅ Store the rating itself as `value`, and also in `text_answer`
                Response.objects.create(
                    user=request.user,
                    survey=survey,
                    question=question,
                    choice=choice,
                    text_answer=str(rating_val),
                    value=rating_val,
                )

            # Normal forward routing
            next_q = question.next_question or get_next_question_in_sequence(all_questions, question)

        # --- MATRIX TYPES ---
        elif question.question_type == 'MATRIX':
            if question.matrix_mode == 'side_by_side':
                # Validate + collect from POST
                is_valid, result, next_q = validate_and_collect_matrix_responses(request, survey, question)
                if not is_valid:
                    messages.error(request, result)
                    return render(request, 'surveys/survey_question.html', {
                        'survey': survey,
                        'question': question,
                        'current_index': current_index,
                        'total_questions': total_questions,
                        'progress_percent': progress_percent,
                        'previous_response': None,
                        'time_left': time_left,
                        'grouped_matrix_columns': grouped_matrix_columns,
                        'submitted_data': request.POST,
                    })

                # 🔍 Optional debug: see how many cells we’re saving
                try:
                    messages.debug(request, f"SBS: collected {len(result)} cells for q#{question.id}")
                except Exception:
                    pass

                # ✅ FULL REPLACE for this question (in-progress only)
                from django.db import transaction
                with transaction.atomic():
                    deleted_ct, _ = Response.objects.filter(
                        user=request.user,
                        survey=survey,
                        question=question,
                        submission__isnull=True,  # only the current in-progress run
                    ).delete()

                    try:
                        messages.debug(request, f"SBS: deleted {deleted_ct} old cells for q#{question.id}")
                    except Exception:
                        pass

                    if result:
                        Response.objects.bulk_create([
                            Response(
                                user=request.user,
                                survey=survey,
                                question=question,
                                matrix_row=r['row'],
                                matrix_column=r['col'],
                                text_answer=r['answer'],
                                value=r['value'],
                                group_label=r.get('group_label'),
                            )
                            for r in result
                        ])
                        try:
                            messages.debug(request, f"SBS: inserted {len(result)} new cells for q#{question.id}")
                        except Exception:
                            pass
                    else:
                        try:
                            messages.info(request, f"SBS: no values posted for q#{question.id} (cleared).")
                        except Exception:
                            pass

            elif question.matrix_mode == 'multi':
                # 🆕 replace entire set before re-adding
                Response.objects.filter(
                    user=request.user, survey=survey, question=question, submission__isnull=True
                ).delete()
                collected_responses = []
                next_q = None
                for row in question.matrix_rows.all():
                    row_has_any = False
                    for col in question.matrix_columns.all():
                        field_name = f"matrix_{row.id}_{col.id}"
                        submitted_values = request.POST.getlist(field_name)
                        if submitted_values:
                            row_has_any = True
                            for val in submitted_values:
                                collected_responses.append({
                                    'row': row,
                                    'col': col,
                                    'answer': col.label,
                                    'value': val,
                                })
                                if not next_q and col.next_question:
                                    next_q = col.next_question
                        elif col.required:
                            messages.error(
                                request,
                                f"Please select at least one option for column '{col.label}' in row '{row.text}'."
                            )
                            return render(request, 'surveys/survey_question.html', {
                                'survey': survey,
                                'question': question,
                                'current_index': current_index,
                                'total_questions': total_questions,
                                'progress_percent': progress_percent,
                                'previous_response': None,
                                'time_left': time_left,
                                'submitted_data': request.POST,
                            })
                    if row.required and not row_has_any:
                        messages.error(request, f"Please select at least one option in row '{row.text}'.")
                        return render(request, 'surveys/survey_question.html', {
                            'survey': survey,
                            'question': question,
                            'current_index': current_index,
                            'total_questions': total_questions,
                            'progress_percent': progress_percent,
                            'previous_response': None,
                            'time_left': time_left,
                            'submitted_data': request.POST,
                        })
                for r in collected_responses:
                    Response.objects.create(
                        user=request.user,
                        survey=survey,
                        question=question,
                        matrix_row=r['row'],
                        matrix_column=r['col'],
                        text_answer=r['answer'],
                        value=r['value'],
                    )

            else:  # matrix single-select per row
                # 🆕 replace entire set before re-adding
                Response.objects.filter(
                    user=request.user, survey=survey, question=question, submission__isnull=True
                ).delete()
                collected_responses = []
                next_q = None
                for row in question.matrix_rows.all():
                    field_name = f"matrix_{row.id}"
                    selected_val = request.POST.get(field_name)
                    if not selected_val:
                        if row.required:
                            messages.error(request, f"Please select an option in row '{row.text}'.")
                            return render(request, 'surveys/survey_question.html', {
                                'survey': survey,
                                'question': question,
                                'current_index': current_index,
                                'total_questions': total_questions,
                                'progress_percent': progress_percent,
                                'previous_response': None,
                                'time_left': time_left,
                                'submitted_data': request.POST,
                            })
                        continue
                    matching_col = next((col for col in question.matrix_columns.all()
                                         if str(col.value) == selected_val), None)
                    if not matching_col:
                        messages.error(request, f"Invalid selection in row '{row.text}'.")
                        return render(request, 'surveys/survey_question.html', {
                            'survey': survey,
                            'question': question,
                            'current_index': current_index,
                            'total_questions': total_questions,
                            'progress_percent': progress_percent,
                            'previous_response': None,
                            'time_left': time_left,
                            'submitted_data': request.POST,
                        })
                    collected_responses.append({
                        'row': row,
                        'col': matching_col,
                        'answer': matching_col.label,
                        'value': matching_col.value,
                    })
                    if not next_q and matching_col.next_question:
                        next_q = matching_col.next_question
                for r in collected_responses:
                    Response.objects.create(
                        user=request.user,
                        survey=survey,
                        question=question,
                        matrix_row=r['row'],
                        matrix_column=r['col'],
                        text_answer=r['answer'],
                        value=r['value'],
                    )

        # If no explicit next_q was determined by branching, fall back to question.next or linear
        if not next_q:
            if 'choice' in locals() and choice and question.question_type in ['SINGLE_CHOICE', 'RATING', 'DROPDOWN', 'IMAGE_CHOICE'] \
               and not getattr(question, 'allows_multiple', False) and choice.next_question:
                next_q = choice.next_question
            elif question.next_question:
                next_q = question.next_question
            else:
                try:
                    idx = all_questions.index(question)
                    next_q = all_questions[idx + 1]
                except IndexError:
                    next_q = None

        # ✅ Visibility-safe forward navigation with fallback
        next_candidate = safe_next_question(next_q, question, all_questions, request.user, survey)
        if next_candidate:
            return redirect('surveys:survey_question', survey_id=survey.id, question_id=next_candidate.id)
        else:
            # Finalize: no visible questions remain
            if not Submission.objects.filter(user=request.user, survey=survey).exists():
                duration = int((now() - start_time).total_seconds())
                submission = Submission.objects.create(user=request.user, survey=survey, duration_seconds=duration)
                Response.objects.filter(
                    user=request.user, survey=survey, submission__isnull=True
                ).update(submission=submission)
                request.user.add_points(survey.points_reward)
            # 🧹 clear timers + path
            request.session.pop(session_key, None)
            request.session.pop(path_key, None)
            return redirect('surveys:survey_submit', survey_id=survey.id)

    # --- AFTER POST block: GET / final render path ---

    # All in-progress responses for this question
    responses_qs = Response.objects.filter(
        user=request.user,
        survey=survey,
        question=question,
        submission__isnull=True,
    )

    # Single-response convenience (TEXT, NUMBER, YESNO, DATE, SLIDER, GEO, etc.)
    previous_response = responses_qs.first()

    # Prefill for choice-based questions (you already use this in templates for SC/MC/etc.)
    selected_choice_ids = set(
        responses_qs.values_list("choice_id", flat=True)
    )

    # 🆕 Prefill for GEOLOCATION (if used)
    geo_lat = None
    geo_lng = None
    if question.question_type == "GEOLOCATION" and previous_response:
        geo_lat = previous_response.latitude
        geo_lng = previous_response.longitude

    # 🆕 Prefill for IMAGE_RATING: { "<choice_id>": "<rating 1-5>" }
    image_ratings = {}
    if question.question_type == "IMAGE_RATING":
        for r in responses_qs:
            if r.choice_id and r.text_answer:
                image_ratings[str(r.choice_id)] = str(r.text_answer)

    # 🆕 Prefill for all MATRIX modes via `submitted_data`
    submitted_data = {}
    if question.question_type == "MATRIX":
        from django.utils.text import slugify

        # preload all matrix responses for this question
        m_resps = list(
            responses_qs.select_related("matrix_row", "matrix_column")
        )

        # index responses by row_id
        by_row: dict[int, list[Response]] = {}
        for r in m_resps:
            by_row.setdefault(r.matrix_row_id, []).append(r)

        # --- side_by_side mode (existing logic, now inside the MATRIX block) ---
        if question.matrix_mode == "side_by_side":
            for row in question.matrix_rows.all():
                row_resps = by_row.get(row.id, [])

                # index row's responses by column id for quick lookup
                row_by_col_id = {r.matrix_column_id: r for r in row_resps}

                for group_label, cols in grouped_matrix_columns.items():
                    if not cols:
                        continue

                    input_type = cols[0].input_type
                    group_slug = slugify(group_label)

                    # collect ids for this group
                    col_ids = [c.id for c in cols]

                    # -------- SELECT (one value per row+group) --------
                    if input_type == "select":
                        chosen_col = next(
                            (c for c in cols if c.id in row_by_col_id),
                            None,
                        )
                        if chosen_col is not None:
                            full_field_name = f"matrix_{row.id}_{group_slug}"
                            submitted_data[full_field_name] = str(chosen_col.value)

                    # -------- RADIO (one value per row+group) --------
                    elif input_type == "radio":
                        chosen_col = next(
                            (c for c in cols if c.id in row_by_col_id),
                            None,
                        )
                        if chosen_col is not None:
                            radio_name = f"matrix_{row.id}_{group_slug}"
                            submitted_data[radio_name] = str(chosen_col.value)

                    # -------- CHECKBOX (multiple values per row+group) --------
                    elif input_type == "checkbox":
                        checked_vals: list[str] = []
                        for c in cols:
                            if c.id in row_by_col_id:
                                checked_vals.append(str(c.value))
                        if checked_vals:
                            checkbox_name = f"matrix_{row.id}_{group_slug}"
                            submitted_data[checkbox_name] = checked_vals

                    # -------- TEXT (one field per row+group) --------
                    elif input_type == "text":
                        anchor_col = cols[0]
                        resp = row_by_col_id.get(anchor_col.id)
                        if resp and resp.text_answer:
                            field_name = f"matrix_{row.id}_{anchor_col.id}"
                            submitted_data[field_name] = resp.text_answer

                    # anything else: ignore

        # --- multi mode: multiple columns per row (checkbox grid) ---
        elif question.matrix_mode == "multi":
            # template:
            #   {% with row.id|concat_ids:col.id as field_name %}
            #       name="{{ field_name }}"
            #       value="{{ col.value }}"
            #
            # concat_ids is assumed to produce "matrix_{row.id}_{col.id}"
            for row in question.matrix_rows.all():
                row_resps = by_row.get(row.id, [])
                # index row responses by column id
                row_by_col_id = {r.matrix_column_id: r for r in row_resps}

                for col in question.matrix_columns.all():
                    resp = row_by_col_id.get(col.id)
                    if not resp:
                        continue
                    # field_name must match the template & validator:
                    # field_name = f"matrix_{row.id}_{col.id}"
                    field_name = f"matrix_{row.id}_{col.id}"
                    # we just need "something" equal to col.value so the equality check passes
                    submitted_data[field_name] = str(col.value)

        # --- default: single-select per row (radio per row) ---
        else:
            # template:
            #   row_name = "matrix_" + str(row.id)
            #   name="{{ row_name }}"
            #   value="{{ col.value }}"
            for row in question.matrix_rows.all():
                row_resps = by_row.get(row.id, [])
                if not row_resps:
                    continue
                # should be at most one per row; take the first
                r = row_resps[0]
                col = r.matrix_column
                if not col:
                    continue
                row_name = f"matrix_{row.id}"
                submitted_data[row_name] = str(col.value)

    # 🆕 Prefill for IMAGE_RATING
    image_ratings = {}
    image_rating_scale = []

    if question.question_type == "IMAGE_RATING":
        # load all existing ratings (in-progress)
        rating_resps = Response.objects.filter(
            user=request.user,
            survey=survey,
            question=question,
            submission__isnull=True,
        )

        for r in rating_resps:
            if r.choice_id and (r.text_answer or r.value is not None):
                # prefer text_answer, fallback to value
                image_ratings[str(r.choice_id)] = str(
                    r.text_answer or r.value
                )

        # derive the scale from question.min/max_value (fallback 1–5)
        min_rating = int(question.min_value) if question.min_value is not None else 1
        max_rating = int(question.max_value) if question.max_value is not None else 5
        if min_rating > max_rating:
            min_rating, max_rating = max_rating, min_rating

        image_rating_scale = list(range(min_rating, max_rating + 1))

    return render(request, 'surveys/survey_question.html', {
        'survey': survey,
        'question': question,
        'current_index': current_index,
        'total_questions': total_questions,
        'progress_percent': progress_percent,

        # existing
        'time_left': time_left,
        'grouped_matrix_columns': dict(grouped_matrix_columns),
        'is_first_step': is_first_step,

        # prefill helpers
        'previous_response': previous_response,
        'selected_choice_ids': selected_choice_ids,
        'submitted_data': submitted_data,  # used by SBS matrix template
        'geo_lat': geo_lat,
        'geo_lng': geo_lng,
        'image_ratings': image_ratings,

        # 🆕 image rating helpers
        'image_ratings': image_ratings,
        'image_rating_scale': image_rating_scale,
    })


@login_required
def survey_submit(request, survey_id):
    survey = get_object_or_404(Survey, id=survey_id, is_active=True)

    # Prevent awarding points multiple times if needed
    if not Response.objects.filter(user=request.user, survey=survey).exists():
        return redirect('surveys:survey_list')  # No answers? Don't reward

    return render(request, 'surveys/survey_submit.html', {
        'survey': survey,
        'rewarded': survey.points_reward,
    })


@login_required
def already_submitted(request, survey_id):
    survey = get_object_or_404(Survey, id=survey_id)
    return render(request, 'surveys/already_submitted.html', {'survey': survey})


def get_question_data(request, question_id):
    print("🔍 API HIT:", question_id)
    try:
        question = Question.objects.get(pk=question_id)
    except Question.DoesNotExist:
        raise Http404("Question not found")

    # Serialize choices
    choices = list(
        Choice.objects.filter(question=question).values("id", "text", "value", "next_question_id")
    )

    # Serialize matrix rows and columns
    matrix_rows = list(
        MatrixRow.objects.filter(question=question).values("id", "text", "value", "required")
    )
    matrix_cols = list(
        MatrixColumn.objects.filter(question=question).values(
            "id", "label", "value", "input_type", "required", "next_question_id", "group", "order"
        )
    )

    return JsonResponse({
        "id": question.id,
        "code": question.code,
        "text": question.text,
        "question_type": question.question_type,
        "required": question.required,
        "helper_text": question.helper_text,
        "matrix_mode": question.matrix_mode,
        "min_value": question.min_value,
        "max_value": question.max_value,
        "step_value": question.step_value,
        "allow_multiple_files": question.allow_multiple_files,
        "allows_multiple": question.allows_multiple,
        "helper_media": question.helper_media.url if question.helper_media else None,
        "helper_media_type": question.helper_media_type,
        "next_question_id": question.next_question.id if question.next_question else None,

        "choices": choices,
        "matrix_rows": matrix_rows,
        "matrix_cols": matrix_cols,
    })


def _using_postgres():
    return connection.vendor == "postgresql"


def _tsquery_prefix(q: str) -> str | None:
    # turns "mc 1" -> "mc:* & 1:*" (prefix match)
    terms = re.findall(r"\w+", q or "")
    if not terms:
        return None
    return " & ".join(t + ":*" for t in terms)


def question_lookup(request):
    q = (request.GET.get("q") or "").strip()
    page = max(int(request.GET.get("page", 1)), 1)
    page_size = min(max(int(request.GET.get("page_size", 20)), 1), 50)

    qs = Question.objects.only("id", "code", "text")

    if q:
        prefix_q = Q(code__istartswith=q) | Q(text__icontains=q)

        if _using_postgres():
            vector = SearchVector("code", weight="A", config="simple") + SearchVector("text", weight="B", config="simple")
            raw = _tsquery_prefix(q)
            if raw:
                query = SearchQuery(raw, search_type="raw", config="simple")  # enables ':*' prefix
                qs = qs.annotate(rank=SearchRank(vector, query)).filter(prefix_q | Q(rank__gte=0.001)).order_by("-rank", "-id")
            else:
                qs = qs.filter(prefix_q).order_by("-id")
        else:
            qs = qs.filter(prefix_q).order_by("-id")
    else:
        qs = qs.order_by("-id")

    p = Paginator(qs, page_size)
    page_obj = p.get_page(page)
    results = [{"id": o.id, "label": f"{o.code or '(no code)'} — {o.text[:100]}"} for o in page_obj.object_list]
    return JsonResponse({"results": results, "has_next": page_obj.has_next(), "page": page_obj.number})


def get_question_preview_html(request, question_id):
    question = get_object_or_404(Question, id=question_id)
    # Build groups for side_by_side
    grouped = {}
    if question.question_type == 'MATRIX' and question.matrix_mode == 'side_by_side':
        from collections import defaultdict
        cols = question.matrix_columns.all().order_by('group', 'value')
        g = defaultdict(list)
        for c in cols:
            g[c.group or "Ungrouped"].append(c)
        grouped = dict(g)

    html = render_to_string(
        "surveys/_question_display.html",
        {"question": question, "preview": True, "grouped_matrix_columns": grouped},
        request=request,
    )
    return JsonResponse({"html": html})


def _group_matrix_columns(question):
    grouped = defaultdict(list)
    for col in question.matrix_columns.all().order_by('group', 'value'):
        key = col.group or "Ungrouped"
        grouped[key].append(col)
    # Convert to normal dict to preserve template compatibility (items)
    return dict(grouped)


@staff_member_required
def question_fragment(request, pk: int):
    """
    Returns HTML for a single question using templates/surveys/_question_display.html
    Used by the admin wizard preview. Read-only, no side-effects.
    """
    q = get_object_or_404(Question, pk=pk)

    ctx = {
        "question": q,
        "preview": True,  # lets the partial know we're in preview (if you want to branch)
        "grouped_matrix_columns": _group_matrix_columns(q),
        "submitted_data": None,  # not needed for preview
    }
    html = render_to_string("surveys/_question_display.html", ctx, request=request)
    # Optional small header meta for your card
    return JsonResponse({
        "id": q.id,
        "code": q.code or "",
        "question_type": q.question_type,
        "sort_index": q.sort_index,
        "text": q.text or "",
        "html": html,
    })


def survey_preview(request, survey_id: int):
    survey = get_object_or_404(Survey, pk=survey_id)
    questions = (
        Question.objects.filter(survey=survey)
        .prefetch_related("choices", "matrix_rows", "matrix_columns")
        .order_by("sort_index", "id")
    )
    total = questions.count()
    if total == 0:
        return render(request, "surveys/preview_run.html", {
            "survey": survey,
            "preview_mode": True,
            "question": None,
            "total_questions": 0,
            "current_index": 0,
            "progress_percent": 0,
        })

    try:
        idx = max(0, min(int(request.GET.get("idx", 0)), total - 1))
    except ValueError:
        idx = 0

    question = questions[idx]
    progress_percent = round(((idx + 1) / total) * 100)

    return render(request, "surveys/preview_run.html", {
        "survey": survey,
        "preview_mode": True,
        "question": question,
        "grouped_matrix_columns": _group_matrix_columns(question),  # ✅ needed for SBS
        "submitted_data": None,                                     # keeps partial happy
        "total_questions": total,
        "current_index": idx + 1,
        "progress_percent": progress_percent,
        "prev_url": (f"?idx={idx-1}" if idx > 0 else None),
        "next_url": (f"?idx={idx+1}" if idx < total-1 else None),
    })


@staff_member_required
@require_POST
def reorder_questions(request, survey_id):
    import json
    survey = get_object_or_404(Survey, pk=survey_id)
    data = json.loads(request.body.decode("utf-8"))
    ids = data.get("ids", [])
    # validate belong to survey
    valid = set(Question.objects.filter(survey=survey, id__in=ids).values_list("id", flat=True))
    new_order = [int(i) for i in ids if int(i) in valid]
    with transaction.atomic():
        for idx, qid in enumerate(new_order):
            Question.objects.filter(pk=qid).update(sort_index=idx)
    return JsonResponse({"ok": True})


def _to_int_or_none(v):
    try:
        iv = int(v)
        return iv if iv > 0 else None
    except (TypeError, ValueError):
        return None


@csrf_protect
@staff_member_required
@require_POST
def set_routing(request):
    try:
        data = json.loads(request.body.decode('utf-8'))
    except Exception:
        return HttpResponseBadRequest('Invalid JSON')

    scope = data.get('scope')
    qid   = data.get('question_id')          # ✅ always included now
    tgt   = data.get('target_question_id')   # '' means clear

    # Parse ints (allow None on target to clear)
    try:
        qid_int = int(qid)
    except (TypeError, ValueError):
        return HttpResponseBadRequest('Invalid question id')

    try:
        target_q = Question.objects.filter(pk=int(tgt)).first() if tgt else None
    except (TypeError, ValueError):
        return HttpResponseBadRequest('Invalid target question')

    # Ensure the source question exists (and you could also ensure the user can edit it)
    q = Question.objects.filter(pk=qid_int).first()
    if not q:
        return HttpResponseBadRequest('Source question not found')

    try:
        if scope == 'choice':
            # must belong to q
            try:
                choice_id = int(data.get('choice_id'))
            except (TypeError, ValueError):
                return HttpResponseBadRequest('Invalid choice id')

            ch = Choice.objects.filter(pk=choice_id).first()
            if not ch:
                return HttpResponseBadRequest('Invalid choice')

            if ch.question_id != qid_int:
                return HttpResponseBadRequest('Choice does not belong to this question')

            ch.next_question = target_q
            ch.save(update_fields=['next_question'])

        elif scope == 'matrix_col':
            try:
                col_id = int(data.get('matrix_col_id'))
            except (TypeError, ValueError):
                return HttpResponseBadRequest('Invalid matrix column id')

            mc = MatrixColumn.objects.filter(pk=col_id).first()
            if not mc:
                return HttpResponseBadRequest('Invalid matrix column')

            if mc.question_id != qid_int:
                return HttpResponseBadRequest('Matrix column does not belong to this question')

            mc.next_question = target_q
            mc.save(update_fields=['next_question'])

        elif scope == 'question':
            q.next_question = target_q
            q.save(update_fields=['next_question'])

        else:
            return HttpResponseBadRequest('Invalid scope')

    except Exception as e:
        # Unexpected errors → structured JSON helps debugging
        return JsonResponse({'ok': False, 'error': str(e)}, status=400)

    return JsonResponse({'ok': True})


def _answers_so_far(submission) -> dict:
    """
    Build a minimal lookup map for display logic:
    - Prefer question.code as key if present, else question.id
    - Value is a single scalar for single choice, list or scalar depending on your schema
    """
    amap = {}
    if not submission:
        return amap
    # Adjust to your Response model fields
    qs = submission.response_set.select_related("question", "choice").all()
    for r in qs:
        key = r.question.code or r.question_id
        value = None
        # If you store choice.value, use that; else use choice.id or text.
        if r.choice_id:
            # MULTI: you may want to aggregate into list; MVP: last wins or normalize as int
            value = getattr(r.choice, "value", None) or r.choice_id
        elif r.text_answer not in (None, ""):
            # try to coerce numeric text to int/float if needed
            try:
                value = float(r.text_answer) if "." in r.text_answer else int(r.text_answer)
            except Exception:
                value = r.text_answer
        else:
            value = None
        amap[key] = value
    return amap

def _is_visible(question: Question, submission) -> bool:
    amap = _answers_so_far(submission)
    return eval_rules(question.visibility_rules or {}, amap)

def _next_displayable(start_q: Question, submission) -> Question | None:
    """
    Walk forward using your existing routing until we find a visible question
    or we run out. For MVP, we follow question.next_question chain.
    If you also route via choices/matrix columns, make sure your “current answer”
    logic passes the right ‘next’ when you call this helper.
    """
    q = start_q
    visited = set()
    while q:
        if q.pk in visited:
            break  # guard against loops
        visited.add(q.pk)
        if _is_visible(q, submission):
            return q
        q = q.next_question  # fall forward along your existing pointer
    return None