<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PurchaseOrderItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'purchase_order_id',
        'product_id',
        'vendor_sku',
        'product_name',
        'product_sku',
        'quantity',
        'quantity_received',
        'unit_of_measure',
        'unit_cost',
        'unit_cost_kes',
        'line_total',
        'line_total_kes',
        'fulfillment_status',
        'notes',
    ];

    protected $casts = [
        'quantity'           => 'decimal:2',
        'quantity_received'  => 'decimal:2',
        'unit_cost'          => 'decimal:2',
        'unit_cost_kes'      => 'decimal:2',
        'line_total'         => 'decimal:2',
        'line_total_kes'     => 'decimal:2',
    ];

    // =========================================================================
    // RELATIONSHIPS
    // =========================================================================

    public function purchaseOrder()
    {
        return $this->belongsTo(PurchaseOrder::class);
    }

    public function product()
    {
        return $this->belongsTo(Product::class);
    }

    // =========================================================================
    // BOOT — auto-calculate line totals on save
    // Mirrors the OrderItem boot() pattern exactly.
    // =========================================================================

    protected static function boot()
    {
        parent::boot();

        static::saving(function (self $item) {
            if ($item->isDirty(['quantity', 'unit_cost'])) {
                $item->line_total     = round($item->quantity * $item->unit_cost, 2);
                $item->line_total_kes = round($item->quantity * $item->unit_cost_kes, 2);
            }
        });
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    /**
     * Receive a partial or full quantity for this line.
     * Increments product stock and updates fulfillment_status.
     */
    public function receive(float $qty): void
    {
        $qty = min($qty, $this->quantity - $this->quantity_received);
        if ($qty <= 0) {
            return;
        }

        if ($this->product_id) {
            $this->product->increaseStock($qty); // already on Product model
        }

        $newReceived = $this->quantity_received + $qty;
        $status = match(true) {
            $newReceived >= $this->quantity => 'received',
            $newReceived > 0               => 'partially_received',
            default                        => 'pending',
        };

        $this->update([
            'quantity_received'  => $newReceived,
            'fulfillment_status' => $status,
        ]);
    }
}