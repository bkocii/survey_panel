from django.utils.timezone import now
import datetime
from datetime import timedelta
from .services import get_next_question_in_sequence
from django.contrib import messages
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import HttpResponseForbidden, HttpResponseBadRequest
from .models import Survey, Response, Choice, Question, Submission, MatrixRow, MatrixColumn
from .forms import SurveyResponseForm
from django.db import models


# # View to list all active surveys, requires login
@login_required
def survey_list(request):
    # IDs of surveys the user has already responded to
    completed_ids = Response.objects.filter(user=request.user).values_list('survey_id', flat=True)

    # Surveys the user is allowed to access and hasn't completed yet
    surveys = Survey.objects.filter(is_active=True).filter(
        models.Q(groups__in=request.user.groups.all()) | models.Q(groups__isnull=True)
    ).exclude(id__in=completed_ids).distinct()

    return render(request, 'surveys/survey_list.html', {'surveys': surveys})
#
# View to display and process a specific survey, requires login
# @login_required
# def survey_detail(request, survey_id):
#     survey = get_object_or_404(Survey, id=survey_id, is_active=True)  # Fetch survey or return 404
#     # Check if user has access (in survey's groups or no groups specified)
#     if survey.groups.exists() and not survey.groups.filter(id__in=request.user.groups.all()).exists():
#         return HttpResponseForbidden("You do not have permission to access this survey.")
#     # Check if user has already completed the survey
#     if Response.objects.filter(user=request.user, survey=survey).exists():
#         return render(request, 'surveys/survey_detail.html', {'survey': survey, 'completed': True})
#
#     # Handle form submission
#     if request.method == 'POST':
#         form = SurveyResponseForm(request.POST, survey=survey)  # Initialize form with POST data
#         if form.is_valid():
#             # Save responses for each question
#             for question in survey.questions.all():
#                 answer = form.cleaned_data.get(f'question_{question.id}')
#                 Response.objects.create(
#                     user=request.user,
#                     survey=survey,
#                     question=question,
#                     choice_id=answer.id if question.question_type == 'MC' else None,  # Use answer.id for MC questions
#                     text_answer=answer if question.question_type == 'TEXT' else ''  # Save text for text questions
#                 )
#             request.user.add_points(survey.points_reward)  # Award points to user
#             return redirect('surveys:survey_list')  # Redirect to survey list using namespaced URL
#     else:
#         form = SurveyResponseForm(survey=survey)  # Initialize empty form
#
#     # Render survey detail template with form
#     return render(request, 'surveys/survey_detail.html', {'survey': survey, 'form': form})


