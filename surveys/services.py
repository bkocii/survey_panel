from collections import defaultdict
from django.utils.html import escape
from django.utils.text import slugify


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
            input_type = cols[0].input_type  # All columns in group share same input_type

            if input_type == 'select':
                group_slug = slugify(group_label)
                field_name = f"matrix_{row.id}_{group_slug}"
                print(request.POST.get)
                val = request.POST.get(field_name, '').strip()
                print(field_name)
                print(val)
                # Validate required only once for the group
                is_required = any(col.required for col in cols) or row.required
                if is_required and not val:
                    return False, f"Please select a value for '{escape(row.text)}' under '{escape(group_label)}'.", None

                if val:
                    matching_col = next((col for col in cols if str(col.value) == val), None)
                    label = matching_col.label if matching_col else val

                    collected_responses.append({
                        'row': row,
                        'col': matching_col or cols[0],  # Fallback
                        'answer': label,
                        'value': val,
                        'group_label': group_label
                    })

                    if not next_q and matching_col and matching_col.next_question:
                        next_q = matching_col.next_question

            else:
                # Loop over individual columns for other input types
                for column in cols:
                    field_base = f"matrix_{row.id}_{column.id}"
                    is_required = column.required or row.required

                    if cols[0].input_type == 'checkbox':
                        group_slug = slugify(group_label)
                        field_name = f"matrix_{row.id}_{group_slug}"
                        selected_values = request.POST.getlist(field_name)
                        print(selected_values)

                        group_required = any(col.required for col in cols) or row.required
                        if group_required and not selected_values:
                            return False, f"Please select at least one option for '{escape(row.text)}' under '{escape(group_label)}'.", None

                        for val in selected_values:
                            matching_col = next((col for col in cols if str(col.value) == val), None)
                            if matching_col:
                                collected_responses.append({
                                    'row': row,
                                    'col': matching_col,
                                    'answer': matching_col.label,
                                    'value': matching_col.value,
                                    'group_label': group_label,
                                })

                        if not next_q and column.next_question:
                            next_q = column.next_question

                    elif cols[0].input_type == 'radio':
                        group_slug = slugify(group_label)
                        field_name = f"matrix_{row.id}_{group_slug}"

                        selected_val = request.POST.get(field_name, '').strip()

                        # Determine if any column in this group or the row is required
                        group_required = any(col.required for col in cols) or row.required
                        if group_required and not selected_val:
                            return False, f"Please select an option for '{escape(row.text)}' under '{escape(group_label)}'.", None

                        if selected_val:
                            selected_col = next((col for col in cols if str(col.value) == selected_val), None)
                            if not selected_col:
                                return False, f"Invalid selection for '{escape(row.text)}' under '{escape(group_label)}'.", None

                            collected_responses.append({
                                'row': row,
                                'col': selected_col,
                                'answer': selected_col.label,
                                'value': selected_col.value,
                                'group_label': group_label,
                            })
                            if not next_q and selected_col.next_question:
                                next_q = selected_col.next_question

                    elif cols[0].input_type == 'text':
                        field_name = f"matrix_{row.id}_{cols[0].id}"
                        val = request.POST.get(field_name, '').strip()
                        if is_required and not val:
                            return False, f"Please complete '{escape(row.text)}' under '{escape(group_label)}'.", None

                        if val:
                            collected_responses.append({
                                'row': row,
                                'col': column,
                                'answer': val,
                                'value': None,
                                'group_label': group_label
                            })
                            if not next_q and column.next_question:
                                next_q = column.next_question
    print(collected_responses)
    return True, collected_responses, next_q


def get_next_question_in_sequence(questions, current_question):
    try:
        idx = questions.index(current_question)
        return questions[idx + 1]
    except (ValueError, IndexError):
        return None