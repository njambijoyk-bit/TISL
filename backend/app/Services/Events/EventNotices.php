<?php

namespace App\Services\Events;

use App\Models\Customer;
use App\Models\Events\Event;
use App\Models\Events\EventRefundRequest;
use App\Models\Events\EventTicket;
use App\Services\Notify\Staff;
use App\Services\Notify\Notifier;
use Illuminate\Support\Collection;

/** Tells ticket buyers what they need to know. Goes to the buyer's account, or, for someone without one, to the email and phone given at checkout. Never raises: a problem telling someone must not undo a sale. */
final class EventNotices
{
    public function __construct(private Notifier $notifier, private ?Staff $staff = null)
    {
    }

    /** The tickets just became valid: send them. @param Collection<int, EventTicket> $tickets one purchase */
    public function ticketsIssued(Collection $tickets): void
    {
        $this->safely(function () use ($tickets) {
            if ($tickets->isEmpty()) {
                return;
            }
            $first = $tickets->first();
            $event = Event::withTrashed()->with('sessions')->find($first->event_id);
            $this->tell($first, 'event_ticket', ($tickets->count() === 1 ? 'Your ticket for ' : 'Your tickets for ') . $event->title, $this->body($event, $tickets), '/tickets/' . TicketCodes::code($first), 'View my tickets');
        });
    }

    /** "Send me my tickets again": all the buyer's valid tickets for events still to come, in one message. @param Collection<int, EventTicket> $tickets */
    public function resend(string $email, Collection $tickets): void
    {
        $this->safely(function () use ($email, $tickets) {
            foreach ($tickets->groupBy('event_id') as $eventId => $group) {
                $event = Event::withTrashed()->with('sessions')->find($eventId);
                $first = $group->first();
                $this->notifier->sendToContact(['name' => $first->buyer_name, 'email' => $email, 'phone' => null], 'event_ticket', 'Your tickets for ' . $event->title, $this->body($event, $group),
                    ['action_url' => '/tickets/' . TicketCodes::code($first), 'action_text' => 'View my tickets']);
            }
        });
    }

    // ------------------------------------------------------------ the event changed

    /** Everyone who holds a valid ticket, one message each (a buyer of five tickets gets one). @return Collection<int, Collection<int, EventTicket>> */
    private function holders(Event $event): Collection
    {
        return EventTicket::where('event_id', $event->id)->where('state', EventTicket::VALID)->orderBy('id')->get()->groupBy(fn ($t) => $t->customer_id ? 'c' . $t->customer_id : 'e' . strtolower((string) $t->buyer_email))->values();
    }

    /** @param callable(Collection<int, EventTicket>): array{0: string, 1: string} $make title and message for one holder */
    private function toHolders(Event $event, string $type, callable $make): int
    {
        $n = 0;
        $this->safely(function () use ($event, $type, &$n, $make) {
            foreach ($this->holders($event) as $group) {
                [$title, $message] = $make($group);
                $this->tell($group->first(), $type, $title, $message, '/tickets/' . TicketCodes::code($group->first()), 'View my tickets');
                $n++;
            }
        });

        return $n;
    }

    /** Staff cancelled the event: every holder is told, and a paid ticket's refund is already waiting for staff. */
    public function eventCancelled(Event $event): int
    {
        return $this->toHolders($event, 'event_changed', fn ($g) => ["{$event->title} has been cancelled", "We are very sorry: {$event->title} has been cancelled.
"
            . ($g->sum('price') > 0 ? "A refund for your " . ($g->count() === 1 ? 'ticket' : 'tickets') . ' is being arranged: you do not need to do anything. We will tell you when the money has been sent back.' : 'Your ' . ($g->count() === 1 ? 'ticket is' : 'tickets are') . ' no longer needed.')]);
    }

    public function eventPostponed(Event $event): int
    {
        return $this->toHolders($event, 'event_changed', fn ($g) => ["{$event->title} has been postponed", "{$event->title} has been postponed. We will tell you the new date as soon as it is set.
"
            . 'Your ' . ($g->count() === 1 ? 'ticket stays' : 'tickets stay') . ' valid for the new date. If you can not make it, you can ask for a refund from your ticket page at any time.']);
    }

