
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import HttpResponseForbidden
from .models import Survey, Response, Choice, Question, Submission
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
# # View to display and process a specific survey, requires login
@login_required
def survey_detail(request, survey_id):
    survey = get_object_or_404(Survey, id=survey_id, is_active=True)  # Fetch survey or return 404
    # Check if user has access (in survey's groups or no groups specified)
    if survey.groups.exists() and not survey.groups.filter(id__in=request.user.groups.all()).exists():
        return HttpResponseForbidden("You do not have permission to access this survey.")
    # Check if user has already completed the survey
    if Response.objects.filter(user=request.user, survey=survey).exists():
        return render(request, 'surveys/survey_detail.html', {'survey': survey, 'completed': True})

    # Handle form submission
    if request.method == 'POST':
        form = SurveyResponseForm(request.POST, survey=survey)  # Initialize form with POST data
        if form.is_valid():
            # Save responses for each question
            for question in survey.questions.all():
                answer = form.cleaned_data.get(f'question_{question.id}')
                Response.objects.create(
                    user=request.user,
                    survey=survey,
                    question=question,
                    choice_id=answer.id if question.question_type == 'MC' else None,  # Use answer.id for MC questions
                    text_answer=answer if question.question_type == 'TEXT' else ''  # Save text for text questions
                )
            request.user.add_points(survey.points_reward)  # Award points to user
            return redirect('surveys:survey_list')  # Redirect to survey list using namespaced URL
    else:
        form = SurveyResponseForm(survey=survey)  # Initialize empty form

    # Render survey detail template with form
    return render(request, 'surveys/survey_detail.html', {'survey': survey, 'form': form})


@login_required
def survey_question(request, survey_id, question_id=None):
    survey = get_object_or_404(Survey, id=survey_id, is_active=True)

    # If already submitted, redirect
    if Submission.objects.filter(user=request.user, survey=survey).exists():
        return redirect('surveys:already_submitted', survey_id=survey.id)

    # Check group access
    if survey.groups.exists() and not survey.groups.filter(id__in=request.user.groups.all()).exists():
        return HttpResponseForbidden("Access denied.")

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

    if request.method == 'POST':
        answer = request.POST.get('answer')

        # Avoid duplicate
        if not Response.objects.filter(user=request.user, survey=survey, question=question).exists():
            if question.question_type == 'MC':
                choice = Choice.objects.get(id=answer)
                Response.objects.create(user=request.user, survey=survey, question=question, choice=choice)
                next_q = choice.next_question
            else:
                Response.objects.create(user=request.user, survey=survey, question=question, text_answer=answer)
                next_q = None
        else:
            next_q = None

        # Get next question in order if not defined
        if question.question_type == 'MC' and choice.next_question:
            next_q = choice.next_question
        elif question.next_question:
            next_q = question.next_question
        else:
            # fallback: next in sequence
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
                submission = Submission.objects.create(user=request.user, survey=survey)
                Response.objects.filter(user=request.user, survey=survey, submission__isnull=True).update(submission=submission)
                request.user.add_points(survey.points_reward)
            return redirect('surveys:survey_submit', survey_id=survey.id)

    return render(request, 'surveys/survey_question.html', {
        'survey': survey,
        'question': question,
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




#todo: _________________________________________________________________________________________
# from django.shortcuts import render, redirect, get_object_or_404
# from django.contrib.auth.decorators import login_required
# from django.http import HttpResponseForbidden
# from .models import Survey, Response, Choice, Question
# from .forms import SurveyResponseForm
# from django.db import models
#
#
# # # View to list all active surveys, requires login
# @login_required
# def survey_list(request):
#     # Fetch active surveys that the user has access to (in their groups or no groups specified)
#     surveys = Survey.objects.filter(is_active=True).filter(
#         models.Q(groups__in=request.user.groups.all()) | models.Q(groups__isnull=True)
#     ).distinct()
#     return render(request, 'surveys/survey_list.html', {'surveys': surveys})  # Render survey list template
# #
# # # View to display and process a specific survey, requires login
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
#
# @login_required
# def survey_question(request, survey_id, question_id=None):
#     survey = get_object_or_404(Survey, id=survey_id, is_active=True)
#
#     if survey.groups.exists() and not survey.groups.filter(id__in=request.user.groups.all()).exists():
#         return HttpResponseForbidden("Access denied.")
#
#     if question_id:
#         question = get_object_or_404(Question, id=question_id, survey=survey)
#     else:
#         # Get first unanswered question
#         answered_qs = Response.objects.filter(user=request.user, survey=survey).values_list('question_id', flat=True)
#         question = survey.questions.exclude(id__in=answered_qs).order_by('id').first()
#         if not question:
#             # No more questions
#             request.user.add_points(survey.points_reward)
#             return redirect('surveys:survey_list')
#
#     if request.method == 'POST':
#         answer = request.POST.get('answer')
#         if question.question_type == 'MC':
#             choice = Choice.objects.get(id=answer)
#             Response.objects.create(user=request.user, survey=survey, question=question, choice=choice)
#             next_q = choice.next_question
#         else:
#             Response.objects.create(user=request.user, survey=survey, question=question, text_answer=answer)
#             next_q = None
#
#         if not next_q:
#             # Default to next in sequence
#             all_qs = list(survey.questions.order_by('id'))
#             idx = all_qs.index(question)
#             next_q = all_qs[idx + 1] if idx + 1 < len(all_qs) else None
#
#         if next_q:
#             return redirect('surveys:survey_question', survey_id=survey.id, question_id=next_q.id)
#         else:
#             request.user.add_points(survey.points_reward)
#             return redirect('surveys:survey_list')
#
#     return render(request, 'surveys/survey_question.html', {'survey': survey, 'question': question})