@login_required
def survey_question(request, survey_id, question_id=None):
    survey = get_object_or_404(Survey, id=survey_id, is_active=True)

    # If already submitted, redirect
    if Submission.objects.filter(user=request.user, survey=survey).exists():
        return redirect('surveys:already_submitted', survey_id=survey.id)

    # Check group access
    if survey.groups.exists() and not survey.groups.filter(id__in=request.user.groups.all()).exists():
        return HttpResponseForbidden("Access denied.")

        # ⏱ Store or retrieve survey start time
    session_key = f"survey_{survey.id}_start_time"
    if session_key not in request.session:
        request.session[session_key] = now().isoformat()
    start_time = now().fromisoformat(request.session[session_key])

    # ⏳ Enforce time limit
    if survey.time_limit_minutes:
        time_passed = (now() - start_time).total_seconds()
        max_time = survey.time_limit_minutes * 60
        time_left = int(max(0, max_time - time_passed))

        if time_left <= 0:
            # Clear session start time
            request.session.pop(session_key, None)
            # Submit survey early
            if not Submission.objects.filter(user=request.user, survey=survey).exists():
                submission = Submission.objects.create(user=request.user, survey=survey)
                Response.objects.filter(user=request.user, survey=survey, submission__isnull=True).update(
                    submission=submission)
                request.user.add_points(survey.points_reward)
            return redirect('surveys:survey_submit', survey_id=survey.id)
    else:
        time_left = None

    # All ordered questions
    all_questions = list(survey.questions.order_by('id'))

    if question_id:
        question = get_object_or_404(Question, id=question_id, survey=survey)
    else:
        # Get first unanswered
        answered_qs = Response.objects.filter(user=request.user, survey=survey).values_list('question_id', flat=True)
        question = survey.questions.exclude(id__in=answered_qs).order_by('id').first()
        if not question:
            # All questions answered → finalize
            submission = Submission.objects.create(user=request.user, survey=survey)
            # Attach all existing responses to submission
            Response.objects.filter(user=request.user, survey=survey, submission__isnull=True).update(submission=submission)
            request.user.add_points(survey.points_reward)
            return redirect('surveys:survey_submit', survey_id=survey.id)

        # ⏳ Add progress tracking
    current_index = all_questions.index(question) + 1
    total_questions = len(all_questions)
    progress_percent = int((current_index / total_questions) * 100)

    if request.method == 'POST':
        answer = request.POST.get('answer')

        # Avoid duplicate
        if not Response.objects.filter(user=request.user, survey=survey, question=question).exists():
            if question.question_type in ['MC', 'RATING', 'DROPDOWN']:
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
                        })
                    else:
                        # Not required and no answer — skip saving response
                        pass
                else:
                    try:
                        choice = Choice.objects.get(id=answer)
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
                        })

                    custom_other = request.POST.get('other_text', '').strip()

                    Response.objects.create(
                        user=request.user,
                        survey=survey,
                        question=question,
                        choice=choice,
                        text_answer=custom_other if choice.text.lower() == 'other' else '',
                    )
                    next_q = choice.next_question

            elif question.question_type == 'MATRIX':
                if question.matrix_mode == 'side_by_side':
                    for row in question.matrix_rows.all():
                        for column in question.matrix_columns.all():
                            field_name = f"matrix_{row.id}_{column.id}"
                            value = request.POST.get(field_name, '').strip()

                            # Skip empty fields
                            if not value:
                                continue

                            # Avoid duplicate if already answered
                            if not Response.objects.filter(
                                user=request.user,
                                survey=survey,
                                question=question,
                                matrix_row=row,
                                matrix_column=column,
                            ).exists():
                                Response.objects.create(
                                    user=request.user,
                                    survey=survey,
                                    question=question,
                                    matrix_row=row,
                                    matrix_column=column,
                                    text_answer=value if column.input_type in ['text', 'select'] else '',
                                )

                elif question.matrix_mode == 'multi':
                    for row in question.matrix_rows.all():
                        column_ids = request.POST.getlist(f'matrix_{row.id}')
                        for col_id in column_ids:
                            if col_id:
                                try:
                                    column = question.matrix_columns.get(id=col_id)
                                    if not Response.objects.filter(
                                        user=request.user,
                                        survey=survey,
                                        question=question,
                                        matrix_row=row,
                                        matrix_column=column,
                                    ).exists():
                                        Response.objects.create(
                                            user=request.user,
                                            survey=survey,
                                            question=question,
                                            matrix_row=row,
                                            matrix_column=column,
                                        )
                                except MatrixColumn.DoesNotExist:
                                    continue

                else:  # single-select
                    for row in question.matrix_rows.all():
                        column_id = request.POST.get(f'matrix_{row.id}')
                        if column_id:
                            try:
                                column = question.matrix_columns.get(id=column_id)
                                if not Response.objects.filter(
                                    user=request.user,
                                    survey=survey,
                                    question=question,
                                    matrix_row=row,
                                    matrix_column=column,
                                ).exists():
                                    Response.objects.create(
                                        user=request.user,
                                        survey=survey,
                                        question=question,
                                        matrix_row=row,
                                        matrix_column=column,
                                    )
                            except MatrixColumn.DoesNotExist:
                                continue

            elif question.question_type in ['PHOTO_UPLOAD', 'PHOTO_MULTI_UPLOAD', 'VIDEO_UPLOAD', 'AUDIO_UPLOAD']:
                files = request.FILES.getlist('answer_file') if question.allow_multiple_files else [
                    request.FILES.get('answer_file')]
                allowed_types = {
                    'PHOTO_UPLOAD': ['image/jpeg', 'image/png'],
                    'PHOTO_MULTI_UPLOAD': ['image/jpeg', 'image/png'],
                    'VIDEO_UPLOAD': ['video/mp4', 'video/quicktime'],
                    'AUDIO_UPLOAD': ['audio/mpeg', 'audio/wav', 'audio/ogg'],
                }
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
                    })
                if answer and answer.lower() in ['yes', 'no']:
                    Response.objects.create(
                        user=request.user,
                        survey=survey,
                        question=question,
                        text_answer=answer.lower()
                    )
                next_q = question.next_question or get_next_question_in_sequence(all_questions, question)

            elif question.question_type == 'NUMBER':
                if question.required and not answer:
                    messages.error(request, "This question is required. Please enter a number.")
                    return render(request, 'surveys/survey_question.html', {
                        'survey': survey,
                        'question': question,
                        'current_index': current_index,
                        'total_questions': total_questions,
                        'progress_percent': progress_percent,
                        'previous_response': None,
                        'time_left': time_left,
                    })
                if answer:
                    try:
                        number_value = float(answer)
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
                        })
                    Response.objects.create(
                        user=request.user,
                        survey=survey,
                        question=question,
                        text_answer=str(number_value)
                    )
                next_q = question.next_question or get_next_question_in_sequence(all_questions, question)

            elif question.question_type == 'SLIDER':

                slider_moved = request.POST.get('slider_moved') == "true"
                answer = request.POST.get('answer')
                # Only validate movement if required
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
                        })

                    if question.min_value is not None and slider_value < question.min_value:
                        messages.error(request, f"Value must be at least {question.min_value}.")
                        return render(request, 'surveys/survey_question.html', {
                            'survey': survey,
                            'question': question,
                            'current_index': current_index,
                            'total_questions': total_questions,
                            'progress_percent': progress_percent,
                            'previous_response': None,
                            'time_left': time_left
                        })
                    if question.max_value is not None and slider_value > question.max_value:
                        messages.error(request, f"Value must be at most {question.max_value}.")
                        return render(request, 'surveys/survey_question.html', {
                            'survey': survey,
                            'question': question,
                            'current_index': current_index,
                            'total_questions': total_questions,
                            'progress_percent': progress_percent,
                            'previous_response': None,
                            'time_left': time_left
                        })
                    Response.objects.create(
                        user=request.user,
                        survey=survey,
                        question=question,
                        text_answer=str(slider_value)
                    )
                next_q = question.next_question or get_next_question_in_sequence(all_questions, question)

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
                        'previous_response': None,  # or pass a fallback
                        'time_left': time_left,
                    })

                for choice_id in selected_ids:
                    try:
                        choice = Choice.objects.get(id=choice_id, question=question)
                    except Choice.DoesNotExist:
                        continue  # skip invalid choice

                    if not Response.objects.filter(user=request.user, survey=survey, question=question,
                                                   choice=choice).exists():
                        Response.objects.create(
                            user=request.user,
                            survey=survey,
                            question=question,
                            choice=choice
                        )

                next_q = None

            elif question.question_type == 'IMAGE_RATING':
                if question.required and not any(request.POST.get(f'rating_{c.id}') for c in question.choices.all()):
                    messages.error(request, "Please rate at least one image.")
                    return render(request, 'surveys/survey_question.html', {
                        'survey': survey,
                        'question': question,
                        'current_index': current_index,
                        'total_questions': total_questions,
                        'progress_percent': progress_percent,
                        'previous_response': None,
                        'time_left': time_left,
                    })
                for choice in question.choices.all():
                    rating = request.POST.get(f'rating_{choice.id}')
                    if rating:
                        Response.objects.create(
                            user=request.user,
                            survey=survey,
                            question=question,
                            choice=choice,
                            text_answer=rating
                        )

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
                    })

                try:
                    # Validate and normalize format
                    parsed_date = datetime.datetime.strptime(answer, '%Y-%m-%d').date()
                except ValueError:
                    return HttpResponseBadRequest("Invalid date format. Please use YYYY-MM-DD.")

                Response.objects.create(
                    user=request.user,
                    survey=survey,
                    question=question,
                    text_answer=parsed_date.isoformat(),  # Save as 'YYYY-MM-DD'
                )

            elif question.question_type == 'TEXT':
                if question.required and not answer.strip():
                    messages.error(request, "This question is required. Please enter your answer.")
                    return render(request, 'surveys/survey_question.html', {
                        'survey': survey,
                        'question': question,
                        'current_index': current_index,
                        'total_questions': total_questions,
                        'progress_percent': progress_percent,
                        'previous_response': None,
                        'time_left': time_left,
                    })
                if answer.strip():  # Only save non-empty responses
                    Response.objects.create(
                        user=request.user,
                        survey=survey,
                        question=question,
                        text_answer=answer.strip(),
                    )
                next_q = question.next_question or get_next_question_in_sequence(all_questions, question)

        else:
            next_q = None

        # Get next question in order if not defined
        if not next_q:

            if 'choice' in locals() and choice and question.question_type in ['MC', 'RATING',
                                                                              'DROPDOWN', 'IMAGE_CHOICE'] and not question.allows_multiple and choice.next_question:
                next_q = choice.next_question
            elif question.next_question:
                next_q = question.next_question
            else:
                try:
                    idx = all_questions.index(question)
                    next_q = all_questions[idx + 1]
                except IndexError:
                    next_q = None

        if next_q:
            return redirect('surveys:survey_question', survey_id=survey.id, question_id=next_q.id)
        else:
            # Last question answered → create submission & link responses
            if not Submission.objects.filter(user=request.user, survey=survey).exists():
                duration = int((now() - start_time).total_seconds())
                submission = Submission.objects.create(user=request.user, survey=survey, duration_seconds=duration)
                Response.objects.filter(user=request.user, survey=survey, submission__isnull=True).update(submission=submission)
                # request.user.add_points(survey.points_reward)
                # Clean up session key
                request.session.pop(session_key, None)
            return redirect('surveys:survey_submit', survey_id=survey.id)

    # Get previous response for the current question (if any)
    previous_response = Response.objects.filter(
        user=request.user,
        survey=survey,
        question=question
    ).first()

    return render(request, 'surveys/survey_question.html', {
        'survey': survey,
        'question': question,
        'current_index': current_index,
        'total_questions': total_questions,
        'progress_percent': progress_percent,
        'previous_response': previous_response,
        'time_left': time_left,
    })


@login_required
def survey_submit(request, survey_id):
    survey = get_object_or_404(Survey, id=survey_id, is_active=True)

    # Prevent awarding points multiple times if needed
    if not Response.objects.filter(user=request.user, survey=survey).exists():
        return redirect('surveys:survey_list')  # No answers? Don't reward

    request.user.add_points(survey.points_reward)

    return render(request, 'surveys/survey_submit.html', {
        'survey': survey,
        'rewarded': survey.points_reward,
    })

@login_required
def already_submitted(request, survey_id):
    survey = get_object_or_404(Survey, id=survey_id)
    return render(request, 'surveys/already_submitted.html', {'survey': survey})



