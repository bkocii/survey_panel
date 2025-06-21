from django.contrib import admin
import nested_admin
from datetime import date
import csv
from django.http import HttpResponse
from .models import Survey, Question, Choice, Response, Submission, MatrixRow, MatrixColumn
from notifications.tasks import send_survey_notification


# Age range filter using date_of_birth
class AgeRangeFilter(admin.SimpleListFilter):
    title = 'Age Range'
    parameter_name = 'age_range'

    def lookups(self, request, model_admin):
        return [
            ('under18', 'Under 18'),
            ('18-30', '18 to 30'),
            ('31-50', '31 to 50'),
            ('51+', '51 and above'),
        ]

    def queryset(self, request, queryset):
        today = date.today()

        def calc_birthdate(years):
            return date(today.year - years, today.month, today.day)

        if self.value() == 'under18':
            return queryset.filter(user__date_of_birth__gt=calc_birthdate(18))
        elif self.value() == '18-30':
            return queryset.filter(user__date_of_birth__lte=calc_birthdate(18),
                                   user__date_of_birth__gt=calc_birthdate(30))
        elif self.value() == '31-50':
            return queryset.filter(user__date_of_birth__lte=calc_birthdate(30),
                                   user__date_of_birth__gt=calc_birthdate(50))
        elif self.value() == '51+':
            return queryset.filter(user__date_of_birth__lte=calc_birthdate(50))

        return queryset

class MatrixRowInline(nested_admin.NestedTabularInline):
    model = MatrixRow
    extra = 1

class MatrixColumnInline(nested_admin.NestedTabularInline):
    model = MatrixColumn
    extra = 1

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
    inlines = [ChoiceInline, MatrixRowInline, MatrixColumnInline]  # Nest ChoiceInline here

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
    list_filter = ('survey',
                   'question',
                   'submitted_at',
                   'submission',
                   'survey__groups',
                   'submitted_at',
                   'user__gender',
                   AgeRangeFilter,)
    search_fields = ('user__username', 'survey__title', 'question__text', 'text_answer')
    ordering = ('-submitted_at',)
    readonly_fields = ('submitted_at',)

    actions = ['export_as_csv']

    def export_as_csv(self, request, queryset):
        meta = self.model._meta
        field_names = ['user', 'survey', 'question', 'choice', 'text_answer', 'submitted_at']

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename=responses.csv'
        writer = csv.writer(response)

        writer.writerow(field_names)
        for obj in queryset:
            writer.writerow([
                obj.user.username,
                obj.survey.title,
                obj.question.text,
                obj.choice.text if obj.choice else '',
                obj.text_answer,
                obj.submitted_at,
            ])
        return response

    export_as_csv.short_description = "Export selected responses as CSV"

@admin.register(Submission)
class SubmissionAdmin(admin.ModelAdmin):
    list_display = ('user', 'survey', 'submitted_at')
    list_filter = ('user', 'survey', 'submitted_at')
    search_fields = ('user__username', 'survey__title')
