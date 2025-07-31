
from django.db import models
from users.models import CustomUser
from django.contrib.auth.models import Group


# Model for surveys, storing title, description, and status
class Survey(models.Model):
    title = models.CharField(max_length=200)  # Survey title
    description = models.TextField()  # Survey description
    created_at = models.DateTimeField(auto_now_add=True)  # Auto-set creation timestamp
    is_active = models.BooleanField(default=True)  # Flag to show/hide survey
    points_reward = models.PositiveIntegerField(default=10)  # Points awarded for completion
    time_limit_minutes = models.PositiveIntegerField(null=True, blank=True)  # e.g. 10 mins
    groups = models.ManyToManyField(
        Group,
        related_name='surveys',
        blank=True,
        help_text='Groups allowed to access this survey. Leave blank for all users.'
    )  # Groups assigned to this survey

    def __str__(self):
        return self.title  # String representation for admin interface


QUESTION_TYPES = [
    ('MC', 'Multiple Choice'),
    ('TEXT', 'Text'),
    ('RATING', 'Rating Scale'),
    ('DROPDOWN', 'Dropdown'),
    ('MATRIX', 'Matrix'),
    ('PHOTO_UPLOAD', 'Photo Upload'),
    ('PHOTO_MULTI_UPLOAD', 'Multiple Photos'),
    ('VIDEO_UPLOAD', 'Video Upload'),
    ('AUDIO_UPLOAD', 'Audio Upload'),
    ('DATE', 'Date Picker'),
    ("YESNO", "Yes / No"),
    ("NUMBER", "Number Input"),
    ("SLIDER", "Slider"),
    ('IMAGE_CHOICE', 'Image Choice'),
    ('IMAGE_RATING', 'Image Rating'),
    ('GEOLOCATION', 'Geolocation'),
]

HELPER_MEDIA_TYPES = [
        ('image', 'Image'),
        ('video', 'Video'),
        ('audio', 'Audio'),
    ]


# Model for survey questions, linked to a survey
class Question(models.Model):
    survey = models.ForeignKey(Survey, related_name='questions', on_delete=models.CASCADE)  # Link to parent survey
    code = models.CharField(max_length=20, unique=True)
    text = models.CharField(max_length=500)  # Question text
    question_type = models.CharField(max_length=20, choices=QUESTION_TYPES)
    required = models.BooleanField(default=True)
    min_value = models.IntegerField(null=True, blank=True, help_text="Minimum value (for sliders)")
    max_value = models.IntegerField(null=True, blank=True, help_text="Maximum value (for sliders)")
    step_value = models.IntegerField(null=True, blank=True, help_text="Step value (for sliders)")
    allow_multiple_files = models.BooleanField(default=False, help_text="Allow multiple files upload (images only)")
    allows_multiple = models.BooleanField(default=False, help_text="Allow multiple selections (for Image Choice only)?")
    matrix_mode = models.CharField(max_length=20,choices=[
            ('single', 'Single Select'),
            ('multi', 'Multi Select'),
            ('side_by_side', 'Side-by-Side Matrix'),
        ],
        blank=True,
        null=True,
        help_text="Only for MATRIX type")
    helper_media = models.FileField(upload_to='question_helpers/', blank=True, null=True)
    helper_media_type = models.CharField(
        max_length=10,
        choices=HELPER_MEDIA_TYPES,
        blank=True,
        null=True,
        help_text="Specify type if helper media is provided."
    )
    helper_text = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text='Optional helper description to display under the question.'
    )
    next_question = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL)

    def __str__(self):
        return self.text  # String representation for admin

class MatrixRow(models.Model):
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name='matrix_rows')
    text = models.CharField(max_length=255)
    value = models.IntegerField(default=0, help_text="Optional scoring weight or priority")
    required = models.BooleanField(default=True)

    def __str__(self):
        return self.text

class MatrixColumn(models.Model):
    INPUT_TYPES = [
        ('text', 'Text Input'),
        ('select', 'Dropdown'),
        ('radio', 'Radio Button'),
        ('checkbox', 'Checkbox'),
    ]
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name='matrix_columns')
    label = models.CharField(max_length=50)
    value = models.IntegerField()  # e.g., 1–5
    input_type = models.CharField(max_length=20, choices=INPUT_TYPES, default='radio')  # New field
    required = models.BooleanField(default=False)
    # dropdown_choices = models.TextField(blank=True, help_text="Comma-separated values for dropdowns")
    group = models.CharField(max_length=100, blank=True, null=True, help_text="E.g. 'Importance', 'Satisfaction'")
    order = models.PositiveIntegerField(default=0, null=True, blank=True, help_text="Order within the group")
    next_question = models.ForeignKey(
        'Question',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        help_text="If selected, go to this question next"
    )

    class Meta:
        ordering = ['group', 'order']  # Optional: default ordering at DB level

    def __str__(self):
        return self.label  # String representation for admin


# Model for multiple-choice options, linked to a question
class Choice(models.Model):
    question = models.ForeignKey(Question, related_name='choices', on_delete=models.CASCADE)  # Link to parent question
    text = models.CharField(max_length=200)  # Choice text
    image = models.ImageField(upload_to='choice_images/', null=True, blank=True)
    value = models.IntegerField()  # Represents 1–5 etc.
    # Add this to your Choice model
    next_question = models.ForeignKey(
        'Question',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        help_text="The next question to go to if this choice is selected. Leave blank to go to the next in order."
    )

    def __str__(self):
        return self.text  # String representation for admin

class Submission(models.Model):
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE)
    survey = models.ForeignKey('Survey', on_delete=models.CASCADE)
    started_at = models.DateTimeField(auto_now_add=True)
    duration_seconds = models.PositiveIntegerField(null=True, blank=True)  # Time taken to complete
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'survey')  # Prevent duplicates

    def __str__(self):
        return f"{self.user} submitted {self.survey}"

# Model for user responses, linking users, surveys, questions, and answers
class Response(models.Model):
    submission = models.ForeignKey(Submission, on_delete=models.CASCADE, related_name='responses', null=True, blank=True)
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE)  # User who submitted response
    survey = models.ForeignKey(Survey, on_delete=models.CASCADE)  # Associated survey
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name='responses')  # Associated question
    choice = models.ForeignKey(Choice, null=True, blank=True, on_delete=models.CASCADE)  # Selected choice (for MC questions)
    text_answer = models.TextField(blank=True)  # Text answer (for text questions)
    submitted_at = models.DateTimeField(auto_now_add=True)  # Timestamp of submission
    group_label = models.CharField(max_length=100, blank=True, null=True)
    matrix_row = models.ForeignKey(MatrixRow, null=True, blank=True, on_delete=models.CASCADE)
    matrix_column = models.ForeignKey(MatrixColumn, null=True, blank=True, on_delete=models.CASCADE)
    media_upload = models.FileField(upload_to='uploads/', null=True, blank=True)
    value = models.FloatField(null=True, blank=True, help_text="Scoring or weighted value of the answer")
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)

    # class Meta:
    #     unique_together = ('user', 'survey', 'question', 'matrix_row', 'matrix_column')  # Ensure one response per user per question per survey


