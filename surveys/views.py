
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import HttpResponseForbidden
from .models import Survey, Response, Choice, Question
from .forms import SurveyResponseForm
from django.db import models


# # View to list all active surveys, requires login
@login_required
def survey_list(request):
    # Fetch active surveys that the user has access to (in their groups or no groups specified)
    surveys = Survey.objects.filter(is_active=True).filter(
        models.Q(groups__in=request.user.groups.all()) | models.Q(groups__isnull=True)
    ).distinct()
    return render(request, 'surveys/survey_list.html', {'surveys': surveys})  # Render survey list template
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

    if survey.groups.exists() and not survey.groups.filter(id__in=request.user.groups.all()).exists():
        return HttpResponseForbidden("Access denied.")

    if question_id:
        question = get_object_or_404(Question, id=question_id, survey=survey)
    else:
        # Get first unanswered question
        answered_qs = Response.objects.filter(user=request.user, survey=survey).values_list('question_id', flat=True)
        question = survey.questions.exclude(id__in=answered_qs).order_by('id').first()
        if not question:
            # No more questions
            request.user.add_points(survey.points_reward)
            return redirect('surveys:survey_list')

    if request.method == 'POST':
        answer = request.POST.get('answer')
        if question.question_type == 'MC':
            choice = Choice.objects.get(id=answer)
            Response.objects.create(user=request.user, survey=survey, question=question, choice=choice)
            next_q = choice.next_question
        else:
            Response.objects.create(user=request.user, survey=survey, question=question, text_answer=answer)
            next_q = None

        if not next_q:
            # Default to next in sequence
            all_qs = list(survey.questions.order_by('id'))
            idx = all_qs.index(question)
            next_q = all_qs[idx + 1] if idx + 1 < len(all_qs) else None

        if next_q:
            return redirect('surveys:survey_question', survey_id=survey.id, question_id=next_q.id)
        else:
            request.user.add_points(survey.points_reward)
            return redirect('surveys:survey_list')

    return render(request, 'surveys/survey_question.html', {'survey': survey, 'question': question})
