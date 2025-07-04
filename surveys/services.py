# from .models import Response
#
#
# def get_next_unanswered_question(user, survey):
#     """
#     Returns the next unanswered question for the user in this survey.
#     If all are answered, returns None.
#     """
#     answered_ids = Response.objects.filter(user=user, survey=survey).values_list('question_id', flat=True)
#     return survey.questions.exclude(id__in=answered_ids).order_by('id').first()

def get_next_question_in_sequence(questions, current_question):
    try:
        idx = questions.index(current_question)
        return questions[idx + 1]
    except (ValueError, IndexError):
        return None