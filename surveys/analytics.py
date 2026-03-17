from .models import AnswerFact, Response
from django.utils.text import slugify


SIMPLE_CHOICE_TYPES = {'SINGLE_CHOICE', 'MULTI_CHOICE', 'DROPDOWN', 'RATING'}


def _base_fact_kwargs(response):
    question = response.question

    return {
        'submission': response.submission,
        'response': response,
        'user': response.user,
        'survey': response.survey,
        'question': question,
        'question_code': question.code or '',
        'question_text': question.text,
        'question_type': question.question_type,
        'analytics_key': f'Q{question.id}',
        'analytics_label': question.text,
        'parent_analytics_key': '',
        'analysis_level': 'question',
        'matrix_row': None,
        'matrix_row_text': '',
        'matrix_column': None,
        'matrix_column_label': '',
        'group_label': None,
        'choice': None,
        'choice_text': '',
        'answer_text': '',
        'answer_number': None,
        'answer_boolean': None,
        'submitted_at': response.submitted_at,
    }


def _fact_for_choice_response(response):
    data = _base_fact_kwargs(response)

    if response.choice_id:
        data['choice'] = response.choice
        data['choice_text'] = response.choice.text

    if response.text_answer:
        data['answer_text'] = response.text_answer
    elif response.choice_id:
        data['answer_text'] = response.choice.text

    if response.value is not None:
        data['answer_number'] = response.value

    return AnswerFact(**data)


def _fact_for_yesno_response(response):
    data = _base_fact_kwargs(response)

    raw = (response.text_answer or '').strip().lower()
    data['answer_text'] = raw

    if response.value is not None:
        data['answer_number'] = response.value

    if raw == 'yes':
        data['answer_boolean'] = True
    elif raw == 'no':
        data['answer_boolean'] = False

    return AnswerFact(**data)


def _fact_for_numeric_response(response):
    data = _base_fact_kwargs(response)

    if response.text_answer:
        data['answer_text'] = response.text_answer

    if response.value is not None:
        data['answer_number'] = response.value

    return AnswerFact(**data)


def _fact_for_text_response(response):
    data = _base_fact_kwargs(response)
    data['answer_text'] = response.text_answer or ''
    return AnswerFact(**data)


def build_submission_answer_facts(submission):
    """
    Build normalized analytics rows for a completed submission.

    Step 4 scope:
    - SINGLE_CHOICE
    - MULTI_CHOICE
    - DROPDOWN
    - RATING
    - YESNO
    - NUMBER
    - SLIDER
    - TEXT

    Matrix / SBS / image rating / media / geo come later.
    """
    responses = (
        Response.objects
        .filter(submission=submission)
        .select_related('survey', 'question', 'choice', 'user', 'submission')
        .order_by('id')
    )

    # rebuild safely for this submission
    AnswerFact.objects.filter(submission=submission).delete()

    facts = []

    for response in responses:
        qtype = response.question.question_type

        if qtype in SIMPLE_CHOICE_TYPES:
            facts.append(_fact_for_choice_response(response))

        elif qtype == 'YESNO':
            facts.append(_fact_for_yesno_response(response))

        elif qtype in {'NUMBER', 'SLIDER'}:
            facts.append(_fact_for_numeric_response(response))

        elif qtype == 'TEXT':
            facts.append(_fact_for_text_response(response))

        elif qtype == 'MATRIX':
            if response.question.matrix_mode == 'side_by_side':
                fact = _fact_for_sbs_response(response)
                if fact:
                    facts.append(fact)
            else:
                fact = _fact_for_matrix_row_response(response)
                if fact:
                    facts.append(fact)

        elif qtype == 'IMAGE_RATING':
            fact = _fact_for_image_rating_response(response)
            if fact:
                facts.append(fact)

        else:
            # not handled yet
            continue

    if facts:
        AnswerFact.objects.bulk_create(facts, batch_size=500)

    return len(facts)


