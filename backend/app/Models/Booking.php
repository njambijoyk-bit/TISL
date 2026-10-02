<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A booking of something (a service for now) for a customer, taking a resource for a stretch of time. Money is in the linked vouchers. */
class Booking extends Model
{
    public const STATUSES = ['confirmed', 'completed', 'cancelled', 'no_show'];

    protected $fillable = ['number', 'bookable_type', 'bookable_id', 'service_variant_id', 'customer_id', 'resource_id', 'location_id', 'starts_at', 'ends_at', 'people', 'on_site', 'address', 'notes',
        'status', 'source', 'currency_id', 'price', 'fees', 'deposit_amount', 'deposit_ledger_id', 'deposit_status', 'order_voucher_id', 'upfront_voucher_id', 'invoice_voucher_id', 'fee_voucher_id',
        'deposit_release_voucher_id', 'completed_at', 'cancelled_at', 'cancel_reason', 'cancelled_late', 'moved_count', 'created_by'];

    protected $casts = ['starts_at' => 'datetime', 'ends_at' => 'datetime', 'completed_at' => 'datetime', 'cancelled_at' => 'datetime', 'on_site' => 'boolean', 'cancelled_late' => 'boolean',
        'fees' => 'array', 'price' => 'decimal:2', 'deposit_amount' => 'decimal:2', 'people' => 'integer', 'moved_count' => 'integer'];

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function resource()
    {
        return $this->belongsTo(BookableResource::class, 'resource_id');
    }

    public function service()
    {
        return $this->belongsTo(Service::class, 'bookable_id');
    }

    public function variant()
    {
        return $this->belongsTo(ServiceVariant::class, 'service_variant_id');
    }
}
