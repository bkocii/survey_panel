from django import forms
import json
from .models import Survey, Question, MatrixColumn, MatrixRow, Choice
import ast
from django.core.exceptions import ValidationError


BASE_INPUT = 'w-full rounded border bg-gray-900 text-white border-gray-700 h-9 px-2'
BASE_FILE  = 'w-full text-white'
BASE_CHECK = ''  # you can style checkboxes via CSS if needed
BASE_SELECT = BASE_INPUT


class ChoiceWizardForm(forms.ModelForm):
    class Meta:
        model = Choice
        fields = ('text', 'value', 'next_question', 'image')
        widgets = {
            'text':  forms.TextInput(attrs={'class': BASE_INPUT}),
            'value': forms.NumberInput(attrs={'class': BASE_INPUT}),
            'next_question': forms.Select(attrs={'class': BASE_SELECT}),
            'image': forms.ClearableFileInput(attrs={'class': BASE_FILE}),
        }


class MatrixRowWizardForm(forms.ModelForm):
    class Meta:
        model = MatrixRow
        fields = ('text', 'value', 'required')
        widgets = {
            'text':  forms.TextInput(attrs={'class': BASE_INPUT}),
            'value': forms.NumberInput(attrs={'class': BASE_INPUT}),
            'required': forms.CheckboxInput(attrs={'class': BASE_CHECK}),
        }


class MatrixColWizardForm(forms.ModelForm):
    class Meta:
        model = MatrixColumn
        fields = ('label', 'value', 'input_type', 'required', 'group', 'order')
        widgets = {
            'label':  forms.TextInput(attrs={'class': BASE_INPUT}),
            'value':  forms.NumberInput(attrs={'class': BASE_INPUT}),
            'input_type': forms.Select(attrs={'class': BASE_SELECT}),
            'required': forms.CheckboxInput(attrs={'class': BASE_CHECK}),
            # 'next_question': forms.Select(attrs={'class': BASE_SELECT}),
            'group': forms.TextInput(attrs={'class': BASE_INPUT}),
            'order': forms.NumberInput(attrs={'class': BASE_INPUT}),
        }


class QuestionAdminForm(forms.ModelForm):
    class Meta:
        model = Question
        fields = '__all__'

    def clean(self):
        cleaned_data = super().clean()
        media = cleaned_data.get("helper_media")
        media_type = cleaned_data.get("helper_media_type")

        if media and not media_type:
            raise forms.ValidationError("Please select a media type if a helper media file is uploaded.")
        if media_type and not media:
            raise forms.ValidationError("You selected a media type but did not upload a helper media file.")
        return cleaned_data


class WizardQuestionForm(forms.ModelForm):
    # Treat visibility_rules as plain text for the wizard; we’ll parse it ourselves
    visibility_rules = forms.CharField(
        required=False,
        widget=forms.Textarea(
            attrs={
                "rows": 4,
                "placeholder": '{"all":[{"q":"Q1","op":"eq","val":1}]}',
            }
        ),
    )

    class Meta:
        model = Question
        fields = [
            'question_type', 'code', 'text', 'matrix_mode', 'required',
            'min_value', 'max_value', 'step_value',
            'allow_multiple_files', 'allows_multiple',
            'helper_text', 'helper_media', 'helper_media_type',
            'next_question', 'visibility_rules',
        ]
        widgets = {
            'code': forms.TextInput(attrs={
                'class': 'w-full rounded shadow-sm border bg-gray-900 text-white border-gray-700 '
                         'focus:border-indigo-500 focus:ring-indigo-500 placeholder-gray-400'
            }),
            'text': forms.TextInput(attrs={
                'class': 'w-full rounded shadow-sm border bg-gray-900 text-white border-gray-700 '
                         'focus:border-indigo-500 focus:ring-indigo-500 placeholder-gray-400'
            }),
            'question_type': forms.Select(attrs={
                'class': 'w-full rounded shadow-sm border bg-gray-900 text-white border-gray-700 '
                         'focus:border-indigo-500 focus:ring-indigo-500'
            }),
            'required': forms.CheckboxInput(attrs={'class': 'rounded'}),
            'helper_text': forms.TextInput(attrs={
                'class': 'w-full rounded shadow-sm border bg-gray-900 text-white border-gray-700 '
                         'focus:border-indigo-500 focus:ring-indigo-500 placeholder-gray-400'
            }),
            'helper_media': forms.ClearableFileInput(attrs={
                'class': 'w-full text-white'
            }),
            'helper_media_type': forms.Select(attrs={
                'class': 'w-full rounded shadow-sm border bg-gray-900 text-white border-gray-700 '
                         'focus:border-indigo-500 focus:ring-indigo-500'
            }),
            'next_question': forms.Select(attrs={
                'class': 'w-full rounded shadow-sm border bg-gray-900 text-white border-gray-700 '
                         'focus:border-indigo-500 focus:ring-indigo-500'
            }),
            # visibility_rules widget is overridden by the explicit field above
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        # 🔹 Normalize dark theme classes
        for f in self.fields.values():
            cls = f.widget.attrs.get('class', '')
            base = 'w-full rounded shadow-sm border focus:border-indigo-500 focus:ring-indigo-500'
            dark = 'bg-gray-900 text-white border-gray-700'
            f.widget.attrs['class'] = f'{base} {dark} {cls}'.strip()
            f.widget.attrs.pop('style', None)

        # 🔹 Pretty-print existing rules as valid JSON (double quotes) for editing
        inst = getattr(self, 'instance', None)
        if inst and getattr(inst, 'visibility_rules', None):
            rules = inst.visibility_rules
            if isinstance(rules, (dict, list)):
                # show nice JSON in the textarea
                self.fields['visibility_rules'].initial = json.dumps(
                    rules, ensure_ascii=False, indent=2
                )
            else:
                # if somehow stored as string, just show it as-is
                self.fields['visibility_rules'].initial = str(rules)

    def clean_visibility_rules(self):
        """
        Accept:
          - empty value → {}
          - proper JSON string → parsed dict/list
          - Python-style dict string with single quotes → parse via ast.literal_eval
        Always return a Python object suitable for a JSONField.
        """
        raw = self.cleaned_data.get('visibility_rules')

        if not raw:
            return {}  # store as empty dict

        # If something upstream already gave us a dict/list, just return it
        if isinstance(raw, (dict, list)):
            return raw

        # First, try proper JSON
        try:
            return json.loads(raw)
        except Exception:
            pass

        # Fallback: try to accept Python dict syntax with single quotes
        try:
            value = ast.literal_eval(raw)
            if isinstance(value, (dict, list)):
                return value
        except Exception:
            pass

        # If both fail, raise a clean error
        raise ValidationError(
            "Invalid logic JSON. Please use JSON syntax, e.g. "
            '{"all":[{"q":"Q1","op":"eq","val":1}]}.'
        )


# Dynamic form for survey responses, generated based on survey questions
class SurveyResponseForm(forms.Form):
    def __init__(self, *args, **kwargs):
        survey = kwargs.pop('survey')  # Extract survey from kwargs
        super().__init__(*args, **kwargs)
        # Dynamically add fields for each question
        for question in survey.questions.all():
            if question.question_type == 'SINGLE_CHOICE':
                # Add radio select field for multiple-choice questions
                self.fields[f'question_{question.id}'] = forms.ModelChoiceField(
                    queryset=question.choices.all(), widget=forms.RadioSelect, required=True
                )
            else:
                # Add textarea field for text questions
                self.fields[f'question_{question.id}'] = forms.CharField(widget=forms.Textarea, required=True)

