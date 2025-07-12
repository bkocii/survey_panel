from collections import defaultdict
from django.utils.html import escape

def validate_and_collect_matrix_responses(request, survey, question):
    """Validate all required side-by-side matrix inputs before saving."""
    grouped_matrix_columns = defaultdict(list)
    columns = question.matrix_columns.all().order_by('group', 'order')
    for col in columns:
        key = col.group or "Ungrouped"
        grouped_matrix_columns[key].append(col)
    grouped_matrix_columns = dict(grouped_matrix_columns)

    collected_responses = []
    next_q = None

    for row in question.matrix_rows.all():
        print("POST KEYS:", list(request.POST.keys()))
        for column in question.matrix_columns.all():
            field_base = f"matrix_{row.id}_{column.id}"
            is_required = column.required or row.required

            if column.input_type == 'checkbox':
                selected_values = [request.POST[key] for key in request.POST if key.startswith(f"{field_base}_")]
                if is_required and not selected_values:
                    return False, f"Please select at least one option for '{escape(row.text)}' under '{escape(column.label)}'.", None

                for val in selected_values:
                    label = next((opt['label'] for opt in column.options if opt['value'] == val), val)
                    collected_responses.append({
                        'row': row, 'col': column, 'answer': label, 'value': val
                    })
                    if not next_q and column.next_question:
                        next_q = column.next_question

            elif column.input_type in ['radio', 'select']:
                val = request.POST.get(field_base, '').strip()
                if is_required and not val:
                    return False, f"Please select a value for '{escape(row.text)}' under '{escape(column.label)}'.", None

                if val:
                    label = next((opt['label'] for opt in column.options if opt['value'] == val), val)
                    collected_responses.append({
                        'row': row, 'col': column, 'answer': label, 'value': val
                    })
                    if not next_q and column.next_question:
                        next_q = column.next_question

            elif column.input_type == 'text':
                val = request.POST.get(field_base, '').strip()
                if is_required and not val:
                    return False, f"Please complete '{escape(row.text)}' under '{escape(column.label)}'.", None

                if val:
                    collected_responses.append({
                        'row': row, 'col': column, 'answer': val, 'value': None
                    })
                    if not next_q and column.next_question:
                        next_q = column.next_question

    return True, collected_responses, next_q


def get_next_question_in_sequence(questions, current_question):
    try:
        idx = questions.index(current_question)
        return questions[idx + 1]
    except (ValueError, IndexError):
        return None