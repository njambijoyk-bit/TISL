<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Books\PaymentMethod;
use App\Models\Menus\Chef;
use App\Models\Menus\CookingRequest;
use App\Services\Access\BranchFilter;
use App\Services\Books\BooksException;
use App\Services\Menus\CookingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Menus → Cakes & catering: the requests customers send, the quotes staff make, the deposits and the jobs. Branch limits apply (a person sees the requests of their own branches). */
class MenusCookingController extends Controller
{
    public function __construct(private CookingService $cooking, private BranchFilter $branches)
    {
    }

    private function guard(callable $fn): JsonResponse
    {
        try {
            abort_unless(CookingService::installed(), 422, 'Run database script 143_menus_cooking.sql first.');

            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function find(int $id): CookingRequest
    {
        $r = CookingRequest::findOrFail($id);
        $this->branches->assertVisibleAny([(int) $r->location_id], 'stock', 'cakes and catering');

        return $r;
    }

    /** Jobs still going by default; ?all=1 adds the finished and turned-down ones of the last 60 days; ?status= narrows. */
    public function index(Request $request): JsonResponse
    {
        if (! CookingService::installed()) {
            return response()->json(['ready' => false, 'requests' => [], 'statuses' => CookingRequest::STATUSES]);
        }
        $q = CookingRequest::with('lines')->orderBy('event_at');
        if ($request->filled('status') && isset(CookingRequest::STATUSES[$request->input('status')])) {
            $q->where('status', $request->input('status'));
        } elseif ($request->boolean('all')) {
            $q->where('created_at', '>=', now()->subDays(60))->orderByDesc('id');
        } else {
            $q->whereNotIn('status', ['completed', 'cancelled', 'declined', 'expired']);
        }
        if ($request->filled('chef_id') && CookingService::chefInstalled()) {
            $q->where('chef_id', (int) $request->input('chef_id'));
        }
        $this->branches->apply($q, 'location_id', 'stock', 'cakes and catering');

        return response()->json(['ready' => true, 'chef_ready' => CookingService::chefInstalled(), 'requests' => $q->limit(300)->get()->map(fn ($r) => $this->cooking->staffView($r))->values(), 'statuses' => CookingRequest::STATUSES, 'kinds' => CookingRequest::KINDS,
            'payment_methods' => PaymentMethod::where('is_active', true)->orderBy('sort_order')->get(['id', 'name', 'kind']),
            'chefs' => CookingService::chefInstalled() ? Chef::where('is_active', true)->orderBy('display_name')->get(['id', 'display_name'])->map(fn ($c) => ['id' => $c->id, 'name' => $c->display_name])->values() : []]);
    }

    public function show(int $id): JsonResponse
    {
        return $this->guard(fn () => response()->json(['request' => $this->cooking->staffView($this->find($id))]));
    }

    public function quote(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['lines' => 'required|array|min:1|max:60', 'lines.*.dish_id' => 'nullable|integer', 'lines.*.name' => 'nullable|string|max:200', 'lines.*.quantity' => 'nullable|numeric|min:0',
            'lines.*.per_head' => 'nullable|boolean', 'lines.*.unit_price' => 'required|numeric|min:0', 'lines.*.note' => 'nullable|string|max:300', 'deposit_pct' => 'nullable|numeric|min:0|max:100',
            'valid_days' => 'nullable|integer|min:1|max:90', 'headcount' => 'nullable|integer|min:1|max:5000', 'chef_id' => 'nullable|integer', 'duration_minutes' => 'nullable|integer|min:60|max:720']);

        return $this->guard(fn () => response()->json(['message' => 'Quote sent.', 'request' => $this->cooking->staffView($this->cooking->quote($this->find($id), $d, $request->user()))]));
    }

    public function status(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['to' => 'required|string|in:preparing,ready,completed,cancelled,declined', 'reason' => 'nullable|string|max:300']);

        return $this->guard(function () use ($d, $id, $request) {
            $r = $this->find($id);
            $r = match ($d['to']) {
                'cancelled' => $this->cooking->cancel($r, $d['reason'] ?? null, $request->user()),
                'declined' => $this->cooking->decline($r, $d['reason'] ?? null),
                default => $this->cooking->advance($r, $d['to'], $request->user()),
            };

            return response()->json(['request' => $this->cooking->staffView($r)]);
        });
    }

    public function pay(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['tenders' => 'required|array|min:1|max:5', 'tenders.*.payment_method_id' => 'required|integer', 'tenders.*.amount' => 'required|numeric|min:0.01', 'tenders.*.reference' => 'nullable|string|max:100']);

        return $this->guard(fn () => response()->json(['message' => 'Payment recorded.', 'request' => $this->cooking->staffView($this->cooking->takePayment($this->find($id), $d['tenders'], $request->user()))]));
    }
}
