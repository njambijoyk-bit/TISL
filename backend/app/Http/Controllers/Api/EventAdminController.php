<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Events\Event;
use App\Models\Events\EventTicket;
use App\Services\Events\EventEditor;
use App\Services\Events\EventNotices;
use App\Services\Events\EventException;
use App\Services\Events\EventPresenter;
use App\Services\Events\EventSettings;
use App\Services\Events\EventSummary;
use App\Services\Events\Recurrence;
use App\Services\ServiceVideo;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/** Staff side of events: the list, the editor, publishing, the picture and video, repeating dates and the settings. */
class EventAdminController extends Controller
{
    use \App\Http\Controllers\Api\Concerns\ScopesEvents;

    public function __construct(private EventEditor $editor, private EventPresenter $present, private ServiceVideo $video)
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

    /** GET /admin/events?status=&q=&when=upcoming|past */
    public function index(Request $request): JsonResponse
    {
        $d = $request->validate(['status' => 'nullable|in:draft,published,cancelled,postponed', 'q' => 'nullable|string|max:100', 'when' => 'nullable|in:upcoming,past', 'page' => 'nullable|integer|min:1']);
        $q = $this->eventAccess()->scope(Event::query(), $request->user())->with(['sessions', 'ticketTypes'])->when($d['status'] ?? null, fn ($w, $s) => $w->where('status', $s))
            ->when($d['q'] ?? null, fn ($w, $s) => $w->where(fn ($x) => $x->where('title', 'like', "%{$s}%")->orWhere('venue_name', 'like', "%{$s}%")))->orderByDesc('id');
        $rows = $q->get()->map(fn ($e) => $this->present->row($e));
        if (($d['when'] ?? null) === 'upcoming') {
            $rows = $rows->reject(fn ($r) => $r['over']);
        } elseif (($d['when'] ?? null) === 'past') {
            $rows = $rows->filter(fn ($r) => $r['over']);
        }

        return response()->json(['data' => $rows->values(), 'ready' => EventSettings::ready()]);
    }

    public function show(int $id): JsonResponse
    {
        return response()->json($this->present->admin($this->scopedEvent($id)));
    }

    private function rules(): array
    {
        return [
            'title' => 'nullable|string|max:200', 'summary' => 'nullable|string|max:300', 'description' => 'nullable|string|max:20000', 'kind' => 'nullable|string|max:10', 'venue_name' => 'nullable|string|max:200',
            'venue_address' => 'nullable|string|max:300', 'map_url' => 'nullable|string|max:500', 'online_url' => 'nullable|string|max:500', 'organiser' => 'nullable|string|max:160', 'is_listed' => 'nullable|boolean',
            'currency_id' => 'nullable|integer', 'sales_ledger_id' => 'nullable|integer', 'tax_rate_id' => 'nullable|integer', 'location_id' => 'nullable|integer', 'max_per_order' => 'nullable|integer',
            'refund_until' => 'nullable|date', 'refund_policy' => 'nullable|string|max:5000', 'allow_name_change' => 'nullable|boolean',
            'category_id' => 'nullable|integer|exists:event_categories,id', 'participation' => 'nullable|in:' . implode(',', array_keys(Event::PARTICIPATION)), 'registration_status' => 'nullable|in:' . implode(',', Event::REGISTRATION),
            'age_min' => 'nullable|integer|min:0|max:120', 'languages' => 'nullable|string|max:120', 'accessibility' => 'nullable|string|max:300', 'venue_id' => 'nullable|integer', 'venue_space_id' => 'nullable|integer',
            'manager_user_id' => 'nullable|integer', 'client_customer_id' => 'nullable|integer', 'organiser_id' => 'nullable|integer',
            'sessions' => 'nullable|array|max:200', 'ticket_types' => 'nullable|array|max:50',
        ];
    }

