<?php

namespace App\Services\Location;

use App\Models\Location;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\ProductVariantUnit;
use App\Models\UnitOfMeasure;
use App\Models\VariantLocationStock;
use App\Services\Stock\BatchService;
use Illuminate\Support\Facades\DB;

/**
 * Per-branch variant stock: the source of truth is variant_location_stock;
 * variant.stock_quantity and product.stock_quantity are caches derived from it.
 *
 * Handles the "silent default variant" for simple products so stock always has
 * a variant to attach to, without ever asking the admin to invent options.
 *
 * Underneath, every unit sits in a batch (BatchService). variant_location_stock
 * is always the TOTAL of a variant's batches at that branch: every write here
 * moves the batches first, then copies their total into the row.
 */
class VariantStockService
{
    public function __construct(private BatchService $batches) {}

    /**
     * Ensure the product has at least one variant to carry stock. For a simple
     * product (no variants) this creates ONE option-less default variant + base
     * unit, without flipping `has_variants` (that flag means "has visible
     * options"). Returns the default/first variant.
     */
    public function ensureDefaultVariant(Product $product): ProductVariant
    {
        $existing = $product->productVariants()->orderByDesc('is_default')->first();
        if ($existing) {
            return $existing;
        }

        return DB::transaction(function () use ($product) {
            $variant = $product->productVariants()->create([
                'sku'             => $product->sku,
                'name'            => 'Standard',
                'combination_key' => 'default',
                'is_default'      => true,
                'net_content_qty' => 1,
                'stock_quantity'  => (float) ($product->stock_quantity ?? 0),
                'status'          => ProductVariant::STATUS_ACTIVE,
            ]);

            $variant->units()->create([
                'unit_id'         => $product->default_unit_id ?: $this->defaultUnitId(),
                'role'            => ProductVariantUnit::ROLE_BASE,
                'base_factor'     => 1,
                'price'           => (float) ($product->price ?? 0),
                'is_default_sale' => true,
            ]);

            return $variant;
        });
    }

    /**
     * Is this variant stocked at the branch (at least $need)? Also lists the
     * other branches that do have it, for the "in other branches" badge.
     *
     * @return array{ok: bool, quantity: float, location: ?string, elsewhere: array}
     */
    public function availability(int $variantId, int $locationId, float $need = 1): array
    {
        $rows = VariantLocationStock::where('product_variant_id', $variantId)
            ->with('location:id,name,code')->get();

        $here = (float) ($rows->firstWhere('location_id', $locationId)?->quantity ?? 0);

        return [
            'ok'        => $here >= $need,
            'quantity'  => $here,
            'location'  => Location::find($locationId)?->name,
            'elsewhere' => $rows->filter(fn ($r) => $r->location_id !== $locationId && (float) $r->quantity > 0)
                ->map(fn ($r) => [
                    'location_id' => $r->location_id,
                    'name'        => $r->location?->name,
                    'quantity'    => (float) $r->quantity,
                ])->values()->all(),
        ];
    }

    /** The variant to use when none is chosen: the product's default (or first). */
    public function defaultVariantId(int $productId): ?int
    {
        return ProductVariant::where('product_id', $productId)
            ->orderByDesc('is_default')->orderBy('id')->value('id');
    }

    /**
     * Move a variant's stock at one branch by a signed amount (base units) and
     * refresh the variant/product caches. Used by vouchers (sales out, purchases in).
     *
     * Stock in creates a batch (or tops up `batch_id`); stock out is taken from
     * the batches first-expiring first (or from `batch_id`). Returns the batch
     * allocations so the caller can record them on its stock movements.
     *
     * @param  array  $opts  batch_id, unit_cost, batch_no, mfg_date, expiry_date, received_at, voucher_id, notes
     * @return array<int, array{batch_id:int, qty:float, unit_cost:float, created:bool}>
     */
    public function applyDelta(int $variantId, int $locationId, float $delta, array $opts = []): array
    {
        VariantLocationStock::where('product_variant_id', $variantId)->where('location_id', $locationId)->lockForUpdate()->first();

        $alloc = $delta >= 0
            ? $this->batches->receive($variantId, $locationId, $delta, $opts)
            : $this->batches->issue($variantId, $locationId, -$delta, $opts);

        $this->writeRow($variantId, $locationId, $this->batches->total($variantId, $locationId));
        $this->refreshCaches($variantId);

        return $alloc;
    }

