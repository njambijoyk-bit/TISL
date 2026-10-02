<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Calendar\CalendarService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The staff calendar: my calendar, the team's (managers), and the secret subscription link for Google, Outlook or Apple Calendar. */
class CalendarController extends Controller
{
    public function __construct(private CalendarService $cal) {}

    private function window(Request $r): array
    {
        $from = $r->filled('from') ? Carbon::parse($r->query('from'))->startOfDay() : now()->startOfMonth();
        $to = $r->filled('to') ? Carbon::parse($r->query('to'))->endOfDay() : now()->endOfMonth();

        return [$from, $to->lt($from) ? $from->copy()->endOfDay() : $to];
    }

    private function row($e): array
    {
        return ['id' => $e->id, 'kind' => $e->kind, 'title' => $e->title, 'starts_at' => $e->starts_at->toIso8601String(), 'ends_at' => $e->ends_at?->toIso8601String(), 'all_day' => $e->all_day,
            'status' => $e->status, 'visibility' => $e->visibility, 'url' => $e->url, 'source_type' => $e->source_type, 'user_id' => $e->user_id];
    }

    /** My calendar — or, for a manager, another person's (?user_id=). */
    public function mine(Request $request): JsonResponse
    {
        [$from, $to] = $this->window($request);
        $viewer = $request->user();
        $ownerId = $request->filled('user_id') && CalendarService::isManager($viewer) ? (int) $request->query('user_id') : $viewer->id;
        $owner = User::findOrFail($ownerId);
        $this->cal->refreshFromSources($owner, $from, $to);
        $entries = $this->cal->entriesFor($viewer, $owner->id, $from, $to, array_filter((array) $request->query('kinds', [])));

        return response()->json(['owner' => ['id' => $owner->id, 'name' => $owner->name], 'from' => $from->toDateString(), 'to' => $to->toDateString(), 'entries' => $entries->map(fn ($e) => $this->row($e))->values(), 'is_manager' => CalendarService::isManager($viewer)]);
    }

    /** Everyone's entries for a window, grouped by person. Managers only. */
    public function team(Request $request): JsonResponse
    {
        $viewer = $request->user();
        abort_unless(CalendarService::isManager($viewer), 403, 'Only managers can see the team calendar.');
        [$from, $to] = $this->window($request);
        $people = User::whereHas('employee')->orderBy('name')->get(['id', 'name', 'role']);
        $out = [];
        foreach ($people as $p) {
            $this->cal->refreshFromSources($p, $from, $to);
            $out[] = ['user' => ['id' => $p->id, 'name' => $p->name], 'entries' => $this->cal->entriesFor($viewer, $p->id, $from, $to)->map(fn ($e) => $this->row($e))->values()];
        }

        return response()->json(['from' => $from->toDateString(), 'to' => $to->toDateString(), 'people' => $out]);
    }

    public function subscription(Request $request): JsonResponse
    {
        return response()->json(['url' => $this->feedUrl($this->cal->token($request->user()))]);
    }

    public function rotate(Request $request): JsonResponse
    {
        return response()->json(['url' => $this->feedUrl($this->cal->rotateToken($request->user())), 'message' => 'New link made — the old one no longer works.']);
    }

    /** Public: the iCalendar feed behind the secret link. */
    public function feed(string $token)
    {
        $user = $this->cal->userByToken(preg_replace('/\.ics$/', '', $token));
        abort_unless($user, 404);

        return response($this->cal->ics($user), 200, ['Content-Type' => 'text/calendar; charset=utf-8', 'Content-Disposition' => 'inline; filename="calendar.ics"', 'Cache-Control' => 'private, max-age=300']);
    }

    private function feedUrl(string $token): string
    {
        return rtrim((string) config('app.url'), '/') . '/api/calendar/feed/' . $token . '.ics';
    }
}
