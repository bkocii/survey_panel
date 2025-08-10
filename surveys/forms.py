from django import forms
from .models import Survey, Question


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
            'code': forms.TextInput(attrs={'class': 'w-full border-gray-300 rounded shadow-sm'}),
            'text': forms.TextInput(attrs={'class': 'w-full border-gray-300 rounded shadow-sm '}),
            'question_type': forms.Select(attrs={'class': 'w-full border-gray-300 rounded shadow-sm'}),
            'required': forms.CheckboxInput(attrs={'class': 'rounded'}),
            'helper_text': forms.TextInput(attrs={'class': 'w-full border-gray-300 rounded shadow-sm'}),
            'helper_media': forms.ClearableFileInput(attrs={'class': 'w-full text-white'}),
            'helper_media_type': forms.Select(attrs={'class': 'w-full border-gray-300 rounded shadow-sm'}),
            'next_question': forms.Select(attrs={'class': 'w-full border-gray-300 rounded shadow-sm'}),
        }


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

