from django.contrib import admin
from django.core.serializers.json import DjangoJSONEncoder
from django.forms import BaseInlineFormSet
from django.shortcuts import render, redirect, get_object_or_404, reverse
import nested_admin
import json
from collections import defaultdict
from django.urls import path
from unfold.sites import UnfoldAdminSite
from unfold.admin import ModelAdmin, StackedInline, TabularInline
from django import forms
from .forms import QuestionAdminForm, WizardQuestionForm, ChoiceWizardForm, MatrixColWizardForm, MatrixRowWizardForm
from datetime import date
import csv
from django.utils.html import format_html
from django.http import HttpResponse
from .models import Survey, Question, Choice, Response, Submission, MatrixRow, MatrixColumn
from notifications.tasks import send_survey_notification
import os
import zipfile
from django.utils.text import slugify
from io import BytesIO, StringIO
from django.db.models import Max, Prefetch


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


class MatrixColumnInlineForm(forms.ModelForm):
    class Meta:
        model = MatrixColumn
        fields = ['label', 'input_type','group', 'value', 'order', 'required', 'next_question']
        list_editable = ['order']
        ordering = ['group', 'order']


class MatrixColumnInline(TabularInline):
    model = MatrixColumn
    form = MatrixColumnInlineForm
    fk_name = 'question'
    extra = 0
    fields = ['value', 'label', 'input_type', 'group', 'order', 'required', 'next_question']


class MatrixRowInline(TabularInline):
    model = MatrixRow
    extra = 0
    fields = ('value', 'text', 'required')


# Inline admin for Choices, nested within Question
class ChoiceInline(TabularInline):
    model = Choice
    extra = 0  # Two empty choice forms
    fields = ('value', 'text', 'next_question', 'image', 'image_preview')
    readonly_fields = ('image_preview',)
    fk_name = 'question'  # 🔧 Tells Django which FK relates to the parent
    show_change_link = True

    def image_preview(self, obj):
        if obj.image:
            return format_html('<img src="{}" style="max-height: 60px;"/>', obj.image.url)
        return "-"

    image_preview.short_description = "Preview"


# Inline admin for Questions, nested within Survey
class QuestionInline(TabularInline):
    model = Question
    extra = 0
    fields = ('question_type', 'text')  # Step 1: Minimal visible fields only
    show_change_link = True
    inlines = [MatrixColumnInline, MatrixRowInline]  # We'll add conditionally with JS later

    class Media:
        js = ('admin/js/question_wizard.js',)


# Inline admin for Responses, within Question (for QuestionAdmin)
class ResponseInline(TabularInline):
    model = Response
    # extra = 1
    fields = ('user', 'choice', 'text_answer', 'submitted_at')
    readonly_fields = ('submitted_at',)
    raw_id_fields = ('user',)
    show_change_link = True
    fk_name = 'question'