    /** The postponed event has its new date. */
    public function eventRescheduled(Event $event): int
    {
        $event->loadMissing('sessions');
        $when = $event->sessions->where('is_cancelled', false)->map(fn ($s) => $s->starts_at->format('D j M Y, H:i'))->implode("
");

        return $this->toHolders($event, 'event_changed', fn ($g) => ["{$event->title} has a new date", "{$event->title} is back on:
{$when}
Your " . ($g->count() === 1 ? 'ticket is' : 'tickets are') . ' valid for the new date. If it does not suit you, you can ask for a refund from your ticket page.']);
    }

    /** Staff tell the holders something (a change of time or place, a reminder to bring ID). */
    public function eventMessage(Event $event, string $message): int
    {
        return $this->toHolders($event, 'event_changed', fn ($g) => ["News about {$event->title}", trim($message)]);
    }

    // ------------------------------------------------------------ refunds

    /** A holder asked for money back: the people who decide are told. */
    public function refundRequested(EventRefundRequest $r, EventTicket $t, Event $event): void
    {
        $this->safely(function () use ($r, $t, $event) {
            foreach (($this->staff ?? app(Staff::class))->holding('events.refund') as $user) {
                $this->notifier->send($user, 'event_refund_requested', 'Ticket refund asked for: ' . $event->title,
                    ($t->buyer_name ?: $t->buyer_email) . " asked for ticket {$t->reference} to be refunded." . ($r->reason ? ' “' . $r->reason . '”' : ''), ['action_url' => '/admin/events?tab=refunds', 'action_text' => 'Decide']);
            }
        });
    }

    /** Staff decided: the buyer is told, with the reason when it was declined. */
    public function refundDecided(EventRefundRequest $r, bool $approved, ?string $refundedTo): void
    {
        $this->safely(function () use ($r, $approved, $refundedTo) {
            $t = EventTicket::with('type')->find($r->ticket_id);
            $event = Event::withTrashed()->find($r->event_id);
            if (! $t || ! $event) {
                return;
            }
            $amount = (float) $r->amount;
            $this->tell($t, 'event_refund', $approved ? "Your ticket for {$event->title} is refunded" : "About your refund request for {$event->title}",
                $approved
                    ? "We have cancelled ticket {$t->reference} for {$event->title}" . ($amount > 0 ? ' and are refunding ' . number_format($amount, 2) . ($refundedTo ? " ({$refundedTo})" : '') . '. Card refunds can take a few days to show on your statement.' : '.') . ($r->decision_note ? " {$r->decision_note}" : '')
                    : "We could not refund ticket {$t->reference} for {$event->title}. {$r->decision_note} The ticket is still valid.",
                '/tickets/' . TicketCodes::code($t), $approved ? 'View my tickets' : 'View my ticket');
        });
    }

    /** @param Collection<int, EventTicket> $tickets */
    private function body(Event $event, Collection $tickets): string
    {
        $start = $event->sessions->where('is_cancelled', false)->first();
        $lines = [($tickets->count() === 1 ? 'Here is your ticket' : "Here are your {$tickets->count()} tickets") . ' for ' . $event->title . ($start ? ' on ' . $start->starts_at->format('D j M Y, H:i') . ($event->sessions->where('is_cancelled', false)->count() > 1 ? ' (and more dates)' : '') : '') . '.'];
        if ($event->kind !== 'online' && $event->venue_name) {
            $lines[] = 'Where: ' . $event->venue_name . ($event->venue_address ? ', ' . $event->venue_address : '');
        }
        $lines[] = '';
        foreach ($tickets as $t) {
            $lines[] = '• ' . ($t->type?->name ?? 'Ticket') . ' for ' . ($t->holder_name ?: $t->buyer_name) . ' — reference ' . $t->reference;
        }
        $lines[] = '';
        $lines[] = 'Open the button below to see each ticket\'s QR code. Show it at the door, on your phone or printed.' . (in_array($event->kind, ['online', 'hybrid'], true) ? ' The link to join online is on your ticket page.' : '');
        if (($note = (string) (EventSettings::all()['ticket_note'] ?? '')) !== '') {
            $lines[] = $note;
        }

        return implode("\n", $lines);
    }

    private function tell(EventTicket $to, string $type, string $title, string $message, string $url, string $button): void
    {
        $o = ['action_url' => $url, 'action_text' => $button];
        $customer = $to->customer_id ? Customer::find($to->customer_id) : null;
        if ($customer) {
            $this->notifier->send($customer, $type, $title, $message, $o);

            return;
        }
        $this->notifier->sendToContact(['name' => $to->buyer_name, 'email' => $to->buyer_email, 'phone' => $to->buyer_phone], $type, $title, $message, $o);
    }

    private function safely(callable $fn): void
    {
        try {
            $fn();
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
