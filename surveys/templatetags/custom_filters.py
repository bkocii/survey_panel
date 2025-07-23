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


@register.filter
def concat_ids_group(row_id, group_slug):
    """Concatenates row ID and group slug with an underscore"""
    return f"{row_id}_{group_slug}"


@register.filter
def value_in_post_list(post_data, args):
    """
    Usage: {{ request.POST|value_in_post_list:"matrix_28_group-one,1" }}
    Checks if value '1' is in request.POST.getlist('matrix_28_group-one')
    """
    key, val = args.split(',', 1)
    return val in post_data.getlist(key)
