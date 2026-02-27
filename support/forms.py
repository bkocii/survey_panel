from django import forms
from .models import SupportTicket, TicketMessage


class TicketCreateForm(forms.ModelForm):
    first_message = forms.CharField(
        widget=forms.Textarea(attrs={"rows": 5}),
        help_text="Describe your issue in detail.",
        label="Message",
    )

    class Meta:
        model = SupportTicket
        fields = ["subject", "priority"]


class TicketReplyForm(forms.ModelForm):
    class Meta:
        model = TicketMessage
        fields = ["message"]
        widgets = {"message": forms.Textarea(attrs={"rows": 4})}