    /**
     * What a request may set. Approval is never typed in. A person who only acts for outside organisers works under their own organiser, and cannot choose TISL's accounts for the event, nor a client:
     * the money passes through TISL, which sets those. TISL's staff may name any organiser.
     */
    private function sanitised(Request $request, ?Event $event): array
    {
        $in = $request->all();
        unset($in['approval_status'], $in['approval_note']);
        $user = $request->user();
        if ($this->eventAccess()->isOutside($user)) {
            unset($in['sales_ledger_id'], $in['tax_rate_id'], $in['location_id'], $in['client_customer_id']);
            unset($in['organiser_id']);
        }
        if ($event === null) {
            $org = $this->eventAccess()->organiserFor($user, isset($in['organiser_id']) ? (int) $in['organiser_id'] : null);
            abort_if(! $org && \App\Services\Events\EventAccess::ready(), 403, 'You need an organiser account to make events.');
            if ($org) {
                $in['organiser_id'] = $org->id;
            } else {
                unset($in['organiser_id']);   // before script 253 there are no organisers
            }
        }

        return $in;
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate($this->rules() + []);

        return $this->guard(fn () => response()->json($this->present->admin($this->editor->save(null, $this->sanitised($request, null), $request->user()?->id)), 201));
    }

    /** The organiser sends a finished event to TISL to be approved. */
    public function submit(Request $request, int $id): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->present->admin($this->editor->submitForApproval($this->scopedEvent($id), $request->user()?->id)) + ['message' => 'Sent to TISL for approval.']));
    }

    /** TISL decides on an outside organiser's event (needs events.admin). */
    public function decide(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['approve' => 'required|boolean', 'note' => 'nullable|string|max:300']);

        return $this->guard(fn () => response()->json($this->present->admin($this->editor->decide(Event::findOrFail($id), (bool) $d['approve'], $d['note'] ?? null, $request->user()?->id)) + ['message' => $d['approve'] ? 'Approved.' : 'Sent back to the organiser.']));
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $request->validate($this->rules());
        $event = $this->scopedEvent($id);

        return $this->guard(fn () => response()->json($this->present->admin($this->editor->save($event, $this->sanitised($request, $event), $request->user()?->id))));
    }

    public function publish(Request $request, int $id): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->present->admin($this->editor->publish($this->scopedEvent($id), $request->user()?->id)) + ['message' => 'Published: it is now on sale.']));
    }

    public function unpublish(Request $request, int $id): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->present->admin($this->editor->unpublish($this->scopedEvent($id), $request->user()?->id)) + ['message' => 'Taken down: it is no longer on sale.']));
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->present->admin($this->editor->cancel($this->scopedEvent($id), $request->user()?->id)) + ['message' => 'The event is cancelled and no more tickets can be bought.']));
    }

    public function postpone(Request $request, int $id): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->present->admin($this->editor->postpone($this->scopedEvent($id), $request->user()?->id)) + ['message' => 'Postponed: sales are stopped and the ticket holders have been told. Set the new dates, then put it on sale again.']));
    }

    /** POST /admin/events/{id}/notify {message}: tell everyone who holds a ticket something. */
    public function notifyHolders(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['message' => 'required|string|min:3|max:1000']);
        $n = app(EventNotices::class)->eventMessage($this->scopedEvent($id), $d['message']);

        return response()->json(['message' => $n === 0 ? 'Nobody holds a valid ticket yet.' : "Sent to {$n} ticket holder" . ($n === 1 ? '' : 's') . '.', 'sent' => $n]);
    }

    /** DELETE: only an event nobody ever bought a ticket for. */
    public function destroy(int $id): JsonResponse
    {
        $e = $this->scopedEvent($id);

        return $this->guard(function () use ($e) {
            if (EventTicket::where('event_id', $e->id)->whereIn('state', [EventTicket::VALID, EventTicket::CANCELLED])->exists()) {
                throw new EventException('Tickets were sold for this event, so it can not be deleted: cancel it instead (its records are kept).');
            }
            $e->delete();

            return response()->json(['message' => 'Deleted.']);
        });
    }

    /** GET /admin/events/{id}/summary: sold, what it brought in, who has arrived. */
    public function summary(int $id): JsonResponse
    {
        return response()->json(app(EventSummary::class)->of($this->scopedEvent($id)));
    }

    /** POST /admin/events/recurrence: the dates of a repeat, to review before saving. */
    public function recurrence(Request $request): JsonResponse
    {
        $d = $request->validate(['start' => 'required|date', 'minutes' => 'nullable|integer|min:1|max:10080', 'repeat' => 'required|in:daily,weekly,monthly', 'every' => 'nullable|integer|min:1|max:12',
            'weekdays' => 'nullable|array', 'weekdays.*' => 'integer|min:0|max:6', 'until' => 'nullable|date', 'count' => 'nullable|integer|min:1|max:100']);

        return $this->guard(fn () => response()->json(['dates' => Recurrence::dates($d)]));
    }

    /** POST /admin/events/{id}/image */
    public function image(Request $request, int $id): JsonResponse
    {
        $request->validate(['file' => 'required|image|max:5120']);
        $e = $this->scopedEvent($id);
        $old = (string) $e->main_image;
        $e->update(['main_image' => '/storage/' . $request->file('file')->store('events', 'public')]);
        if (str_starts_with($old, '/storage/events/')) {
            Storage::disk('public')->delete(substr($old, 9));
        }

        return response()->json(['message' => 'Picture saved.', 'image_url' => asset($e->main_image)]);
    }

    public function removeImage(int $id): JsonResponse
    {
        $e = $this->scopedEvent($id);
        if (str_starts_with((string) $e->main_image, '/storage/events/')) {
            Storage::disk('public')->delete(substr($e->main_image, 9));
        }
        $e->update(['main_image' => null]);

        return response()->json(['message' => 'Picture removed.']);
    }

    /** POST /admin/events/{id}/video: a link or an mp4/webm (same rules as a product's video). */
    public function setVideo(Request $request, int $id): JsonResponse
    {
        $e = $this->scopedEvent($id);
        $request->validate(['url' => ['nullable', 'string', 'max:500'], 'file' => ['nullable', 'file', 'mimetypes:video/mp4,video/webm', 'max:' . ServiceVideo::MAX_KB]]);
        if ($request->hasFile('file')) {
            $e = $this->video->setFile($e, $request->file('file'));
        } elseif ($request->filled('url')) {
            $e = $this->video->setLink($e, (string) $request->input('url'));
        } else {
            return response()->json(['message' => 'Choose a video file or paste a link.'], 422);
        }

        return response()->json(['message' => 'Video saved.', 'video' => ServiceVideo::describe($e->video_url)]);
    }

    public function removeVideo(int $id): JsonResponse
    {
        $this->video->remove($this->scopedEvent($id));

        return response()->json(['message' => 'Video removed.']);
    }

    public function settings(): JsonResponse
    {
        $this->staffOnly('The events settings');
        return response()->json(['settings' => EventSettings::all(), 'ready' => EventSettings::ready()]);
    }

    public function saveSettings(Request $request): JsonResponse
    {
        $this->staffOnly('The events settings');
        $d = $request->validate(['commission_percent' => 'nullable|numeric|min:0|max:100', 'require_approval' => 'nullable|boolean', 'hold_minutes' => 'nullable|integer', 'reminders_on' => 'nullable|boolean', 'reminder_hours' => 'nullable|integer', 'sales_ledger_id' => 'nullable|integer', 'organiser_payable_ledger_id' => 'nullable|integer|exists:ledgers,id', 'ticket_note' => 'nullable|string|max:300']);

        return $this->guard(function () use ($d, $request) {
            if (! empty($d['sales_ledger_id'])) {
                $this->editor->assertIncomeLedger((int) $d['sales_ledger_id']);
            }

            return response()->json(['settings' => EventSettings::save($d, $request->user()?->id), 'message' => 'Saved.']);
        });
    }
}
