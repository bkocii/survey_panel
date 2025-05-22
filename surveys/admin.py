
from django.contrib import admin
from .models import Survey, Question, Choice, Response


# Inline admin for Questions to manage them within Survey admin
class QuestionInline(admin.TabularInline):
    model = Question
    extra = 1  # Number of empty question forms to display
    show_change_link = True  # Allow editing individual questions


# Inline admin for Choices to manage them within Question admin
class ChoiceInline(admin.TabularInline):
    model = Choice
    extra = 2  # Number of empty choice forms to display


# Admin configuration for Survey model
@admin.register(Survey)
class SurveyAdmin(admin.ModelAdmin):
    # Fields to display in the admin list view
    list_display = ('title', 'is_active', 'points_reward', 'created_at')
    # Fields to filter by
    list_filter = ('is_active', 'created_at')
    # Fields to search by
    search_fields = ('title', 'description')
    # Include inline Questions
    inlines = [QuestionInline]
    # Enable sorting by these fields
    ordering = ('-created_at',)


# Admin configuration for Question model
@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    # Fields to display in the admin list view
    list_display = ('text', 'survey', 'question_type')
    # Fields to filter by
    list_filter = ('survey', 'question_type')
    # Fields to search by
    search_fields = ('text',)
    # Include inline Choices
    inlines = [ChoiceInline]
    # Enable sorting by survey
    ordering = ('survey',)


# Admin configuration for Choice model
@admin.register(Choice)
class ChoiceAdmin(admin.ModelAdmin):
    # Fields to display in the admin list view
    list_display = ('text', 'question')
    # Fields to filter by
    list_filter = ('question__survey',)
    # Fields to search by
    search_fields = ('text',)
    # Enable sorting by question
    ordering = ('question',)


# Admin configuration for Response model
@admin.register(Response)
class ResponseAdmin(admin.ModelAdmin):
    # Fields to display in the admin list view
    list_display = ('user', 'survey', 'question', 'choice', 'text_answer', 'submitted_at')
    # Fields to filter by
    list_filter = ('survey', 'question', 'submitted_at')
    # Fields to search by
    search_fields = ('user__username', 'survey__title', 'question__text', 'text_answer')
    # Enable sorting by submission date
    ordering = ('-submitted_at',)
    # Make fields read-only to prevent accidental changes
    readonly_fields = ('submitted_at',)

