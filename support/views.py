from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404, redirect, render

from .forms import TicketCreateForm, TicketReplyForm
from .models import SupportTicket, TicketMessage


@login_required
def ticket_list(request):
    tickets = SupportTicket.objects.filter(user=request.user)
    return render(request, "support/ticket_list.html", {"tickets": tickets})


@login_required
def ticket_create(request):
    if request.method == "POST":
        form = TicketCreateForm(request.POST)
        if form.is_valid():
            ticket = form.save(commit=False)
            ticket.user = request.user
            ticket.status = "open"
            ticket.save()

            TicketMessage.objects.create(
                ticket=ticket,
                sender=request.user,
                message=form.cleaned_data["first_message"],
            )

            messages.success(request, "Support ticket created.")
            return redirect("support:ticket_detail", pk=ticket.pk)
    else:
        form = TicketCreateForm()

    return render(request, "support/ticket_create.html", {"form": form})


@login_required
def ticket_detail(request, pk: int):
    ticket = get_object_or_404(SupportTicket, pk=pk, user=request.user)
    messages_qs = ticket.messages.select_related("sender").all()

    if request.method == "POST":
        form = TicketReplyForm(request.POST)
        if form.is_valid():
            TicketMessage.objects.create(
                ticket=ticket,
                sender=request.user,
                message=form.cleaned_data["message"],
            )
            ticket.status = "open"  # bump back to open on user reply
            ticket.save(update_fields=["status", "updated_at"])

            messages.success(request, "Reply sent.")
            return redirect("support:ticket_detail", pk=ticket.pk)
    else:
        form = TicketReplyForm()

    return render(request, "support/ticket_detail.html", {
        "ticket": ticket,
        "messages_qs": messages_qs,
        "form": form,
    })