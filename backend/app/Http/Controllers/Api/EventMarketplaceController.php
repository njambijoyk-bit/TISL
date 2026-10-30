<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Events\EventMarketplace;
use App\Services\Events\EventMedia;
use App\Services\Events\EventOrganiserService;
use App\Services\Events\EventOwnerAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Vendors and venues. The public directory (verified and listed ones), signing up, running your own profile, offer (packages or spaces), people and proof, and the platform's admin verifying them.
 * {type} is "vendors" or "venues" in the address, "vendor" or "venue" inside.
 */
class EventMarketplaceController extends Controller
{
    public function __construct(private EventMarketplace $market, private EventMedia $media, private EventOwnerAccess $access, private EventOrganiserService $organisers)
    {
    }

    private function type(string $plural): string
    {
        return match ($plural) {
            'vendors' => 'vendor',
            'venues' => 'venue',
            default => abort(404),
        };
    }

    private function off(): void
    {
        abort_unless(EventMarketplace::ready(), 409, 'Run script 253 to turn on vendors and venues.');
    }

    private function mine(Request $request, string $type, int $id): void
    {
        $this->off();
        abort_unless($this->market->canManage($type, $id, $request->user(), $this->access->isAdmin($request->user())), 404);
    }

    // ── public ───────────────────────────────────────────────────────────

    public function directory(Request $request, string $plural): JsonResponse
    {
        $this->off();
        $type = $this->type($plural);
        $f = $request->validate(['q' => 'nullable|string|max:100', 'category' => 'nullable|string|max:30', 'county' => 'nullable|string|max:80', 'area' => 'nullable|string|max:80', 'min_capacity' => 'nullable|integer|min:1']);

        return response()->json(['data' => $this->market->directory($type, $f), 'categories' => $type === 'vendor' ? \App\Models\Events\EventVendor::CATEGORIES : null]);
    }

    public function showPublic(string $plural, string $slug): JsonResponse
    {
        $this->off();
        $type = $this->type($plural);
        $model = $type === 'vendor' ? \App\Models\Events\EventVendor::class : \App\Models\Events\EventVenue::class;
        $p = $model::where('slug', $slug)->where('status', 'verified')->where('is_listed', true)->firstOrFail();

        return response()->json(['data' => $this->market->shape($type, $p) + ['offers' => $this->market->offers($type, $p->id, true), 'media' => $this->media->list($type, $p->id, false)]]);
    }

    // ── signed in: my own ────────────────────────────────────────────────

    public function apply(Request $request, string $plural): JsonResponse
    {
        $this->off();
        $type = $this->type($plural);
        $in = $request->validate(['name' => 'required|string|max:160', 'category' => 'nullable|string|max:30', 'summary' => 'nullable|string|max:300', 'description' => 'nullable|string|max:5000', 'email' => 'nullable|email|max:160',
            'phone' => 'nullable|string|max:40', 'website' => 'nullable|string|max:300', 'service_areas' => 'nullable|array|max:100', 'service_areas.*' => 'string|max:80', 'country' => 'nullable|string|max:60', 'county' => 'nullable|string|max:80',
            'town' => 'nullable|string|max:80', 'address' => 'nullable|string|max:300', 'tax_pin' => 'nullable|string|max:40', 'registration_no' => 'nullable|string|max:60']);
        $p = $this->market->apply($type, $request->user(), $in);

        return response()->json(['data' => $this->market->shape($type, $p), 'message' => 'Thank you. TISL will check your details and list you once verified.'], 201);
    }

    public function mineList(Request $request): JsonResponse
    {
        return EventMarketplace::ready() ? response()->json(['data' => $this->market->mine($request->user())]) : response()->json(['data' => []]);
    }

    public function show(Request $request, string $plural, int $id): JsonResponse
    {
        $type = $this->type($plural);
        $this->mine($request, $type, $id);
        $p = $this->market->find($type, $id);

        return response()->json(['data' => $this->market->shape($type, $p) + ['offers' => $this->market->offers($type, $id, false), 'members' => $this->market->members($type, $id), 'documents' => $this->organisers->documents($type, $id),
            'media' => $this->media->list($type, $id, true)]]);
    }

    public function update(Request $request, string $plural, int $id): JsonResponse
    {
        $type = $this->type($plural);
        $this->mine($request, $type, $id);
        $in = $request->validate(['name' => 'sometimes|string|max:160', 'category' => 'nullable|string|max:30', 'summary' => 'nullable|string|max:300', 'description' => 'nullable|string|max:5000', 'email' => 'nullable|email|max:160',
            'phone' => 'nullable|string|max:40', 'website' => 'nullable|string|max:300', 'logo' => 'nullable|string|max:500', 'service_areas' => 'nullable|array|max:100', 'service_areas.*' => 'string|max:80', 'country' => 'nullable|string|max:60',
            'county' => 'nullable|string|max:80', 'town' => 'nullable|string|max:80', 'address' => 'nullable|string|max:300', 'latitude' => 'nullable|numeric|between:-90,90', 'longitude' => 'nullable|numeric|between:-180,180',
            'map_url' => 'nullable|string|max:500', 'directions' => 'nullable|string|max:3000', 'parking' => 'nullable|string|max:300', 'accessibility' => 'nullable|string|max:300', 'facilities' => 'nullable|array|max:60', 'facilities.*' => 'string|max:80',
            'tax_pin' => 'nullable|string|max:40', 'registration_no' => 'nullable|string|max:60', 'is_listed' => 'nullable|boolean']);

        return response()->json(['data' => $this->market->shape($type, $this->market->update($type, $this->market->find($type, $id), $in))]);
    }

