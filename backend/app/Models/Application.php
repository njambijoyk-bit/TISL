<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Application extends Model
{
    use HasFactory, SoftDeletes;

    const STATUSES = [
        'submitted',
        'under_review',
        'shortlisted',
        'interviewed',
        'rejected',
        'hired',
        'withdrawn',
    ];

    // Statuses the applicant can see with friendly labels
    const STATUS_LABELS = [
        'submitted'    => 'Application Received',
        'under_review' => 'Under Review',
        'shortlisted'  => 'Shortlisted',
        'interviewed'  => 'Interview Stage',
        'rejected'     => 'Unsuccessful',
        'hired'        => 'Offer Extended',
        'withdrawn'    => 'Withdrawn',
    ];

    // Statuses that count as "active" (not terminal)
    const ACTIVE_STATUSES = ['submitted', 'under_review', 'shortlisted', 'interviewed'];

    protected $fillable = [
        'applicant_id',
        'job_posting_id',
        'cover_letter',
        'status',
        'admin_notes',
        'ai_score',
        'ai_summary',
        'ai_strengths',
        'ai_gaps',
        'ai_recommendation',
        'ai_screened_at',
    ];

    protected $casts = [
        'ai_strengths'   => 'array',
        'ai_gaps'        => 'array',
        'ai_score'       => 'decimal:2',
        'ai_screened_at' => 'datetime',
    ];

    // ── Boot: auto-record status history on create & status change ────────────

    protected static function booted(): void
    {
        static::created(function (Application $application) {
            ApplicationStatusHistory::create([
                'application_id'  => $application->id,
                'from_status'     => null,
                'to_status'       => $application->status,
                'changed_by_type' => null,
                'changed_by_id'   => null,
                'note'            => 'Application submitted.',
            ]);
        });

        static::updated(function (Application $application) {
            if ($application->wasChanged('status')) {
                ApplicationStatusHistory::create([
                    'application_id'  => $application->id,
                    'from_status'     => $application->getOriginal('status'),
                    'to_status'       => $application->status,
                    'changed_by_type' => null, // caller should set this via setStatusBy()
                    'changed_by_id'   => null,
                ]);
            }
        });
    }

    // ── Status helpers ────────────────────────────────────────────────────────

    /**
     * Change status and record who did it.
     * Usage: $application->setStatusBy($user, 'shortlisted', 'Impressed by portfolio');
     */
    public function setStatusBy(User $actor, string $status, ?string $note = null): void
    {
        $from = $this->status;

        $this->update(['status' => $status]);

        // Update the history row that booted() just created with actor info
        $this->statusHistory()
             ->latest()
             ->first()
             ?->update([
                 'changed_by_type' => get_class($actor),
                 'changed_by_id'   => $actor->id,
                 'note'            => $note,
             ]);
    }

    public function isActive(): bool
    {
        return in_array($this->status, self::ACTIVE_STATUSES);
    }

    public function isTerminal(): bool
    {
        return in_array($this->status, ['rejected', 'hired', 'withdrawn']);
    }

    public function hasBeenScreened(): bool
    {
        return !is_null($this->ai_screened_at);
    }

    public function getStatusLabelAttribute(): string
    {
        return self::STATUS_LABELS[$this->status] ?? ucfirst($this->status);
    }

    // ── Scopes ────────────────────────────────────────────────────────────────

    public function scopeByStatus($query, string $status)
    {
        return $query->where('status', $status);
    }

    public function scopeActive($query)
    {
        return $query->whereIn('status', self::ACTIVE_STATUSES);
    }

    public function scopeScreened($query)
    {
        return $query->whereNotNull('ai_screened_at');
    }

    public function scopeUnscreened($query)
    {
        return $query->whereNull('ai_screened_at');
    }

    public function scopeForJob($query, int $jobId)
    {
        return $query->where('job_posting_id', $jobId);
    }

    // ── Relations ─────────────────────────────────────────────────────────────

    public function applicant()
    {
        return $this->belongsTo(Applicant::class);
    }

    public function jobPosting()
    {
        return $this->belongsTo(JobPosting::class);
    }

    public function documents()
    {
        return $this->hasMany(ApplicationDocument::class);
    }

    public function statusHistory()
    {
        return $this->hasMany(ApplicationStatusHistory::class)->orderBy('created_at');
    }
}