# Admin configuration for Survey model
@admin.register(Survey)
class SurveyAdmin(ModelAdmin):
    list_display = ('title', 'is_active', 'points_reward', 'created_at')
    list_filter = ('is_active', 'created_at', 'groups')
    search_fields = ('title', 'description')
    ordering = ('-created_at',)
    actions = ['send_notifications']
    inlines = [QuestionInline]

    def send_notifications(self, request, queryset):
        for survey in queryset:
            send_survey_notification.delay(survey.id)
        self.message_user(request, f"Notifications queued for {queryset.count()} survey(s).")
    send_notifications.short_description = "Send notifications to assigned groups"

    def get_urls(self):
        print("🔧 Custom admin URLs loaded for SurveyAdmin")
        urls = super().get_urls()
        custom_urls = [
            path('<int:survey_id>/add-question-wizard/', self.admin_site.admin_view(self.add_question_wizard),
                 name='survey_add_question_wizard'),
        ]
        return custom_urls + urls

    def add_question_wizard(self, request, survey_id):
        from django.forms import inlineformset_factory
        from django.contrib import messages
        from .models import Choice, MatrixRow, MatrixColumn, Question, Survey
        from .forms import WizardQuestionForm
        from django.shortcuts import get_object_or_404, render, redirect

        survey = get_object_or_404(Survey, id=survey_id)
        all_questions = Question.objects.filter(survey=survey).order_by("sort_index", 'id').only('id', 'text')
        all_questions_full = Question.objects.all()
        all_question_ids = list(all_questions.values_list('id', flat=True))

        # --- Early: handle delete from preview ---
        if request.method == 'POST' and 'delete_id' in request.POST:
            del_id = request.POST.get('delete_id')
            if del_id:
                q = Question.objects.filter(pk=del_id, survey=survey).first()
                if q:
                    q.delete()
                    self.message_user(request, "Question deleted.")
                else:
                    self.message_user(request, "Could not delete: question not found for this survey.", level='error')
            return redirect(request.path)  # back to clean add-mode

        # 🆕 Build metadata for logic modal
        qs = survey.questions.order_by("sort_index", "id").prefetch_related(
            Prefetch("choices", queryset=Choice.objects.order_by("id")),
            Prefetch("matrix_rows", queryset=MatrixRow.objects.order_by("id")),
            Prefetch("matrix_columns", queryset=MatrixColumn.objects.order_by("id")),
        )

        logic_questions = []
        for q in qs:
            item = {
                "id": q.id,
                "code": q.code,
                "text": q.text,
                "sort_index": q.sort_index or 0,
                "question_type": q.question_type,
                "choices": [
                    {
                        "id": c.id,
                        "label": c.text,
                        "value": c.value,
                    }
                    for c in q.choices.all()
                ],
            }

            if q.question_type == "MATRIX":
                # rows
                item["matrix_rows"] = [
                    {
                        "id": r.id,
                        "label": r.text,
                        "value": r.value,  # may be None
                    }
                    for r in q.matrix_rows.all()
                ]

                # all columns
                cols = list(q.matrix_columns.all())
                item["matrix_columns"] = [
                    {
                        "id": c.id,
                        "label": c.label,
                        "value": c.value,
                        "group": c.group,
                        "input_type": c.input_type,
                    }
                    for c in cols
                ]

                # SBS groups (for side_by_side only)
                if q.matrix_mode == "side_by_side":
                    from django.utils.text import slugify
                    groups = {}
                    for c in cols:
                        g_name = c.group or "Ungrouped"
                        g_slug = slugify(g_name)
                        groups.setdefault((g_slug, g_name), [])

                    item["matrix_mode"] = "side_by_side"
                    item["sbs_groups"] = [
                        {"slug": slug, "name": name}
                        for (slug, name) in groups.keys()
                    ]
                else:
                    item["matrix_mode"] = q.matrix_mode or "single"

            logic_questions.append(item)

        class SurveyFilteredChoiceFormSet(BaseInlineFormSet):
            def __init__(self, *args, **kwargs):
                self.survey = kwargs.pop("survey", None)
                super().__init__(*args, **kwargs)

            def get_form_kwargs(self, index):
                kwargs = super().get_form_kwargs(index)
                kwargs["survey"] = self.survey
                return kwargs

        # Inline formsets (no "extra"; we add via JS)
        ChoiceFormSet = inlineformset_factory(
            Question,
            Choice,
            form=ChoiceWizardForm,
            formset=SurveyFilteredChoiceFormSet,
            fields=('text', 'value', 'next_question', 'image'),
            fk_name='question',
            extra=0,
            can_delete=True
        )
        MatrixRowFormSet = inlineformset_factory(
            Question,
            MatrixRow,
            form=MatrixRowWizardForm,
            fields=('text', 'value', 'required'),
            extra=0,
            can_delete=True
        )
        MatrixColFormSet = inlineformset_factory(
            Question,
            MatrixColumn,
            form=MatrixColWizardForm,
            fields=('label', 'value', 'input_type', 'required', 'next_question', 'group', 'order'),
            fk_name='question',
            extra=0,
            can_delete=True
        )

        # Helper: go back to a clean wizard (no edit param)
        def redirect_clean():
            return redirect('admin:survey_add_question_wizard', survey_id=survey.id)

        # --- Edit mode detection ---
        # GET ?edit=<id> on first load, POST carries hidden edit_id to persist instance on validation errors
        edit_id = request.POST.get('edit_id') or request.GET.get('edit')
        instance = None
        if edit_id:
            instance = Question.objects.filter(pk=edit_id, survey=survey).first()
            if not instance:
                messages.error(request, "That question does not belong to this survey (or no longer exists).")
                return redirect_clean()

        # Early short-circuit: Cancel Editing (do not validate anything)
        if request.method == 'POST' and 'cancel_editing' in request.POST:
            return redirect_clean()

        # Bind forms to instance if editing
        form = WizardQuestionForm(request.POST or None, request.FILES or None, instance=instance)
        choice_formset = ChoiceFormSet(request.POST or None, request.FILES or None, instance=instance, survey=survey,prefix='choices')
        row_formset = MatrixRowFormSet(request.POST or None, request.FILES or None, instance=instance,
                                       prefix='matrix_rows')
        col_formset = MatrixColFormSet(request.POST or None, request.FILES or None, instance=instance,
                                       prefix='matrix_cols')

        def active_count(fs):
            # count non-deleted forms; valid() must run first to populate cleaned_data
            return sum(1 for f in fs.forms if getattr(f, "cleaned_data", None) and not f.cleaned_data.get('DELETE'))

        def render_wizard():
            ctx = {
                'form': form,
                'survey': survey,
                'title': f"{'Edit' if instance else 'Add'} Question Wizard for {survey.title}",
                'choice_inline': choice_formset,
                'matrix_row_inline': row_formset,
                'matrix_column_inline': col_formset,
                'all_questions': all_questions,
                'all_questions_full': all_questions_full,
                'all_question_ids': all_question_ids,
                # expose current editing instance to template
                'editing': instance,
                # Unfold admin bits
                "site_title": "Survey Wizard",
                "site_header": "Survey Builder",
                "has_permission": True,
                "available_apps": [],
                "current_app": "surveys",
                "logic_questions_json": json.dumps(logic_questions, cls=DjangoJSONEncoder),
            }
            return render(request, 'admin/surveys/add_question_wizard.html', ctx)

        if request.method != 'POST':
            return render_wizard()

        # -------- POST validation pipeline --------
        # Run base validation first
        base_valid = form.is_valid() and choice_formset.is_valid() and row_formset.is_valid() and col_formset.is_valid()
        if not base_valid:
            return render_wizard()

        # Relational requirements
        qtype = form.cleaned_data.get('question_type')
        mode = form.cleaned_data.get('matrix_mode')

        needs_choices = {'SINGLE_CHOICE', 'MULTI_CHOICE', 'RATING', 'DROPDOWN', 'IMAGE_CHOICE', 'IMAGE_RATING'}
        rel_error = False

        if qtype in needs_choices and active_count(choice_formset) == 0:
            choice_formset._non_form_errors = choice_formset.error_class(['Add at least one choice.'])
            rel_error = True

        if qtype == 'MATRIX':
            if active_count(row_formset) == 0:
                row_formset._non_form_errors = row_formset.error_class(['Add at least one row.'])
                rel_error = True
            if active_count(col_formset) == 0:
                col_formset._non_form_errors = col_formset.error_class(['Add at least one column.'])
                rel_error = True
            # Mode required for MATRIX
            if not mode:
                form.add_error('matrix_mode', 'Please select a matrix mode.')
                rel_error = True

            # Side-by-side requires group & input_type per kept column
            if mode == 'side_by_side':
                for f in col_formset.forms:
                    cd = getattr(f, 'cleaned_data', None)
                    if not cd or cd.get('DELETE'):
                        continue
                    if not cd.get('group'):
                        f.add_error('group', 'Group is required for side-by-side mode.')
                        rel_error = True
                    if not cd.get('input_type'):
                        f.add_error('input_type', 'Input type is required.')
                        rel_error = True

        # Image-required for image-based question types
        if qtype in {'IMAGE_CHOICE', 'IMAGE_RATING'}:
            for f in choice_formset.forms:
                cd = getattr(f, 'cleaned_data', None)
                if not cd or cd.get('DELETE'):
                    continue
                # require an image either newly uploaded or already on instance
                img = cd.get('image') or getattr(f.instance, 'image', None)
                if not img:
                    f.add_error('image', 'Image is required for this question type.')
                    rel_error = True

        if rel_error:
            return render_wizard()

        # -------- Save (create or update) --------
        question = form.save(commit=False)
        question.survey = survey  # enforce correct survey even in edit mode
        question.save()
        form.save_m2m()

        choice_formset.instance = question
        row_formset.instance = question
        col_formset.instance = question
        choice_formset.save()
        row_formset.save()
        col_formset.save()

        if not instance:  # newly created
            max_si = (Question.objects.filter(survey=survey).aggregate(m=Max("sort_index"))["m"]) or 0
            question.sort_index = max_si + 1
            question.save(update_fields=["sort_index"])

        # Success messages
        if instance:
            self.message_user(request, "Question updated.")
        else:
            self.message_user(request, "Question created.")

        # ✅ After either update or create, return to a clean wizard (initial state)
        return redirect_clean()

    def change_view(self, request, object_id, form_url='', extra_context=None):
        extra_context = extra_context or {}
        extra_context['add_question_wizard_url'] = reverse('admin:survey_add_question_wizard', args=[object_id])
        return super().change_view(request, object_id, form_url, extra_context=extra_context)

    def response_add(self, request, obj, post_url_continue=None):
        """After creating a new survey, redirect to the question wizard."""
        if "_addanother" not in request.POST:
            return redirect(
                f"/admin/surveys/survey/{obj.pk}/add-question-wizard/"
            )
        return super().response_add(request, obj, post_url_continue)


