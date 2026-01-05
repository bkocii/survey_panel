
from django.db import models
from users.models import CustomUser
from django.contrib.auth.models import Group
from django.core.exceptions import ValidationError
from django.db.models import Q


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
    ('SINGLE_CHOICE', 'Single choice'),
    ('MULTI_CHOICE', 'Multiple choice'),
    ('TEXT', 'Text'),
    ('RATING', 'Rating Scale'),
    ('DROPDOWN', 'Dropdown'),
    ('MATRIX', 'Matrix'),
    ('PHOTO_UPLOAD', 'Photo Upload'),
    # ('PHOTO_MULTI_UPLOAD', 'Multiple Photos'),
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
    code = models.CharField(max_length=20, unique=False)
    text = models.CharField(max_length=500)  # Question text
    question_type = models.CharField(max_length=20, choices=QUESTION_TYPES)
    required = models.BooleanField(default=True)
    min_value = models.IntegerField(null=True, blank=True, help_text="Minimum value (for sliders)")
    max_value = models.IntegerField(null=True, blank=True, help_text="Maximum value (for sliders)")
    step_value = models.IntegerField(null=True, blank=True, help_text="Step value (for sliders)")
    allow_multiple_files = models.BooleanField(default=False, help_text="Allow multiple files upload (images only)")
    allows_multiple = models.BooleanField(default=False, help_text="Allow multiple selections (for Image Choice only)?")
    sort_index = models.PositiveIntegerField(default=0, db_index=True)
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
    visibility_rules = models.JSONField(blank=True, null=True, default=dict, help_text="JSON rule for display logic.")

    def __str__(self):
        return self.text  # String representation for admin

    def clean(self):
        errors = {}

        # MATRIX requires a mode; non-MATRIX must NOT carry a mode
        if self.question_type == 'MATRIX':
            if not self.matrix_mode:
                errors['matrix_mode'] = 'Select a matrix mode for MATRIX questions.'
        else:
            if self.matrix_mode:
                errors['matrix_mode'] = 'Matrix mode must be empty unless the question type is MATRIX.'

        # SLIDER requires min/max (and sane values)
        if self.question_type == 'SLIDER':
            if self.min_value is None or self.max_value is None:
                errors['min_value'] = 'Min value is required for slidersss.'
                errors['max_value'] = 'Max value is required for sliders.'
            elif self.min_value >= self.max_value:
                errors['max_value'] = 'Max must be greater than Min.'
            if self.step_value is not None and self.step_value <= 0:
                errors['step_value'] = 'Step must be a positive integer.'

        # Helper media pair
        if self.helper_media and not self.helper_media_type:
            errors['helper_media_type'] = 'Pick a media type when uploading a helper file.'
        if self.helper_media_type and not self.helper_media:
            errors['helper_media'] = 'Upload a helper file when selecting a media type.'

        # Allows-multiple: only for IMAGE_CHOICE
        if self.allows_multiple and self.question_type != 'IMAGE_CHOICE':
            errors['allows_multiple'] = 'This option is only valid for Image Choice.'

        # allow_multiple_files: only for *_UPLOAD types
        upload_types = {'PHOTO_UPLOAD', 'PHOTO_MULTI_UPLOAD', 'VIDEO_UPLOAD', 'AUDIO_UPLOAD'}
        if self.allow_multiple_files and self.question_type not in upload_types:
            errors['allow_multiple_files'] = 'Multiple files is only valid for upload-type questions.'

        if self.allow_multiple_files and self.question_type != 'PHOTO_UPLOAD':
            raise ValidationError("“Allow multiple files” is only valid for Photo Upload.")

        if errors:
            raise ValidationError(errors)

    class Meta:
        ordering = ("sort_index", "id")
        constraints = [
            # matrix_mode only when MATRIX
            models.CheckConstraint(
                name="matrix_mode_only_for_matrix",
                check=Q(question_type='MATRIX', matrix_mode__isnull=False) | ~Q(question_type='MATRIX')
            ),
            # allows_multiple only for IMAGE_CHOICE
            models.CheckConstraint(
                name="allows_multiple_only_for_image_choice",
                check=Q(question_type='IMAGE_CHOICE') | Q(allows_multiple=False)
            ),
            # allow_multiple_files only for upload types
            models.CheckConstraint(
                name="multi_files_only_for_uploads",
                check=(
                        Q(question_type__in=['PHOTO_UPLOAD', 'PHOTO_MULTI_UPLOAD', 'VIDEO_UPLOAD', 'AUDIO_UPLOAD'])
                        | Q(allow_multiple_files=False)
                )
            ),
        ]


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


