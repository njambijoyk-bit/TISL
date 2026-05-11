<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ApplicationStatusHistory extends Model
{
    use HasFactory;

    protected $table = 'application_status_history';

    protected $fillable = [
        'application_id',
        'from_status',
        'to_status',
        'changed_by_type',
        'changed_by_id',
        'note',
    ];

    // ── Computed ──────────────────────────────────────────────────────────────

    /**
     * Human-readable description of the transition.
     * e.g. "Moved from Under Review → Shortlisted"
     */
    public function getTransitionLabelAttribute(): string
    {
        $toLabel = Application::STATUS_LABELS[$this->to_status] ?? ucfirst($this->to_status);

        if (!$this->from_status) {
            return "Application submitted ({$toLabel})";
        }

        $fromLabel = Application::STATUS_LABELS[$this->from_status] ?? ucfirst($this->from_status);

        return "Moved from {$fromLabel} → {$toLabel}";
    }

    public function getChangedByLabelAttribute(): string
    {
        if (!$this->changed_by_type || !$this->changed_by_id) {
            return 'System';
        }

        // Resolve the actor's name without a separate query if already loaded
        if ($this->relationLoaded('changedBy') && $this->changedBy) {
            return $this->changedBy->name ?? 'Unknown';
        }

        return 'Staff';
    }

    // ── Relations ─────────────────────────────────────────────────────────────

    public function application()
    {
        return $this->belongsTo(Application::class);
    }

    /**
     * Polymorphic — resolves to User (or any other model) based on changed_by_type.
     */
    public function changedBy()
    {
        if (!$this->changed_by_type || !$this->changed_by_id) {
            return null;
        }

        return $this->changed_by_type::find($this->changed_by_id);
    }
}