# Admin configuration for Question model
@admin.register(Question)
class QuestionAdmin(ModelAdmin):
    list_display = (
        'text', 'survey', 'question_type', 'matrix_mode', 'allows_multiple', 'visibility_rules'
    )
    list_filter = ('survey', 'question_type', 'matrix_mode')
    form = QuestionAdminForm
    search_fields = ('text',)
    inlines = [ChoiceInline, MatrixRowInline, MatrixColumnInline]
    ordering = ('survey',)

    fieldsets = (
        (None, {
            'fields': (
                'survey', 'code', 'text', 'question_type', 'matrix_mode', 'next_question', 'required',
                'min_value', 'max_value', 'step_value',
                'allow_multiple_files', 'allows_multiple',
                'helper_text', 'helper_media', 'helper_media_type', 'visibility_rules' # updated here
            )
        }),
    )

    class Media:
        js = ('admin/js/question_wizard.js',)  # Create this file next


# Admin configuration for Choice model
@admin.register(Choice)
class ChoiceAdmin(ModelAdmin):
    list_display = ('text', 'question', 'value')
    list_filter = ('question__survey',)
    search_fields = ('text',)
    ordering = ('question',)


# Admin configuration for Response model
@admin.register(Response)
class ResponseAdmin(ModelAdmin):
    list_display = ('user', 'survey', 'question', 'choice', 'text_answer', 'media_preview', 'submitted_at')
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
    readonly_fields = ('submitted_at', 'media_preview')

    actions = ['export_as_csv', 'download_media_zip']

    def media_preview(self, obj):
        if obj.media_upload:
            url = obj.media_upload.url
            name = obj.media_upload.name.lower()
            if name.endswith(('.jpg', '.jpeg', '.png', '.gif')):
                return format_html(f'<img src="{url}" width="100" />')
            elif name.endswith(('.mp4', '.mov', '.webm')):
                return format_html(f'''
                    <video width="200" controls>
                        <source src="{url}">
                        Your browser does not support the video tag.
                    </video>
                ''')
            else:
                return format_html(f'<a href="{url}">Download</a>')
        return "-"

    media_preview.short_description = "Media"

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

    def download_media_zip(self, request, queryset):
        zip_buffer = BytesIO()
        zip_file = zipfile.ZipFile(zip_buffer, 'w')

        # Prepare CSV metadata
        csv_text_io = StringIO()
        csv_writer = csv.writer(csv_text_io)
        csv_writer.writerow(['User', 'Survey', 'Question', 'Filename', 'Timestamp', 'Media URL'])

        for response in queryset:
            if response.media_upload:
                try:
                    path = response.media_upload.path
                    filename = os.path.basename(path)
                    url = response.media_upload.url

                    # Clean folder name using slugified question text
                    question_folder = slugify(response.question.text[:50])
                    zip_path = f"{question_folder}/{response.user.username}_{slugify(filename)}"

                    # Add file to ZIP under question folder
                    zip_file.write(path, arcname=zip_path)

                    # Add metadata row
                    csv_writer.writerow([
                        response.user.username,
                        response.survey.title,
                        response.question.text,
                        filename,
                        response.submitted_at,
                        url
                    ])
                except FileNotFoundError:
                    continue  # skip missing file

        # Add metadata CSV at root of ZIP
        zip_file.writestr("metadata.csv", csv_text_io.getvalue())
        zip_file.close()
        zip_buffer.seek(0)

        return HttpResponse(
            zip_buffer.getvalue(),
            content_type='application/zip',
            headers={'Content-Disposition': 'attachment; filename="media_responses_by_question.zip"'},
        )

    download_media_zip.short_description = "Download selected media + metadata as ZIP"


@admin.register(Submission)
class SubmissionAdmin(ModelAdmin):
    list_display = ('user', 'survey', 'submitted_at', 'duration_seconds')
    list_filter = ('user', 'survey', 'submitted_at', 'duration_seconds')
    search_fields = ('user__username', 'survey__title')
