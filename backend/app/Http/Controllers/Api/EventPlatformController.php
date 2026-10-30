<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Events\EventCategory;
use App\Models\Events\EventOrganiser;
use App\Models\User;
use App\Services\Events\EventAccess;
use App\Services\Events\EventCategoryService;
use App\Services\Events\EventException;
use App\Services\Events\EventOrganiserService;
use App\Services\Events\EventPayables;
use App\Services\Events\EventSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The events platform: the category hierarchy (public to read, admin to change) and outside organisers (anyone signed in may apply; admin verifies, suspends and sets commission).
 * Everything that changes the platform needs events.admin (routes).
 */
class EventPlatformController extends Controller
{
    public function __construct(private EventCategoryService $categories, private EventOrganiserService $organisers)
    {
    }

    private function off(): ?JsonResponse
    {
        return EventAccess::ready() && EventCategoryService::ready() ? null : response()->json(['ready' => false, 'message' => 'Run script 253 to turn on the events platform.'], 409);
    }

    // ── categories ───────────────────────────────────────────────────────

    /** GET /events/categories: the active tree, for the public directory and the event form. */
    public function publicCategories(): JsonResponse
    {
        return EventCategoryService::ready() ? response()->json(['data' => $this->categories->tree(false)]) : response()->json(['data' => []]);
    }

    public function categories(): JsonResponse
    {
        return $this->off() ?? response()->json(['ready' => true, 'data' => $this->categories->tree(true), 'participation' => \App\Models\Events\Event::PARTICIPATION]);
    }

    private function categoryRules(): array
    {
        return ['name' => 'required|string|max:120', 'parent_id' => 'nullable|integer|exists:event_categories,id', 'icon' => 'nullable|string|max:40', 'description' => 'nullable|string|max:300', 'cover_image' => 'nullable|string|max:500',
            'default_participation' => 'nullable|string|max:12', 'sort_order' => 'nullable|integer', 'is_active' => 'nullable|boolean'];
    }

    public function storeCategory(Request $request): JsonResponse
    {
        return $this->off() ?? response()->json(['data' => $this->categories->save(null, $request->validate($this->categoryRules()))], 201);
    }

    public function updateCategory(Request $request, int $id): JsonResponse
    {
        return $this->off() ?? response()->json(['data' => $this->categories->save(EventCategory::findOrFail($id), $request->validate($this->categoryRules()))]);
    }

    public function deleteCategory(int $id): JsonResponse
    {
        if ($off = $this->off()) {
            return $off;
        }
        $gone = $this->categories->delete(EventCategory::findOrFail($id));

        return response()->json(['deleted' => $gone, 'message' => $gone ? 'Deleted.' : 'It has events or subcategories, so it was switched off instead.']);
    }

    public function standardCategories(): JsonResponse
    {
        return $this->off() ?? response()->json(['made' => $this->categories->addStandard(), 'data' => $this->categories->tree(true)]);
    }

    // ── organisers ───────────────────────────────────────────────────────

    /** POST /events/organisers/apply (signed in): ask to organise events. */
    public function apply(Request $request): JsonResponse
    {
        if ($off = $this->off()) {
            return $off;
        }
        $in = $request->validate(['name' => 'required|string|max:160', 'kind' => 'nullable|in:business,individual,company', 'email' => 'nullable|email|max:160', 'phone' => 'nullable|string|max:40', 'website' => 'nullable|string|max:300',
            'description' => 'nullable|string|max:3000', 'tax_pin' => 'nullable|string|max:40', 'registration_no' => 'nullable|string|max:60']);

        return response()->json(['data' => $this->organisers->shape($this->organisers->apply($request->user(), $in)), 'message' => 'Thank you. TISL will check your details and verify your account. You can start drafting events now; you can publish once verified.'], 201);
    }

    /** GET /events/organisers/mine: the organisers I act for. */
    public function mine(Request $request): JsonResponse
    {
        return EventAccess::ready() ? response()->json(['data' => $this->organisers->mine($request->user())]) : response()->json(['data' => []]);
    }

    public function organisers(Request $request): JsonResponse
    {
        return $this->off() ?? response()->json(['ready' => true, 'data' => $this->organisers->all($request->query('status'))]);
    }

    public function organiser(int $id): JsonResponse
    {
        if ($off = $this->off()) {
            return $off;
        }
        $o = EventOrganiser::findOrFail($id);

        return response()->json(['data' => $this->organisers->shape($o) + ['members' => $this->organisers->members($o), 'documents' => $this->organisers->documents('organiser', $o->id)]]);
    }

    public function updateOrganiser(Request $request, int $id): JsonResponse
    {
        if ($off = $this->off()) {
            return $off;
        }
        $o = EventOrganiser::findOrFail($id);
        $access = app(EventAccess::class);
        abort_unless($access->canAct($request->user(), $o->id) || $request->user() && app(\App\Services\Access\Authorizer::class)->allows($request->user(), 'events.admin'), 404);
        $in = $request->validate(['name' => 'sometimes|string|max:160', 'kind' => 'sometimes|in:business,individual,company', 'email' => 'nullable|email|max:160', 'phone' => 'nullable|string|max:40', 'website' => 'nullable|string|max:300',
            'logo' => 'nullable|string|max:500', 'description' => 'nullable|string|max:3000', 'tax_pin' => 'nullable|string|max:40', 'registration_no' => 'nullable|string|max:60']);

        return response()->json(['data' => $this->organisers->shape($this->organisers->update($o, $in))]);
    }

