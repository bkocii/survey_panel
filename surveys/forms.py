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


# Dynamic form for survey responses, generated based on survey questions
class SurveyResponseForm(forms.Form):
    def __init__(self, *args, **kwargs):
        survey = kwargs.pop('survey')  # Extract survey from kwargs
        super().__init__(*args, **kwargs)
        # Dynamically add fields for each question
        for question in survey.questions.all():
            if question.question_type == 'MC':
                # Add radio select field for multiple-choice questions
                self.fields[f'question_{question.id}'] = forms.ModelChoiceField(
                    queryset=question.choices.all(), widget=forms.RadioSelect, required=True
                )
            else:
                # Add textarea field for text questions
                self.fields[f'question_{question.id}'] = forms.CharField(widget=forms.Textarea, required=True)

