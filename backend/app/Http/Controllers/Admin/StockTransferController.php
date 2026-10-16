<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\StockTransfer;
use App\Services\Books\BooksException;
use App\Services\Stock\StockTransferService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Stock between branches: send, receive (with any shortfall), cancel. */
class StockTransferController extends Controller
{
    public function __construct(private StockTransferService $transfers) {}

    public function index(Request $request): JsonResponse
    {
        $d = $request->validate(['status' => 'nullable|in:in_transit,received,cancelled']);
        $q = StockTransfer::with(['from:id,name', 'to:id,name', 'lines', 'ingredientLines'])->when(! empty($d['status']), fn ($q) => $q->where('status', $d['status']))->orderByDesc('id')->limit(100);
        $this->branches()->applyAny($q, ['from_location_id', 'to_location_id'], 'stock', 'transfers');   // a transfer is yours when either end is
        $rows = $q->get()->map(fn (StockTransfer $t) => $this->row($t, false))->values();

        return response()->json([
            'rows' => $rows,
            'branches' => DB::table('locations')->where('is_active', 1)->orderBy('name')->get(['id', 'name']),
        ]);
    }

    private function branches(): \App\Services\Access\BranchFilter
    {
        return app(\App\Services\Access\BranchFilter::class);
    }

    /** A transfer the person may look at: either end is theirs. */
    private function seen(StockTransfer $t): StockTransfer
    {
        $this->branches()->assertVisibleAny([$t->from_location_id, $t->to_location_id], 'stock', 'transfers');

        return $t;
    }

    public function show(int $id): JsonResponse
    {
        return response()->json($this->row($this->seen(StockTransfer::with(['from:id,name', 'to:id,name', 'lines', 'ingredientLines'])->findOrFail($id)), true));
    }

    /** Body: from_location_id, to_location_id, note?, items[{variant_id, quantity}], ingredients[{item_id, quantity, unit: pack|alt|base}] (at least one of the two). */
    public function store(Request $request): JsonResponse
    {
        $d = $request->validate([
            'from_location_id' => 'required|integer|exists:locations,id', 'to_location_id' => 'required|integer|exists:locations,id', 'note' => 'nullable|string|max:255',
            'items' => 'nullable|array', 'items.*.variant_id' => 'required|integer|exists:product_variants,id', 'items.*.quantity' => 'required|numeric|min:0.0001',
            'ingredients' => 'nullable|array', 'ingredients.*.item_id' => 'required|integer', 'ingredients.*.quantity' => 'required|numeric|min:0.0001', 'ingredients.*.unit' => 'nullable|in:pack,alt,base',
        ]);
        if (empty($d['items']) && empty($d['ingredients'])) {
            return response()->json(['message' => 'Add at least one item to send.'], 422);
        }

        return $this->guard(function () use ($d, $request) {
            $this->branches()->assertWrite($request->user(), (int) $d['from_location_id'], 'stock', 'transfer_send');   // sending takes stock out of the branch
            $ingredients = [];
            foreach ($d['ingredients'] ?? [] as $n => $l) {
                $item = \App\Models\Menus\IngredientItem::with('ingredient.baseUnit', 'ingredient.altUnit')->find((int) $l['item_id']) ?? throw new BooksException('Line '.($n + 1).': choose an ingredient variant.');
                $ingredients[] = ['item_id' => $item->id, 'quantity' => $item->toBase((string) ($l['unit'] ?? 'base'), (float) $l['quantity'])];
            }
            $t = $this->transfers->send((int) $d['from_location_id'], (int) $d['to_location_id'], $d['items'] ?? [], $d['note'] ?? null, $request->user(), $ingredients);

            return response()->json(['message' => "Transfer {$t->number} is on its way. Use Note in the list to print the transfer note that goes with the goods.", 'id' => $t->id], 201);
        });
    }

    /** Body: received?{line_id: qty}, ingredient_received?{ingredient_line_id: qty in the base unit} — leave out for "all of it". */
    public function receive(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['received' => 'nullable|array', 'received.*' => 'numeric|min:0', 'ingredient_received' => 'nullable|array', 'ingredient_received.*' => 'numeric|min:0']);

