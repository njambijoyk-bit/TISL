<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\StockJob;
use App\Services\Books\BooksException;
use App\Services\Stock\StockJobService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Jobs with work in progress: open one, issue materials to it, return some, complete it or cancel it. */
class StockJobController extends Controller
{
    public function __construct(private StockJobService $jobs) {}

    public function index(Request $request): JsonResponse
    {
        $d = $request->validate(['status' => 'nullable|in:open,completed,cancelled']);
        $rows = StockJob::when(! empty($d['status']), fn ($q) => $q->where('status', $d['status']))->orderByDesc('id')->limit(100)->get()->map(fn (StockJob $j) => $this->row($j))->values();

        return response()->json(['rows' => $rows, 'wip_total' => $this->jobs->cost(), 'branches' => DB::table('locations')->where('is_active', 1)->orderBy('name')->get(['id', 'name'])]);
    }

    public function show(int $id): JsonResponse
    {
        $j = StockJob::findOrFail($id);
        $lines = DB::table('stock_job_lines as l')->join('product_variants as pv', 'pv.id', '=', 'l.variant_id')->join('products as p', 'p.id', '=', 'pv.product_id')
            ->leftJoin('stock_batches as sb', 'sb.id', '=', 'l.batch_id')->where('l.job_id', $j->id)->orderBy('l.id')
            ->get(['l.id', 'p.name as product', 'pv.name as variant', 'sb.batch_no', 'l.quantity', 'l.unit_cost', 'l.issued_at'])
            ->map(fn ($r) => ['id' => (int) $r->id, 'product' => $r->product, 'variant' => $r->variant, 'batch_no' => $r->batch_no, 'quantity' => (float) $r->quantity, 'unit_cost' => (float) $r->unit_cost,
                'cost' => round((float) $r->quantity * (float) $r->unit_cost, 2), 'issued_at' => (string) $r->issued_at])->values();

        return response()->json($this->row($j) + ['lines' => $lines]);
    }

    public function store(Request $request): JsonResponse
    {
        $d = $request->validate(['title' => 'required|string|max:160', 'location_id' => 'required|integer|exists:locations,id', 'customer_id' => 'nullable|integer|exists:customers,id', 'note' => 'nullable|string|max:255']);

        return $this->guard(function () use ($d, $request) {
            $j = $this->jobs->open($d['title'], (int) $d['location_id'], $d['customer_id'] ?? null, $d['note'] ?? null, $request->user());

            return response()->json(['message' => "Job {$j->number} opened.", 'id' => $j->id], 201);
        });
    }

    /** Body: items[{variant_id, quantity}]. */
    public function issue(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['items' => 'required|array|min:1', 'items.*.variant_id' => 'required|integer|exists:product_variants,id', 'items.*.quantity' => 'required|numeric|min:0.0001']);

        return $this->guard(function () use ($d, $request, $id) {
            $this->jobs->issue(StockJob::findOrFail($id), $d['items'], $request->user());

            return response()->json(['message' => 'Materials issued to the job.']);
        });
    }

    public function returnLine(Request $request, int $id, int $lineId): JsonResponse
    {
        $d = $request->validate(['quantity' => 'nullable|numeric|min:0.0001']);

        return $this->guard(function () use ($d, $request, $id, $lineId) {
            $this->jobs->returnLine(StockJob::findOrFail($id), $lineId, isset($d['quantity']) ? (float) $d['quantity'] : null, $request->user());

            return response()->json(['message' => 'Returned to stock.']);
        });
    }

    public function complete(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['invoice_voucher_id' => 'nullable|integer|exists:vouchers,id']);

        return $this->guard(function () use ($d, $request, $id) {
            $j = $this->jobs->complete(StockJob::findOrFail($id), $d['invoice_voucher_id'] ?? null, $request->user());

            return response()->json(['message' => "Job {$j->number} completed; its materials are booked as a cost of the service."]);
        });
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        return $this->guard(function () use ($request, $id) {
            $j = $this->jobs->cancel(StockJob::findOrFail($id), $request->user());

            return response()->json(['message' => "Job {$j->number} cancelled; the materials are back in stock."]);
        });
    }

    private function row(StockJob $j): array
    {
        return [
            'id' => $j->id, 'number' => $j->number, 'title' => $j->title, 'status' => $j->status, 'note' => $j->note, 'location_id' => (int) $j->location_id,
            'location' => DB::table('locations')->where('id', $j->location_id)->value('name'), 'invoice_voucher_id' => $j->invoice_voucher_id,
            'customer' => $j->customer_id ? trim(DB::table('customers')->where('id', $j->customer_id)->selectRaw("CONCAT(COALESCE(first_name,''),' ',COALESCE(last_name,'')) as n")->value('n')) : null,
            'cost' => $this->jobs->cost($j), 'created_at' => (string) $j->created_at,
        ];
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
