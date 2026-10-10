<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Events\Event;
use App\Models\Events\EventTicket;
use App\Services\Events\CheckIn;
use App\Services\Events\EventException;
use App\Services\Events\GuestList;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** The door of an event, for staff: the counts, scanning a ticket, letting someone in by hand, undoing a mistake, the guest list and its spreadsheet. */
class EventDoorController extends Controller
{
    public function __construct(private CheckIn $door, private GuestList $guests)
    {
    }

    private function guard(callable $fn): JsonResponse
    {
        try {
            return $fn();
        } catch (EventException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    /** GET /admin/events/{id}/door?session_id= */
    public function door(Request $request, int $id): JsonResponse
    {
        return response()->json($this->guests->door(Event::findOrFail($id), $request->integer('session_id') ?: null));
    }

    /** POST /admin/events/{id}/checkin {code, session_id?}: a code was scanned or typed. Every answer is a normal 200 (a refused ticket is an answer, not an error). */
    public function checkin(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['code' => 'required|string|max:400', 'session_id' => 'nullable|integer']);

        return response()->json($this->door->scan(Event::findOrFail($id), $d['code'], $d['session_id'] ?? null, $request->user()?->id));
    }

    /** POST /admin/events/{id}/checkin/manual {ticket_id, session_id?} */
    public function manual(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['ticket_id' => 'required|integer', 'session_id' => 'nullable|integer']);
        $event = Event::findOrFail($id);
        $ticket = EventTicket::where('event_id', $event->id)->findOrFail($d['ticket_id']);

        return response()->json($this->door->manual($event, $ticket, $d['session_id'] ?? null, $request->user()?->id));
    }

    public function undo(Request $request, int $id, int $checkinId): JsonResponse
    {
        return $this->guard(function () use ($request, $id, $checkinId) {
            $this->door->undo(Event::findOrFail($id), $checkinId, $request->user()?->id);

            return response()->json(['message' => 'The check-in was undone: the ticket can be used again.']);
        });
    }

    /** GET /admin/events/{id}/guests?q=&state=&session_id=&arrived=yes|no&page= */
    public function guestList(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['q' => 'nullable|string|max:100', 'state' => 'nullable|in:valid,cancelled', 'session_id' => 'nullable|integer', 'arrived' => 'nullable|in:yes,no', 'page' => 'nullable|integer|min:1']);

        return response()->json($this->guests->guests(Event::findOrFail($id), $d));
    }

    /** GET /admin/events/{id}/guests/export: a CSV with everyone and when they arrived. */
    public function export(int $id): StreamedResponse
    {
        $event = Event::findOrFail($id);

        return response()->streamDownload(function () use ($event) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF");   // so Excel reads the accents
            foreach ($this->guests->csv($event) as $row) {
                fputcsv($out, array_map(fn ($v) => $this->safe((string) $v), $row));
            }
            fclose($out);
        }, 'guests-' . $event->slug . '.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /** A cell that starts with = + - or @ would be run as a formula by a spreadsheet: it is made plain text. */
    private function safe(string $v): string
    {
        return $v !== '' && in_array($v[0], ['=', '+', '-', '@', "\t", "\r"], true) ? "'" . $v : $v;
    }
}
