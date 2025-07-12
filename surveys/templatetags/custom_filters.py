from django import template

register = template.Library()


@register.filter
def get_item(dictionary, key):
    return dictionary.get(key)


@register.filter
def get_list(submitted_data, field_name):
    """Return a list of values for a given field name."""
    if submitted_data and hasattr(submitted_data, 'getlist'):
        return submitted_data.getlist(field_name)
    return []


@register.filter(name='concat_ids')
def concat_ids(row_id, col_id):
    return f"matrix_{row_id}_{col_id}"
