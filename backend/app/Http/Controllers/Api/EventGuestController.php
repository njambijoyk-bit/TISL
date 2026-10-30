<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\GuardsEventErrors;
use App\Http\Controllers\Api\Concerns\ScopesEvents;
use App\Http\Controllers\Controller;
use App\Models\Events\Event;
use App\Services\Events\EventGuests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Invited guests and RSVPs. Staff side: events.view to read, events.edit to change (an outside organiser reaches only their own events). Public side: a guest's own link. */
class EventGuestController extends Controller
{
    use GuardsEventErrors;
    use ScopesEvents;

    public function __construct(private EventGuests $guests)
    {
    }

    private function event(int $id): Event
    {
        abort_unless(EventGuests::ready(), 409, 'Run script 255 to turn on guest lists.');

        return $this->scopedEvent($id);
    }

    public function index(Request $request, int $id): JsonResponse
    {
        $e = $this->event($id);

        return response()->json(['data' => $this->guests->list($e, $request->only(['rsvp', 'group', 'q'])), 'summary' => $this->guests->summary($e), 'roles' => EventGuests::ROLES]);
    }

    public function save(Request $request, int $id, ?int $gid = null): JsonResponse
    {
        $d = $request->validate(['name' => 'sometimes|string|max:160', 'email' => 'nullable|email|max:190', 'phone' => 'nullable|string|max:40', 'role' => 'nullable|string|max:12', 'group_name' => 'nullable|string|max:80',
            'table_label' => 'nullable|string|max:40', 'plus_ones' => 'nullable|integer|min:0|max:20', 'meal' => 'nullable|string|max:80', 'needs' => 'nullable|string|max:300', 'note' => 'nullable|string|max:300']);

        return response()->json(['data' => $this->guests->save($this->event($id), $d, $gid)], $gid ? 200 : 201);
    }

    public function destroy(int $id, int $gid): JsonResponse
    {
        $this->guests->delete($this->event($id), $gid);

        return response()->json(['message' => 'Removed.']);
    }

    public function import(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['text' => 'required|string|max:200000']);

        return response()->json($this->guests->import($this->event($id), $d['text']));
    }

    /** Send invitations (those not yet invited, or the ids given), or a reminder to those who have not answered. */
    public function send(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['ids' => 'nullable|array|max:2000', 'ids.*' => 'integer', 'reminder' => 'nullable|boolean']);
        $r = $this->guests->invite($this->event($id), $d['ids'] ?? null, (bool) ($d['reminder'] ?? false));

        return response()->json($r + ['message' => "{$r['sent']} sent" . ($r['skipped'] ? ", {$r['skipped']} have no email or phone" : '') . '.']);
    }

    public function doorPack(int $id): JsonResponse
    {
        return response()->json($this->guests->doorPack($this->event($id)));
    }

    public function doorSync(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['guest_ids' => 'required|array|max:5000', 'guest_ids.*' => 'integer']);

        return response()->json(['checked_in' => $this->guests->checkIn($this->event($id), $d['guest_ids'])]);
    }

    // ── public: a guest's own link ───────────────────────────────────────

    private function guest(string $token): object
    {
        abort_unless(EventGuests::ready(), 404);

        return $this->guests->byToken($token) ?? abort(404);
    }

    public function show(string $token): JsonResponse
    {
        return response()->json($this->guests->publicView($this->guest($token)));
    }

    public function respond(Request $request, string $token): JsonResponse
    {
        $d = $request->validate(['rsvp' => 'required|in:yes,no,maybe', 'attending' => 'nullable|integer|min:1|max:50', 'meal' => 'nullable|string|max:80', 'needs' => 'nullable|string|max:300']);

        return response()->json($this->guests->respond($this->guest($token), $d) + ['message' => 'Thank you, your reply is saved.']);
    }
}
