<?php

namespace App\Services\Events;

use App\Models\Customer;
use App\Models\Events\Event;
use App\Models\Events\EventTicket;
use App\Services\Notify\Notifier;
use Illuminate\Support\Collection;

/** Tells ticket buyers what they need to know. Goes to the buyer's account, or, for someone without one, to the email and phone given at checkout. Never raises: a problem telling someone must not undo a sale. */
final class EventNotices
{
    public function __construct(private Notifier $notifier)
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
