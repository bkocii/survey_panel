
from django.db import models
from users.models import CustomUser


# Model for surveys, storing title, description, and status
class Survey(models.Model):
    title = models.CharField(max_length=200)  # Survey title
    description = models.TextField()  # Survey description
    created_at = models.DateTimeField(auto_now_add=True)  # Auto-set creation timestamp
    is_active = models.BooleanField(default=True)  # Flag to show/hide survey
    points_reward = models.PositiveIntegerField(default=10)  # Points awarded for completion

    def __str__(self):
        return self.title  # String representation for admin interface


# Model for survey questions, linked to a survey
class Question(models.Model):
    survey = models.ForeignKey(Survey, related_name='questions', on_delete=models.CASCADE)  # Link to parent survey
    text = models.CharField(max_length=500)  # Question text
    question_type = models.CharField(max_length=20, choices=[('MC', 'Multiple Choice'), ('TEXT', 'Text')])  # Type of question

    def __str__(self):
        return self.text  # String representation for admin


# Model for multiple-choice options, linked to a question
class Choice(models.Model):
    question = models.ForeignKey(Question, related_name='choices', on_delete=models.CASCADE)  # Link to parent question
    text = models.CharField(max_length=200)  # Choice text

    def __str__(self):
        return self.text  # String representation for admin


# Model for user responses, linking users, surveys, questions, and answers
class Response(models.Model):
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE)  # User who submitted response
    survey = models.ForeignKey(Survey, on_delete=models.CASCADE)  # Associated survey
    question = models.ForeignKey(Question, on_delete=models.CASCADE)  # Associated question
    choice = models.ForeignKey(Choice, null=True, blank=True, on_delete=models.CASCADE)  # Selected choice (for MC questions)
    text_answer = models.TextField(blank=True)  # Text answer (for text questions)
    submitted_at = models.DateTimeField(auto_now_add=True)  # Timestamp of submission

    class Meta:
        unique_together = ('user', 'survey', 'question')  # Ensure one response per user per question per survey