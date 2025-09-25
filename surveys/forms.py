from django import forms
from .models import Survey, Question, MatrixColumn, MatrixRow, Choice


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
    class Meta:
        model = Question
        fields = [
            'question_type', 'code', 'text', 'matrix_mode', 'required',
            'min_value', 'max_value', 'step_value',
            'allow_multiple_files', 'allows_multiple',
            'helper_text', 'helper_media', 'helper_media_type', 'next_question'
        ]
        widgets = {
            # NOTE: fix 'text' -> 'text-white', add 'border' so width is applied
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
        }

    # ←← move __init__ here (sibling of Meta)
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # normalize all widgets; remove inline styles if any got injected elsewhere
        for f in self.fields.values():
            cls = f.widget.attrs.get('class', '')
            base = 'w-full rounded shadow-sm border focus:border-indigo-500 focus:ring-indigo-500'
            dark = 'bg-gray-900 text-white border-gray-700'
            f.widget.attrs['class'] = f'{base} {dark} {cls}'.strip()
            f.widget.attrs.pop('style', None)


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