    /**
     * Set the quantity for one (variant, branch): the batches are adjusted to
     * add up to it, and the row follows. A reorder level is only touched when given.
     */
    public function setBranchStock(int $variantId, int $locationId, float $quantity, ?float $reorder = null): void
    {
        $this->batches->syncTo($variantId, $locationId, max(0.0, $quantity));
        $this->writeRow($variantId, $locationId, $this->batches->total($variantId, $locationId), $reorder);
    }

    /** Write the shop-facing row. Callers pass the batch total; nothing else should. */
    private function writeRow(int $variantId, int $locationId, float $quantity, ?float $reorder = null): void
    {
        VariantLocationStock::updateOrCreate(
            ['product_variant_id' => $variantId, 'location_id' => $locationId],
            ['quantity' => max(0, $quantity)] + ($reorder !== null ? ['reorder_level' => $reorder] : [])
        );
    }

    private function refreshCaches(int $variantId): void
    {
        $variant = ProductVariant::with('product')->find($variantId);
        if ($variant?->product) {
            $this->recomputeCaches($variant->product);
        }
    }

    /**
     * Seed a brand-new variant across every active branch: the entered quantity
     * lands in the default ("Main") branch, all others start at 0. Called when a
     * variant is created so stock is branch-ready from the start.
     */
    public function seedNewVariant(ProductVariant $variant, float $mainQty): void
    {
        $main = Location::default();
        if (!$main) {
            return; // no locations configured yet
        }
        foreach (Location::active()->get(['id']) as $loc) {
            $row = VariantLocationStock::firstOrCreate(
                ['product_variant_id' => $variant->id, 'location_id' => $loc->id],
                ['quantity' => 0]
            );
            if ($loc->id === $main->id && $row->wasRecentlyCreated && $mainQty > 0) {
                $this->setBranchStock($variant->id, $loc->id, $mainQty);   // the entered stock arrives as a batch
            }
        }
        $variant->loadMissing('product');
        if ($variant->product) {
            $this->recomputeCaches($variant->product);
        }
    }

    /**
     * A variant's total was edited directly: keep the other branches as they
     * are and make the default ("Main") branch carry the difference, then
     * refresh the caches. Without branch rows the cache is just recomputed.
     */
    public function applyVariantTotal(ProductVariant $variant, float $total): void
    {
        $main = Location::default();
        $hasRows = VariantLocationStock::where('product_variant_id', $variant->id)->exists();

        if ($main && $hasRows) {
            $others = (float) VariantLocationStock::where('product_variant_id', $variant->id)
                ->where('location_id', '!=', $main->id)->sum('quantity');
            $this->setBranchStock($variant->id, $main->id, max(0, $total - $others));
        }

        $variant->loadMissing('product');
        if ($variant->product) {
            $this->recomputeCaches($variant->product);
        }
    }

    /**
     * Recompute the cached quantities from variant_location_stock. For any
     * product that has variants, product.stock_quantity becomes the sum of its
     * variants (and each variant.stock_quantity the sum of its branches) — so
     * the product total is always auto-calculated, never hand-edited. Uses
     * saveQuietly to avoid re-triggering the variant observer. Products with no
     * variants are left untouched (simple products keep their manual number).
     */
    public function recomputeCaches(Product $product): void
    {
        $product->loadMissing('productVariants');
        if ($product->productVariants->isEmpty()) {
            return;
        }

        $productTotal = 0.0;

        foreach ($product->productVariants as $variant) {
            $hasRows = VariantLocationStock::where('product_variant_id', $variant->id)->exists();
            if ($hasRows) {
                $sum = (float) VariantLocationStock::where('product_variant_id', $variant->id)->sum('quantity');
                if ((float) $variant->stock_quantity !== $sum) {
                    $variant->forceFill(['stock_quantity' => $sum])->saveQuietly();
                }
                $productTotal += $sum;
            } else {
                $productTotal += (float) $variant->stock_quantity;
            }
        }

        $product->forceFill([
            'stock_quantity' => $productTotal,
            'in_stock'       => $productTotal > 0,
        ])->saveQuietly();
    }

    /** A sensible base unit id: a "piece/each" unit if present, else the first. */
    private function defaultUnitId(): int
    {
        foreach (['pcs', 'pc', 'ea', 'each', 'unit', 'item', 'piece'] as $code) {
            $u = UnitOfMeasure::where('code', $code)->first();
            if ($u) {
                return $u->id;
            }
        }
        $first = UnitOfMeasure::query()->orderBy('id')->first();
        if (!$first) {
            throw new \RuntimeException('No unit of measure exists — create one before setting stock.');
        }
        return $first->id;
    }
}