    public function setOrganiserStatus(Request $request, int $id): JsonResponse
    {
        if ($off = $this->off()) {
            return $off;
        }
        $d = $request->validate(['status' => 'required|in:pending,verified,suspended,rejected', 'note' => 'nullable|string|max:300']);

        return response()->json(['data' => $this->organisers->shape($this->organisers->setStatus(EventOrganiser::findOrFail($id), $d['status'], $d['note'] ?? null, $request->user()))]);
    }

    public function setOrganiserCommission(Request $request, int $id): JsonResponse
    {
        if ($off = $this->off()) {
            return $off;
        }
        $d = $request->validate(['commission_percent' => 'nullable|numeric|min:0|max:100']);

        return response()->json(['data' => $this->organisers->shape($this->organisers->setCommission(EventOrganiser::findOrFail($id), isset($d['commission_percent']) ? (float) $d['commission_percent'] : null))]);
    }

    public function addOrganiserMember(Request $request, int $id): JsonResponse
    {
        if ($off = $this->off()) {
            return $off;
        }
        $o = EventOrganiser::findOrFail($id);
        $this->assertCanManageTeam($request, $o);
        $d = $request->validate(['email' => 'required|email', 'role' => 'required|in:' . implode(',', EventOrganiser::ROLES)]);
        $user = User::where('email', $d['email'])->first();
        abort_unless($user, 422, 'There is no account with that email. They need to sign up first.');
        $this->organisers->addMember($o, $user, $d['role']);

        return response()->json(['data' => $this->organisers->members($o)], 201);
    }

    public function removeOrganiserMember(Request $request, int $id, int $userId): JsonResponse
    {
        if ($off = $this->off()) {
            return $off;
        }
        $o = EventOrganiser::findOrFail($id);
        $this->assertCanManageTeam($request, $o);
        $this->organisers->removeMember($o, $userId);

        return response()->json(['data' => $this->organisers->members($o)]);
    }

    /** The organiser's own owner or manager, or the platform's admin, may change who acts for it. */
    private function assertCanManageTeam(Request $request, EventOrganiser $o): void
    {
        $u = $request->user();
        $admin = app(\App\Services\Access\Authorizer::class)->allows($u, 'events.admin');
        $role = app(EventAccess::class)->memberships($u)[$o->id] ?? null;
        abort_unless($admin || in_array($role, ['owner', 'manager'], true), 403, 'Only the organiser’s owner or a manager can change who acts for it.');
    }

    public function addDocument(Request $request, int $id): JsonResponse
    {
        if ($off = $this->off()) {
            return $off;
        }
        $o = EventOrganiser::findOrFail($id);
        abort_unless(app(EventAccess::class)->canAct($request->user(), $o->id), 404);
        $in = $request->validate(['type' => 'required|in:national_id,business_registration,tax_pin,licence,other', 'title' => 'nullable|string|max:160', 'file' => 'required|file|max:8192|mimes:pdf,jpg,jpeg,png']);
        $path = $request->file('file')->store('event-documents/organiser-' . $o->id, 'local');   // private: never on a public link
        $this->organisers->addDocument('organiser', $o->id, $in + ['path' => $path], $request->user());

        return response()->json(['data' => $this->organisers->documents('organiser', $o->id)], 201);
    }

    public function reviewDocument(Request $request, int $id): JsonResponse
    {
        if ($off = $this->off()) {
            return $off;
        }
        $d = $request->validate(['status' => 'required|in:accepted,rejected', 'note' => 'nullable|string|max:300']);
        $this->organisers->reviewDocument($id, $d['status'], $d['note'] ?? null, $request->user());

        return response()->json(['message' => 'Saved.']);
    }

    // ── what is owed to organisers, and paying it out ────────────────────

    private function payables(): EventPayables|JsonResponse
    {
        return EventPayables::ready() ? app(EventPayables::class) : response()->json(['ready' => false, 'message' => 'Run script 254 to keep what is owed to organisers.'], 409);
    }

    /** GET /admin/events/platform/payouts: who is owed what. */
    public function payouts(): JsonResponse
    {
        $p = $this->payables();

        return $p instanceof JsonResponse ? $p : response()->json(['ready' => true, 'data' => $p->balances(), 'liability_ledger_id' => EventSettings::all()['organiser_payable_ledger_id'] ?? null]);
    }

    public function statement(int $id): JsonResponse
    {
        $p = $this->payables();

        return $p instanceof JsonResponse ? $p : response()->json(['organiser' => $this->organisers->shape(EventOrganiser::findOrFail($id)), 'balance' => $p->balanceOf($id), 'data' => $p->statement($id)]);
    }

    public function payOut(Request $request, int $id): JsonResponse
    {
        $p = $this->payables();
        if ($p instanceof JsonResponse) {
            return $p;
        }
        $d = $request->validate(['amount' => 'required|numeric|min:0.01', 'from_ledger_id' => 'required|integer|exists:ledgers,id', 'reference' => 'nullable|string|max:120', 'note' => 'nullable|string|max:200']);
        try {
            return response()->json($p->payout(EventOrganiser::findOrFail($id), (float) $d['amount'], (int) $d['from_ledger_id'], $d['reference'] ?? null, $d['note'] ?? null, $request->user()) + ['message' => 'Paid out.'], 201);
        } catch (EventException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    /** POST /admin/events/platform/payouts/post-waiting: book the movements that could not be posted when they happened. */
    public function postWaiting(): JsonResponse
    {
        $p = $this->payables();

        return $p instanceof JsonResponse ? $p : response()->json(['posted' => $p->postWaiting(), 'data' => $p->balances()]);
    }
}
