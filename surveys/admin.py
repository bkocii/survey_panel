from django.contrib import admin
import nested_admin
from .models import Survey, Question, Choice, Response, Submission
from notifications.tasks import send_survey_notification

# Inline admin for Choices, nested within Question
class ChoiceInline(nested_admin.NestedTabularInline):
    model = Choice
    extra = 2  # Two empty choice forms
    fields = ('text', 'next_question')
    fk_name = 'question'  # 🔧 Tells Django which FK relates to the parent
    show_change_link = True

# Inline admin for Questions, nested within Survey
class QuestionInline(nested_admin.NestedTabularInline):
    model = Question
    extra = 1  # One empty question form
    fields = ('text', 'question_type', 'next_question')
    show_change_link = True
    inlines = [ChoiceInline]  # Nest ChoiceInline here

# Inline admin for Responses, within Question (for QuestionAdmin)
class ResponseInline(nested_admin.NestedTabularInline):
    model = Response
    extra = 1
    fields = ('user', 'choice', 'text_answer', 'submitted_at')
    readonly_fields = ('submitted_at',)
    raw_id_fields = ('user',)
    show_change_link = True
    fk_name = 'question'

# Admin configuration for Survey model
@admin.register(Survey)
class SurveyAdmin(nested_admin.NestedModelAdmin):
    list_display = ('title', 'is_active', 'points_reward', 'created_at')
    list_filter = ('is_active', 'created_at', 'groups')
    search_fields = ('title', 'description')
    inlines = [QuestionInline]
    ordering = ('-created_at',)
    actions = ['send_notifications']

    def send_notifications(self, request, queryset):
        for survey in queryset:
            send_survey_notification.delay(survey.id)
        self.message_user(request, f"Notifications queued for {queryset.count()} survey(s).")
    send_notifications.short_description = "Send notifications to assigned groups"

# Admin configuration for Question model
@admin.register(Question)
class QuestionAdmin(nested_admin.NestedModelAdmin):
    list_display = ('text', 'survey', 'question_type')
    list_filter = ('survey', 'question_type')
    search_fields = ('text',)
    inlines = [ChoiceInline, ResponseInline]
    ordering = ('survey',)

# Admin configuration for Choice model
@admin.register(Choice)
class ChoiceAdmin(admin.ModelAdmin):
    list_display = ('text', 'question')
    list_filter = ('question__survey',)
    search_fields = ('text',)
    ordering = ('question',)


# Admin configuration for Response model
@admin.register(Response)
class ResponseAdmin(admin.ModelAdmin):
    list_display = ('user', 'survey', 'question', 'choice', 'text_answer', 'submitted_at', 'submission')
    list_filter = ('survey', 'question', 'submitted_at', 'submission', 'survey__groups', 'submitted_at')
    search_fields = ('user__username', 'survey__title', 'question__text', 'text_answer')
    ordering = ('-submitted_at',)
    readonly_fields = ('submitted_at',)

@admin.register(Submission)
class SubmissionAdmin(admin.ModelAdmin):
    list_display = ('user', 'survey', 'submitted_at')
    list_filter = ('survey', 'submitted_at')
    search_fields = ('user__username', 'survey__title')
