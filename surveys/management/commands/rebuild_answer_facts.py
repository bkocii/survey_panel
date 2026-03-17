from django.core.management.base import BaseCommand, CommandError

from surveys.models import Submission
from surveys.analytics import build_submission_answer_facts


class Command(BaseCommand):
    """
    python manage.py rebuild_answer_facts
    python manage.py rebuild_answer_facts --survey-id 5
    python manage.py rebuild_answer_facts --submission-id 42
    python manage.py rebuild_answer_facts --user-id 7
    """
    help = "Rebuild AnswerFact rows from existing submissions."

    def add_arguments(self, parser):
        parser.add_argument(
            '--survey-id',
            type=int,
            dest='survey_id',
            help='Only rebuild submissions for one survey id.',
        )
        parser.add_argument(
            '--submission-id',
            type=int,
            dest='submission_id',
            help='Only rebuild one submission id.',
        )
        parser.add_argument(
            '--user-id',
            type=int,
            dest='user_id',
            help='Only rebuild submissions for one user id.',
        )

    def handle(self, *args, **options):
        survey_id = options.get('survey_id')
        submission_id = options.get('submission_id')
        user_id = options.get('user_id')

        qs = Submission.objects.all().order_by('id')

        if submission_id:
            qs = qs.filter(id=submission_id)

        if survey_id:
            qs = qs.filter(survey_id=survey_id)

        if user_id:
            qs = qs.filter(user_id=user_id)

        total = qs.count()
        if total == 0:
            raise CommandError("No matching submissions found.")

        self.stdout.write(self.style.WARNING(f"Rebuilding AnswerFact rows for {total} submission(s)..."))

        built_total = 0
        for idx, submission in enumerate(qs.iterator(), start=1):
            count = build_submission_answer_facts(submission)
            built_total += count

            self.stdout.write(
                f"[{idx}/{total}] submission #{submission.id} -> {count} fact row(s)"
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. Rebuilt {built_total} AnswerFact row(s) across {total} submission(s)."
            )
        )

