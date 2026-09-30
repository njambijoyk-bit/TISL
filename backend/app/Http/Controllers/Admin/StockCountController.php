<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\StockCount;
use App\Services\Books\BooksException;
use App\Services\Stock\StockCountService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Stock counts: start one for a branch, enter what was found, post the differences. */
class StockCountController extends Controller
{
    public function __construct(private StockCountService $counts) {}

    public function index(): JsonResponse
    {
        $rows = StockCount::orderByDesc('id')->limit(100)->get()->map(function (StockCount $c) {
            return ['id' => $c->id, 'number' => $c->number, 'status' => $c->status, 'note' => $c->note, 'location' => DB::table('locations')->where('id', $c->location_id)->value('name'),
                'lines' => DB::table('stock_count_lines')->where('count_id', $c->id)->count(), 'created_at' => (string) $c->created_at, 'posted_at' => $c->posted_at ? (string) $c->posted_at : null, 'voucher_id' => $c->voucher_id];
        })->values();

        return response()->json(['rows' => $rows, 'branches' => DB::table('locations')->where('is_active', 1)->orderBy('name')->get(['id', 'name'])]);
    }

    public function show(int $id): JsonResponse
    {
        $c = StockCount::findOrFail($id);
        $lines = DB::table('stock_count_lines as l')->join('product_variants as pv', 'pv.id', '=', 'l.variant_id')->join('products as p', 'p.id', '=', 'pv.product_id')
            ->join('stock_batches as sb', 'sb.id', '=', 'l.batch_id')->where('l.count_id', $c->id)->orderBy('p.name')->orderBy('l.id')
            ->get(['l.id', 'p.name as product', 'pv.name as variant', 'pv.sku', 'sb.batch_no', 'sb.expiry_date', 'l.expected_qty', 'l.counted_qty', 'l.unit_cost'])
            ->map(fn ($r) => ['id' => (int) $r->id, 'product' => $r->product, 'variant' => $r->variant, 'sku' => $r->sku, 'batch_no' => $r->batch_no, 'expiry_date' => $r->expiry_date,
                'expected_qty' => (float) $r->expected_qty, 'counted_qty' => $r->counted_qty !== null ? (float) $r->counted_qty : null, 'unit_cost' => (float) $r->unit_cost])->values();

        return response()->json(['id' => $c->id, 'number' => $c->number, 'status' => $c->status, 'note' => $c->note, 'location' => DB::table('locations')->where('id', $c->location_id)->value('name'), 'voucher_id' => $c->voucher_id, 'lines' => $lines]);
    }

    public function store(Request $request): JsonResponse
    {
        $d = $request->validate(['location_id' => 'required|integer|exists:locations,id', 'note' => 'nullable|string|max:255']);

        return $this->guard(function () use ($d, $request) {
            $c = $this->counts->start((int) $d['location_id'], $d['note'] ?? null, $request->user());

            return response()->json(['message' => "Count {$c->number} started with {$c->lines->count()} batches to count.", 'id' => $c->id], 201);
        });
    }

    /** Body: counted {line_id: qty|null}. */
    public function save(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['counted' => 'required|array', 'counted.*' => 'nullable|numeric|min:0']);

        return $this->guard(function () use ($d, $id) {
            $this->counts->save(StockCount::findOrFail($id), $d['counted']);

            return response()->json(['message' => 'Saved.']);
        });
    }

    public function post(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['counted' => 'nullable|array', 'counted.*' => 'nullable|numeric|min:0']);

        return $this->guard(function () use ($d, $request, $id) {
            $r = $this->counts->post(StockCount::findOrFail($id), $d['counted'] ?? [], $request->user());

            return response()->json(['message' => "Count posted: {$r['lines']} batch(es) corrected — loss " . number_format($r['loss'], 2) . ', gain ' . number_format($r['gain'], 2) . '.'] + $r);
        });
    }

    public function cancel(int $id): JsonResponse
    {
        return $this->guard(function () use ($id) {
            $this->counts->cancel(StockCount::findOrFail($id));

            return response()->json(['message' => 'Count cancelled.']);
        });
    }

    private function guard(\Closure $fn): JsonResponse
    {
        try {
            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }
}