    public function saveOffer(Request $request, string $plural, int $id, ?int $offerId = null): JsonResponse
    {
        $type = $this->type($plural);
        $this->mine($request, $type, $id);
        $in = $request->validate(['name' => 'required|string|max:160', 'description' => 'nullable|string|max:5000', 'price' => 'required|numeric|min:0', 'price_unit' => 'nullable|string|max:10', 'currency_id' => 'nullable|integer',
            'min_guests' => 'nullable|integer|min:0', 'max_guests' => 'nullable|integer|min:0', 'inclusions' => 'nullable|array|max:60', 'inclusions.*' => 'string|max:160', 'capacity' => 'nullable|integer|min:0', 'layouts' => 'nullable|array',
            'deposit_percent' => 'nullable|numeric|min:0|max:100', 'cancellation_policy' => 'nullable|string|max:3000', 'is_active' => 'nullable|boolean', 'sort_order' => 'nullable|integer']);

        return response()->json(['data' => $this->market->saveOffer($type, $id, $in, $offerId)], $offerId ? 200 : 201);
    }

    public function removeOffer(Request $request, string $plural, int $id, int $offerId): JsonResponse
    {
        $type = $this->type($plural);
        $this->mine($request, $type, $id);
        $this->market->removeOffer($type, $id, $offerId);

        return response()->json(['message' => 'Removed.']);
    }

    public function addMember(Request $request, string $plural, int $id): JsonResponse
    {
        $type = $this->type($plural);
        $this->mine($request, $type, $id);
        $d = $request->validate(['email' => 'required|email', 'role' => 'required|in:owner,manager,staff']);
        $user = User::where('email', $d['email'])->first();
        abort_unless($user, 422, 'There is no account with that email. They need to sign up first.');
        $this->market->addMember($type, $id, $user, $d['role']);

        return response()->json(['data' => $this->market->members($type, $id)], 201);
    }

    public function removeMember(Request $request, string $plural, int $id, int $userId): JsonResponse
    {
        $type = $this->type($plural);
        $this->mine($request, $type, $id);
        $this->market->removeMember($type, $id, $userId);

        return response()->json(['data' => $this->market->members($type, $id)]);
    }

    public function addDocument(Request $request, string $plural, int $id): JsonResponse
    {
        $type = $this->type($plural);
        $this->mine($request, $type, $id);
        $in = $request->validate(['type' => 'required|in:national_id,business_registration,tax_pin,licence,other', 'title' => 'nullable|string|max:160', 'file' => 'required|file|max:8192|mimes:pdf,jpg,jpeg,png']);
        $path = $request->file('file')->store("event-documents/{$type}-{$id}", 'local');   // private: never on a public link
        $this->organisers->addDocument($type, $id, $in + ['path' => $path], $request->user());

        return response()->json(['data' => $this->organisers->documents($type, $id)], 201);
    }

    // ── admin ────────────────────────────────────────────────────────────

    public function adminList(Request $request, string $plural): JsonResponse
    {
        $this->off();
        $type = $this->type($plural);
        $model = $type === 'vendor' ? \App\Models\Events\EventVendor::class : \App\Models\Events\EventVenue::class;
        $docs = \Illuminate\Support\Facades\DB::table('event_documents')->where('owner_type', $type)->where('status', 'pending')->selectRaw('owner_id, COUNT(*) AS n')->groupBy('owner_id')->pluck('n', 'owner_id');
        $rows = $model::when($request->query('status'), fn ($q, $s) => $q->where('status', $s))->orderBy('name')->get()->map(fn ($p) => $this->market->shape($type, $p) + ['documents_waiting' => (int) ($docs[$p->id] ?? 0)]);

        return response()->json(['data' => $rows->values()]);
    }

    public function adminShow(string $plural, int $id): JsonResponse
    {
        $this->off();
        $type = $this->type($plural);
        $p = $this->market->find($type, $id);

        return response()->json(['data' => $this->market->shape($type, $p) + ['offers' => $this->market->offers($type, $id, false), 'members' => $this->market->members($type, $id), 'documents' => $this->organisers->documents($type, $id),
            'media' => $this->media->list($type, $id, true)]]);
    }

    public function setStatus(Request $request, string $plural, int $id): JsonResponse
    {
        $this->off();
        $type = $this->type($plural);
        $d = $request->validate(['status' => 'required|in:pending,verified,suspended,rejected', 'note' => 'nullable|string|max:300']);

        return response()->json(['data' => $this->market->shape($type, $this->market->setStatus($type, $this->market->find($type, $id), $d['status'], $d['note'] ?? null, $request->user()))]);
    }

    public function setCommission(Request $request, string $plural, int $id): JsonResponse
    {
        $this->off();
        $type = $this->type($plural);
        $d = $request->validate(['commission_percent' => 'nullable|numeric|min:0|max:100']);

        return response()->json(['data' => $this->market->shape($type, $this->market->setCommission($this->market->find($type, $id), isset($d['commission_percent']) ? (float) $d['commission_percent'] : null))]);
    }
}
