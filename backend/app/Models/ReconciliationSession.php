<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReconciliationSession extends Model
{
    protected $fillable = [
        'session_number',
        'period_start',
        'period_end',
        'ledger',
        'opened_by',
        'closed_by',
        'status',
        'notes',
        'opened_at',
        'closed_at',
        'meta',
        'confirmed_amount',
        'disputed_amount',
        'voided_amount',
        'pending_amount',
        'written_off_amount',
    ];

    protected $casts = [
        'period_start' => 'date',
        'period_end'   => 'date',
        'opened_at'    => 'datetime',
        'closed_at'    => 'datetime',
        'meta'         => 'array',
        'confirmed_amount'   => 'decimal:2',
        'disputed_amount'    => 'decimal:2',
        'voided_amount'      => 'decimal:2',
        'pending_amount'     => 'decimal:2',
        'written_off_amount' => 'decimal:2',
    ];

    // ── Relationships ────────────────────────────────────────────

    public function openedBy()
    {
        return $this->belongsTo(User::class, 'opened_by');
    }

    public function closedBy()
    {
        return $this->belongsTo(User::class, 'closed_by');
    }

    public function lines()
    {
        return $this->hasMany(ReconciliationLine::class, 'session_id');
    }

    public function pendingLines()
    {
        return $this->lines()->where('status', 'pending');
    }

    public function disputedLines()
    {
        return $this->lines()->where('status', 'disputed');
    }

    // ── Scopes ───────────────────────────────────────────────────

    public function scopeOpen($q)
    {
        return $q->where('status', 'open');
    }

    public function scopeForLedger($q, string $ledger)
    {
        return $q->where('ledger', $ledger);
    }

    // ── Helpers ──────────────────────────────────────────────────

    /**
     * A session can only close when nothing is pending or still disputed.
     * Disputed lines need a deliberate resolution (confirm or write-off) first.
     */
    public function canClose(): bool
    {
        return $this->pendingLines()->count() === 0
            && $this->disputedLines()->count() === 0;
    }

    public function close(int $userId, string $userName): bool
    {
        if (!$this->canClose()) return false;

        $this->update([
            'status'    => 'closed',
            'closed_by' => $userId,
            'closed_at' => now(),
        ]);

        $this->logEvent([
            'type' => 'session_closed',
            'by'   => $userId,
            'name' => $userName,
            'at'   => now()->toISOString(),
        ]);

        return true;
    }

    public function reopen(int $userId, string $userName): void
    {
        $this->update(['status' => 'open']);

        $this->logEvent([
            'type' => 'session_reopened',
            'by'   => $userId,
            'name' => $userName,
            'at'   => now()->toISOString(),
        ]);
    }

    public function isOpen(): bool
    {
        return $this->status === 'open';
    }

    public function recalculateSummary(): void
    {
        $lines = $this->lines();

        $this->update([
            'confirmed_amount'   => $lines->clone()->where('status', 'confirmed')->sum('actual_amount'),
            'disputed_amount'    => $lines->clone()->where('status', 'disputed')->sum('disputed_amount'),
            'voided_amount'      => $lines->clone()->where('status', 'voided')->sum('expected_amount'),
            'pending_amount'     => $lines->clone()->where('status', 'pending')->sum('expected_amount'),
            'written_off_amount' => $lines->clone()->where('status', 'written_off')->sum('expected_amount'),
        ]);
    }

    /**
     * Append an event to meta.events.
     * This is the single write path for all session-level audit history.
     */
    public function logEvent(array $event): void
    {
        $meta           = $this->meta ?? [];
        $meta['events'] = array_merge($meta['events'] ?? [], [$event]);
        $this->update(['meta' => $meta]);
    }

    /**
     * Pull only line_status_change events from meta for easy access.
     */
    public function lineStatusChanges(): array
    {
        return collect($this->meta['events'] ?? [])
            ->filter(fn($e) => $e['type'] === 'line_status_change')
            ->values()
            ->all();
    }

    /**
     * Active disputes: status changes that ended in 'disputed' and have
     * no later event on the same line_id resolving them.
     */
    public function openDisputes(): array
    {
        $events  = collect($this->meta['events'] ?? [])
            ->filter(fn($e) => $e['type'] === 'line_status_change')
            ->groupBy('line_id');

        $disputes = [];
        foreach ($events as $lineId => $lineEvents) {
            $last = $lineEvents->last();
            if ($last['to'] === 'disputed') {
                $disputes[] = $last;
            }
        }

        return $disputes;
    }

    // ── Boot ─────────────────────────────────────────────────────

    protected static function boot()
    {
        parent::boot();
        static::creating(function ($model) {
            if (empty($model->session_number)) {
                $year  = now()->year;
                $count = static::whereYear('created_at', $year)->count() + 1;
                $model->session_number = 'REC-' . $year . '-' . str_pad($count, 4, '0', STR_PAD_LEFT);
            }
        });
    }
}