def _fact_for_matrix_row_response(response):
    """
    For MATRIX single/multi (non-SBS), each row is treated as a separate
    analytics question.

    Examples:
      analytics_key   = Q12__ROW_5
      analytics_label = Customer service — Staff friendliness
    """
    question = response.question
    row = response.matrix_row
    col = response.matrix_column

    if not row:
        return None

    data = {
        'submission': response.submission,
        'response': response,
        'user': response.user,
        'survey': response.survey,
        'question': question,
        'question_code': question.code or '',
        'question_text': question.text,
        'question_type': question.question_type,

        'analytics_key': f'Q{question.id}__ROW_{row.id}',
        'analytics_label': f'{question.text} — {row.text}',
        'parent_analytics_key': f'Q{question.id}',
        'analysis_level': 'matrix_row',

        'matrix_row': row,
        'matrix_row_text': row.text,
        'matrix_column': col,
        'matrix_column_label': col.label if col else '',
        'group_label': None,

        'choice': None,
        'choice_text': '',

        'answer_text': response.text_answer or (col.label if col else ''),
        'answer_number': response.value if response.value is not None else None,
        'answer_boolean': None,

        'submitted_at': response.submitted_at,
    }

    return AnswerFact(**data)


def _fact_for_sbs_response(response):
    """
    For MATRIX side_by_side, each row+group is treated as a separate
    analytics question.

    Examples:
      analytics_key   = Q12__ROW_5__GROUP_importance
      analytics_label = Product feedback — Battery life — Importance
    """
    question = response.question
    row = response.matrix_row
    col = response.matrix_column
    raw_group = (response.group_label or '').strip()

    if not row:
        return None

    group_slug = slugify(raw_group or 'ungrouped')
    display_group = raw_group or 'Ungrouped'

    data = {
        'submission': response.submission,
        'response': response,
        'user': response.user,
        'survey': response.survey,
        'question': question,
        'question_code': question.code or '',
        'question_text': question.text,
        'question_type': question.question_type,

        'analytics_key': f'Q{question.id}__ROW_{row.id}__GROUP_{group_slug}',
        'analytics_label': f'{question.text} — {row.text} — {display_group}',
        'parent_analytics_key': f'Q{question.id}__ROW_{row.id}',
        'analysis_level': 'sbs_row_group',

        'matrix_row': row,
        'matrix_row_text': row.text,
        'matrix_column': col,
        'matrix_column_label': col.label if col else '',
        'group_label': display_group,

        'choice': None,
        'choice_text': '',

        'answer_text': response.text_answer or (col.label if col else ''),
        'answer_number': response.value if response.value is not None else None,
        'answer_boolean': None,

        'submitted_at': response.submitted_at,
    }

    return AnswerFact(**data)


def _fact_for_image_rating_response(response):
    """
    For IMAGE_RATING, each image(choice) is treated as a separate
    analytics question.

    Example:
      analytics_key   = Q12__CHOICE_7
      analytics_label = Package design rating — Front label
    """
    question = response.question
    choice = response.choice

    if not choice:
        return None

    rating_number = None
    if response.value is not None:
        rating_number = response.value
    elif response.text_answer:
        try:
            rating_number = float(response.text_answer)
        except (TypeError, ValueError):
            rating_number = None

    data = {
        'submission': response.submission,
        'response': response,
        'user': response.user,
        'survey': response.survey,
        'question': question,
        'question_code': question.code or '',
        'question_text': question.text,
        'question_type': question.question_type,

        'analytics_key': f'Q{question.id}__CHOICE_{choice.id}',
        'analytics_label': f'{question.text} — {choice.text}',
        'parent_analytics_key': f'Q{question.id}',
        'analysis_level': 'image_choice_rating',

        'matrix_row': None,
        'matrix_row_text': '',
        'matrix_column': None,
        'matrix_column_label': '',
        'group_label': None,

        'choice': choice,
        'choice_text': choice.text,

        'answer_text': response.text_answer or '',
        'answer_number': rating_number,
        'answer_boolean': None,

        'submitted_at': response.submitted_at,
    }

    return AnswerFact(**data)
