<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\StockBatch;
use App\Services\Books\BooksException;
use App\Services\Stock\StockHoldService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Held stock: quarantined and recalled batches, finding a batch to hold, tracing who bought it, and clearance prices. */
class StockHoldController extends Controller
{
    public function __construct(private StockHoldService $holds) {}

    /** Batches currently held (quarantined or recalled), with what is still on hand. */
    public function index(): JsonResponse
    {
        $rows = StockBatch::whereIn('status', [StockBatch::QUARANTINED, StockBatch::RECALLED])->orderByDesc('updated_at')->get()
            ->map(fn (StockBatch $b) => $this->holds->describe($b))->values();

        return response()->json(['rows' => $rows]);
    }

    /** Find batches to hold: by product name, SKU or batch number. */
    public function search(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));
        $rows = StockBatch::query()->with('variant.product:id,name')
            ->when($q !== '', fn ($s) => $s->where(fn ($w) => $w->where('batch_no', 'like', "%{$q}%")
                ->orWhereHas('variant', fn ($v) => $v->where('sku', 'like', "%{$q}%")->orWhere('name', 'like', "%{$q}%")
                    ->orWhereHas('product', fn ($p) => $p->where('name', 'like', "%{$q}%")))))
            ->orderByDesc('id')->limit(30)->get()
            ->map(fn (StockBatch $b) => $this->holds->describe($b))->values();

        return response()->json(['rows' => $rows]);
    }

    public function show(int $id): JsonResponse
    {
        $b = StockBatch::findOrFail($id);

        return response()->json(['batch' => $this->holds->describe($b)] + $this->holds->trace($b));
    }

    public function quarantine(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['reason' => 'required|string|max:255']);

        return $this->guard(fn () => $this->done('Batch quarantined.', $this->holds->quarantine(StockBatch::findOrFail($id), $d['reason'], $request->user())));
    }

    public function release(Request $request, int $id): JsonResponse
    {
        return $this->guard(fn () => $this->done('Batch released.', $this->holds->release(StockBatch::findOrFail($id), $request->user())));
    }

    public function recall(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['reason' => 'required|string|max:255']);

        return $this->guard(fn () => $this->done('Batch recalled — it can no longer be sold.', $this->holds->recall(StockBatch::findOrFail($id), $d['reason'], $request->user())));
    }

    public function cancelRecall(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['note' => 'nullable|string|max:255']);

        return $this->guard(fn () => $this->done('Recall cancelled.', $this->holds->cancelRecall(StockBatch::findOrFail($id), $d['note'] ?? null, $request->user())));
    }

    public function notify(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['message' => 'required|string|max:1000']);

        return $this->guard(function () use ($d, $request, $id) {
            $r = $this->holds->notifyCustomers(StockBatch::findOrFail($id), $d['message'], $request->user());

            return response()->json(['message' => "{$r['notified']} customer(s) notified; " . count($r['unreachable']) . ' must be contacted directly.'] + $r);
        });
    }

    public function clearance(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['percent' => 'nullable|numeric|min:0|max:100']);

        return $this->guard(fn () => $this->done('Clearance price saved.', $this->holds->setClearance(StockBatch::findOrFail($id), isset($d['percent']) && (float) $d['percent'] > 0 ? (float) $d['percent'] : null, $request->user())));
    }

    private function done(string $message, StockBatch $b): JsonResponse
    {
        return response()->json(['message' => $message, 'batch' => $this->holds->describe($b)]);
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
