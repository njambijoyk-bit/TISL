<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class AuctionOrder extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'auction_id', 'auction_bid_id', 'customer_id', 'product_id',
        'order_number',

        // product snapshot
        'product_name', 'product_sku', 'product_image', 'brand_name',

        // bid financials
        'winning_bid_amount', 'charged_amount',

        // order financials
        'quantity', 'subtotal', 'tax', 'shipping_cost', 'total',

        // KES snapshots
        'currency', 'exchange_rate_to_kes',
        'subtotal_kes', 'tax_kes', 'shipping_cost_kes', 'total_kes',

        // shipping
        'shipping_address', 'delivery_method',
        'shipping_option_id', 'shipping_method_name', 'shipping_snapshot',

        // payment
        'payment_method', 'payment_status', 'payment_reference', 'paid_at',

        // status
        'status',

        // tracking
        'tracking_number', 'courier_company', 'estimated_delivery_date',

        // timestamps per status
        'confirmed_at', 'shipped_at', 'delivered_at',
        'cancelled_at', 'cancellation_reason',

        // admin
        'placed_by', 'admin_notes', 'customer_notes', 'metadata',
    ];

    protected $casts = [
        'winning_bid_amount'   => 'decimal:2',
        'charged_amount'       => 'decimal:2',
        'subtotal'             => 'decimal:2',
        'tax'                  => 'decimal:2',
        'shipping_cost'        => 'decimal:2',
        'total'                => 'decimal:2',
        'subtotal_kes'         => 'decimal:2',
        'tax_kes'              => 'decimal:2',
        'shipping_cost_kes'    => 'decimal:2',
        'total_kes'            => 'decimal:2',
        'exchange_rate_to_kes' => 'decimal:6',
        'shipping_snapshot'    => 'array',
        'metadata'             => 'array',
        'paid_at'              => 'datetime',
        'confirmed_at'         => 'datetime',
        'shipped_at'           => 'datetime',
        'delivered_at'         => 'datetime',
        'cancelled_at'         => 'datetime',
        'estimated_delivery_date' => 'date',
    ];

    // ── Relationships ────────────────────────────────────────────────────────

    public function auction()
    {
        return $this->belongsTo(Auction::class);
    }

    public function bid()
    {
        return $this->belongsTo(AuctionBid::class, 'auction_bid_id');
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function product()
    {
        return $this->belongsTo(Product::class);
    }

    public function placedBy()
    {
        return $this->belongsTo(User::class, 'placed_by');
    }

    public function activityLogs()
    {
        return $this->hasMany(AuctionOrderActivityLog::class);
    }

    // ── KES snapshot helper ──────────────────────────────────────────────────

    public function applyKesSnapshot(): void
    {
        $rate = (float) ($this->exchange_rate_to_kes > 0 ? $this->exchange_rate_to_kes : 1);

        $this->update([
            'subtotal_kes'      => round((float) $this->subtotal      * $rate, 2),
            'tax_kes'           => round((float) $this->tax           * $rate, 2),
            'shipping_cost_kes' => round((float) $this->shipping_cost * $rate, 2),
            'total_kes'         => round((float) $this->total         * $rate, 2),
        ]);
    }

    // ── Order number generator ───────────────────────────────────────────────

    public static function generateOrderNumber(int $auctionId, int $customerId): string
    {
        $year     = date('Y');
        $datePart = date('dm');
        $attempts = 0;

        do {
            $random      = str_pad(random_int(0, 999), 3, '0', STR_PAD_LEFT);
            $orderNumber = "AUC-{$year}-{$auctionId}-{$customerId}-{$datePart}{$random}";
            $attempts++;
            if ($attempts > 25) {
                throw new \Exception('Could not generate unique auction order number.');
            }
        } while (static::withTrashed()->where('order_number', $orderNumber)->exists());

        return $orderNumber;
    }
}