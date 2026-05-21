<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BookingWorksheet extends Model
{
    protected $fillable = [
        'booking_id',
        'filled_by',
        'currency_code',
        'exchange_rate_to_kes',
        'findings',
        'hours_worked',
        'labour_cost',
        'labour_cost_kes',
        'total_materials',
        'total_materials_kes',
        'grand_total',
        'grand_total_kes',
        'admin_notes',
        'status',
        'submitted_at',
        'approved_by',
        'approved_at',
        'rejected_reason',
        'exported_at',
        'export_url',
    ];

    protected $casts = [
        'submitted_at'        => 'datetime',
        'approved_at'         => 'datetime',
        'exported_at'         => 'datetime',
        'hours_worked'        => 'decimal:2',
        'labour_cost'         => 'decimal:2',
        'labour_cost_kes'     => 'decimal:2',
        'total_materials'     => 'decimal:2',
        'total_materials_kes' => 'decimal:2',
        'grand_total'         => 'decimal:2',
        'grand_total_kes'     => 'decimal:2',
        'exchange_rate_to_kes'=> 'decimal:8',
    ];

    // ── Relationships ────────────────────────────────────────────────────────

    public function booking()
    {
        return $this->belongsTo(Booking::class);
    }

    public function filled_by()
    {
        return $this->belongsTo(User::class, 'filled_by');
    }

    public function approved_by()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function items()
    {
        return $this->hasMany(WorksheetItem::class, 'worksheet_id')->orderBy('sort_order');
    }

    public function currency()
    {
        return $this->belongsTo(Currency::class, 'currency_code', 'code');
    }

    // ── Scopes ───────────────────────────────────────────────────────────────

    public function scopeDraft($query)      { return $query->where('status', 'draft'); }
    public function scopeSubmitted($query)  { return $query->where('status', 'submitted'); }
    public function scopeApproved($query)   { return $query->where('status', 'approved'); }

    // ── Helpers ──────────────────────────────────────────────────────────────

    public function isDraft(): bool     { return $this->status === 'draft'; }
    public function isSubmitted(): bool { return $this->status === 'submitted'; }
    public function isApproved(): bool  { return $this->status === 'approved'; }
    public function isRejected(): bool  { return $this->status === 'rejected'; }

    /**
     * Recalculate totals from items + labour.
     * Converts all values to KES using the snapshotted exchange rate.
     */
    public function recalcTotals(): void
    {
        $rate = (float) ($this->exchange_rate_to_kes ?? 1.0);

        $materialTotal    = $this->items()->sum('line_total');
        $materialTotalKes = round($materialTotal * $rate, 2);

        $labourKes = round((float) ($this->labour_cost ?? 0) * $rate, 2);

        $this->update([
            'total_materials'     => $materialTotal,
            'total_materials_kes' => $materialTotalKes,
            'labour_cost_kes'     => $labourKes,
            'grand_total'         => round((float)($this->labour_cost ?? 0) + $materialTotal, 2),
            'grand_total_kes'     => round($labourKes + $materialTotalKes, 2),
        ]);
    }

    /**
     * Snapshot the current exchange rate from the Currency table.
     */
    public function snapshotExchangeRate(): void
    {
        if ($this->currency_code === 'KES') {
            $this->update(['exchange_rate_to_kes' => 1.0]);
            return;
        }

        try {
            $rate = Currency::rateToKes($this->currency_code);
            $this->update(['exchange_rate_to_kes' => $rate]);
        } catch (\Exception) {
            // leave existing rate intact if lookup fails
        }
    }

    /**
     * Returns only the fields safe to expose to a customer (strips admin_notes).
     */
    public function toCustomerArray(): array
    {
        $data = $this->toArray();
        unset($data['admin_notes']);
        return $data;
    }
}