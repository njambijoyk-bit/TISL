<?php

namespace App\Models\Books;

use App\Models\Currency;
use App\Models\Customer;
use App\Models\Location;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Voucher extends Model
{
    protected $table = 'vouchers';

    protected $fillable = [
        'voucher_type_id', 'series_id', 'voucher_number', 'sequence_number', 'date', 'effective_date', 'due_date',
        'status', 'fulfilment_status', 'location_id', 'party_ledger_id', 'customer_id', 'payment_method_id',
        'currency_id', 'exchange_rate', 'reference_no', 'narration', 'subtotal', 'tax_total', 'total_amount',
        'base_total', 'source_voucher_id', 'moves_stock', 'channel', 'meta', 'created_by', 'posted_at',
        'cancelled_at', 'cancelled_by', 'cancel_reason', 'doc_status', 'valid_until', 'sent_at', 'quote_request_id', 'responded_at', 'response_note',
    ];

    protected $casts = [
        'date'           => 'date:Y-m-d',
        'effective_date' => 'date:Y-m-d',
        'due_date'       => 'date:Y-m-d',
        'valid_until'    => 'date:Y-m-d',
        'sent_at'        => 'datetime',
        'responded_at'   => 'datetime',
        'exchange_rate'  => 'decimal:8',
        'subtotal'       => 'decimal:2',
        'tax_total'      => 'decimal:2',
        'total_amount'   => 'decimal:2',
        'base_total'     => 'decimal:2',
        'moves_stock'    => 'boolean',
        'meta'           => 'array',
        'posted_at'      => 'datetime',
        'cancelled_at'   => 'datetime',
    ];

    public const DRAFT = 'draft';
    public const POSTED = 'posted';
    public const CANCELLED = 'cancelled';

    public function type(): BelongsTo
    {
        return $this->belongsTo(VoucherType::class, 'voucher_type_id');
    }

    public function series(): BelongsTo
    {
        return $this->belongsTo(VoucherSeries::class, 'series_id');
    }

    public function partyLedger(): BelongsTo
    {
        return $this->belongsTo(Ledger::class, 'party_ledger_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }

    public function currency(): BelongsTo
    {
        return $this->belongsTo(Currency::class);
    }

    public function paymentMethod(): BelongsTo
    {
        return $this->belongsTo(PaymentMethod::class);
    }

    public function source(): BelongsTo
    {
        return $this->belongsTo(self::class, 'source_voucher_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'source_voucher_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function entries(): HasMany
    {
        return $this->hasMany(VoucherEntry::class)->orderBy('line_no');
    }

    public function items(): HasMany
    {
        return $this->hasMany(VoucherItem::class)->orderBy('line_no');
    }

    public function billRefs(): HasMany
    {
        return $this->hasMany(VoucherBillRef::class);
    }

    public function audit(): HasMany
    {
        return $this->hasMany(VoucherAuditLog::class)->orderBy('id');
    }

    public function isPosted(): bool
    {
        return $this->status === self::POSTED;
    }
}