        return $this->guard(function () use ($d, $request, $id) {
            $in = StockTransfer::with('lines', 'ingredientLines')->findOrFail($id);
            $this->branches()->assertWrite($request->user(), (int) $in->to_location_id, 'stock', 'transfer_receive');   // receiving puts stock into the branch
            $t = $this->transfers->receive($in, $d['received'] ?? [], $request->user(), $d['ingredient_received'] ?? []);

            return response()->json(['message' => "Transfer {$t->number} received."]);
        });
    }

    /** GET /{id}/note?format=html|pdf: the transfer as a printable note that goes with the goods. */
    public function note(Request $request, int $id)
    {
        $d = $request->validate(['format' => 'nullable|in:html,pdf']);
        $t = $this->seen(StockTransfer::with(['from', 'to', 'lines', 'ingredientLines'])->findOrFail($id));
        $place = fn ($l) => ['name' => $l?->name, 'address' => implode(', ', array_filter([$l?->address_line1, $l?->address_line2, $l?->city, $l?->country])) ?: null];
        $name = fn ($uid) => $uid ? DB::table('users')->where('id', $uid)->value('name') : null;
        $row = $this->row($t, true);

        try {
            return app(\App\Services\Books\ExportService::class)->transferNote([
                'number' => $t->number, 'status' => $t->status, 'note' => $t->note, 'sent_at' => $row['sent_at'], 'received_at' => $row['received_at'] ?? null,
                'sent_by' => $name($t->sent_by), 'received_by' => $name($t->received_by), 'from' => $place($t->from), 'to' => $place($t->to), 'lines' => array_merge($row['lines']->all(), $row['ingredient_lines']->map(fn ($l) => ['id' => $l['id'], 'product' => $l['ingredient'], 'variant' => $l['variant'], 'sku' => $l['sku'], 'batch_no' => $l['batch_no'],
                    'expiry_date' => $l['expiry_date'], 'quantity' => $l['quantity'], 'received_qty' => $l['received_qty']])->all()),
            ], $d['format'] ?? 'html');
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function cancel(int $id): JsonResponse
    {
        return $this->guard(function () use ($id) {
            $out = StockTransfer::with('lines', 'ingredientLines')->findOrFail($id);
            $this->branches()->assertWrite(request()->user(), (int) $out->from_location_id, 'stock', 'transfer_cancel');
            $t = $this->transfers->cancel($out);

            return response()->json(['message' => "Transfer {$t->number} cancelled; the stock is back at {$t->from?->name}."]);
        });
    }

    private function row(StockTransfer $t, bool $withLines): array
    {
        $out = [
            'id' => $t->id, 'number' => $t->number, 'status' => $t->status, 'note' => $t->note, 'from' => $t->from?->name, 'to' => $t->to?->name,
            'from_location_id' => (int) $t->from_location_id, 'to_location_id' => (int) $t->to_location_id, 'sent_at' => (string) $t->sent_at, 'received_at' => $t->received_at ? (string) $t->received_at : null,
            'quantity' => round((float) $t->lines->sum('quantity'), 4), 'value' => round((float) $t->lines->sum(fn ($l) => $l->quantity * $l->unit_cost) + (float) $t->ingredientLines->sum(fn ($l) => $l->quantity * $l->unit_cost), 2),
            'ingredient_count' => $t->ingredientLines->count(),
        ];
        if ($withLines) {
            $out['lines'] = $t->lines->map(function ($l) {
                $v = DB::table('product_variants as pv')->join('products as p', 'p.id', '=', 'pv.product_id')->where('pv.id', $l->variant_id)->first(['p.name as product', 'pv.name as variant', 'pv.sku']);
                $b = DB::table('stock_batches')->where('id', $l->batch_id)->first(['batch_no', 'expiry_date']);

                return ['id' => $l->id, 'product' => $v?->product, 'variant' => $v?->variant, 'sku' => $v?->sku, 'batch_no' => $b?->batch_no, 'expiry_date' => $b?->expiry_date,
                    'quantity' => (float) $l->quantity, 'received_qty' => $l->received_qty !== null ? (float) $l->received_qty : null];
            })->values();
            // the kitchen's lots: the ingredient and its variant named apart, in the base unit, with the lot they left
            $out['ingredient_lines'] = $t->ingredientLines->map(function ($l) {
                $item = \App\Models\Menus\IngredientItem::with('ingredient.baseUnit')->find($l->item_id);
                $b = DB::table('menus_stock_batches')->where('id', $l->batch_id)->first(['batch_no', 'expiry_date']);

                return ['id' => $l->id, 'ingredient' => $item?->ingredient?->name, 'variant' => $item?->name, 'sku' => $item?->code, 'unit' => $item?->ingredient?->baseUnit?->code, 'batch_no' => $b?->batch_no,
                    'expiry_date' => $b?->expiry_date, 'quantity' => (float) $l->quantity, 'received_qty' => $l->received_qty !== null ? (float) $l->received_qty : null];
            })->values();
        }

        return $out;
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
