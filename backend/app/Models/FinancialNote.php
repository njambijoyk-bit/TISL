<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FinancialNote extends Model
{
    protected $fillable = [
        'note_number',
        'written_by',
        'note_type',
        'amount',
        'currency',
        'direction',
        'subject_table',
        'subject_id',
        'reference_label',
        'body',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
    ];

    // ── Relationships ────────────────────────────────────────────

    public function author()
    {
        return $this->belongsTo(User::class, 'written_by');
    }

    public function reconciliationLines()
    {
        return $this->hasMany(ReconciliationLine::class, 'financial_note_id');
    }

    // ── Scopes ───────────────────────────────────────────────────

    public function scopeForSubject($q, string $table, int $id)
    {
        return $q->where('subject_table', $table)->where('subject_id', $id);
    }

    public function scopeOfType($q, string $type)
    {
        return $q->where('note_type', $type);
    }

    public function scopeInPeriod($q, string $from, string $to)
    {
        return $q->whereBetween('created_at', [$from, $to]);
    }

    // ── Boot ─────────────────────────────────────────────────────

    protected static function boot()
    {
        parent::boot();
        static::creating(function ($model) {
            if (empty($model->note_number)) {
                $year  = now()->year;
                $last  = static::whereYear('created_at', $year)->max('note_number');
                $count = $last ? ((int) substr($last, -4)) + 1 : 1;
                $model->note_number = 'FN-' . $year . '-' . str_pad($count, 4, '0', STR_PAD_LEFT);
            }
        });
    }
}