<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Events\Event;
use App\Models\Events\EventTicket;
use App\Services\Events\EventException;
use App\Services\Events\EventNotices;
use App\Services\Events\EventRefunds;
use App\Services\Events\TicketCodes;
use App\Services\Events\TicketPdf;
use App\Services\Events\TicketPresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * A ticket holder's side. A ticket's code is the key: whoever holds the link (the buyer, or the person it was passed to) can see it, show its QR, download it and, until the event, change
 * the name on it. No sign-in is needed. A signed-in customer also has a list of all their tickets.
 */
class EventTicketController extends Controller
{
    public function __construct(private TicketPresenter $present, private TicketPdf $pdf, private EventNotices $notices, private EventRefunds $refunds)
    {
    }

    private function find(string $code): EventTicket
    {
        return TicketCodes::find($code) ?? abort(404);
    }

    public function show(string $code): JsonResponse
    {
        return response()->json($this->present->page($this->find($code)));
    }

    /** The QR as a picture. It holds the address of the ticket's code, so a phone camera opens the ticket and the door scanner reads the code. */
    public function qr(string $code): Response
    {
        return response(TicketCodes::qrSvg($this->find($code)), 200, ['Content-Type' => 'image/svg+xml', 'Cache-Control' => 'private, max-age=3600']);
    }

    /** All the tickets of the booking as one PDF. */
    public function pdf(string $code): Response|JsonResponse
    {
        $t = $this->find($code);
        try {
            return response($this->pdf->render($this->present->booking($t)), 200, ['Content-Type' => 'application/pdf', 'Content-Disposition' => 'attachment; filename="tickets-' . $t->reference . '.pdf"']);
        } catch (EventException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    /** PUT /tickets/{code}/holder {name}: pass a ticket on. Until the event, when the event allows it. */
    public function rename(Request $request, string $code): JsonResponse
    {
        $d = $request->validate(['name' => 'required|string|max:160']);
        $t = $this->find($code);
        $e = Event::withTrashed()->findOrFail($t->event_id);
        if ($t->state !== EventTicket::VALID) {
            return response()->json(['message' => 'This ticket is ' . $t->state . ': its name can not be changed.'], 422);
        }
        if (! $e->allow_name_change) {
            return response()->json(['message' => 'The organiser does not allow the name on a ticket to be changed.'], 422);
        }
        if ($e->isOver()) {
            return response()->json(['message' => 'This event is over.'], 422);
        }
        $t->update(['holder_name' => trim($d['name'])]);

        return response()->json(['message' => 'Saved.', 'holder_name' => $t->holder_name]);
    }

    /** POST /tickets/{code}/refund {reason}: hand a ticket back. A paid one becomes a request for staff; a free one is cancelled at once. */
    public function refund(Request $request, string $code): JsonResponse
    {
        $d = $request->validate(['reason' => 'nullable|string|max:300']);
        $t = $this->find($code);
        try {
            $r = $this->refunds->request($t, (string) ($d['reason'] ?? ''), $request->user()?->email);
        } catch (EventException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['message' => $r['message'], 'cancelled' => $r['cancelled']]);
    }

    /** POST /tickets/resend {email}: "I lost my tickets". The answer is the same whether or not tickets were found, so this can not be used to find out who bought. */
    public function resend(Request $request): JsonResponse
    {
        $d = $request->validate(['email' => 'required|email|max:190']);
        $tickets = EventTicket::where('buyer_email', $d['email'])->where('state', EventTicket::VALID)->orderBy('id')->get()
            ->filter(fn ($t) => ! Event::withTrashed()->with('sessions')->find($t->event_id)?->isOver());
        if ($tickets->isNotEmpty()) {
            $this->notices->resend($d['email'], $tickets->values());
        }

        return response()->json(['message' => 'If there are tickets bought with that email address for events still to come, we have sent them there.']);
    }

    /** GET /customer/events/tickets: a signed-in customer's valid tickets for events still to come, and what they have been to. */
    public function mine(Request $request): JsonResponse
    {
        $u = $request->user();
        $cid = $u?->customer?->id;
        $tickets = EventTicket::where(fn ($w) => $w->when($cid, fn ($x) => $x->where('customer_id', $cid))->orWhere(fn ($x) => $x->whereNotNull('buyer_email')->where('buyer_email', $u?->email ?: '-')))
            ->whereIn('state', [EventTicket::VALID, EventTicket::CANCELLED])->orderByDesc('id')->get();
        $events = Event::withTrashed()->with('sessions')->whereIn('id', $tickets->pluck('event_id'))->get()->keyBy('id');
        $rows = $tickets->map(function ($t) use ($events) {
            $e = $events[$t->event_id] ?? null;
            $next = $e?->sessions->where('is_cancelled', false)->filter(fn ($s) => ($s->ends_at ?? $s->starts_at)->isFuture())->first() ?? $e?->sessions->first();

            return ['code' => TicketCodes::code($t), 'reference' => $t->reference, 'state' => $t->state, 'holder_name' => $t->holder_name, 'type' => $t->type?->name, 'event' => $e?->title, 'slug' => $e?->slug,
                'image_url' => $e?->main_image ? asset($e->main_image) : null, 'when' => $next?->starts_at?->format('Y-m-d\TH:i'), 'over' => (bool) $e?->isOver(), 'venue_name' => $e?->venue_name, 'event_status' => $e?->status];
        });

        return response()->json(['upcoming' => $rows->filter(fn ($r) => ! $r['over'] && $r['state'] === 'valid')->sortBy('when')->values(), 'past' => $rows->filter(fn ($r) => $r['over'] || $r['state'] !== 'valid')->values()]);
    }
}
