
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from .models import Survey, Response
from .forms import SurveyResponseForm


# View to list all active surveys, requires login
@login_required
def survey_list(request):
    surveys = Survey.objects.filter(is_active=True)  # Fetch active surveys
    return render(request, 'surveys/survey_list.html', {'surveys': surveys})  # Render survey list template


# View to display and process a specific survey, requires login
@login_required
def survey_detail(request, survey_id):
    survey = get_object_or_404(Survey, id=survey_id, is_active=True)  # Fetch survey or return 404
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
                    choice_id=answer.id if question.question_type == 'MC' else None,  # Save choice for MC questions
                    text_answer=answer if question.question_type == 'TEXT' else ''  # Save text for text questions
                )
            request.user.add_points(survey.points_reward)  # Award points to user
            return redirect('surveys:survey_list')  # Redirect to survey list
    else:
        form = SurveyResponseForm(survey=survey)  # Initialize empty form

    # Render survey detail template with form
    return render(request, 'surveys/survey_detail.html', {'survey': survey, 'form': form})