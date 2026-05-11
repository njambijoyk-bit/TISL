<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Models\User;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class JobPosting extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'created_by',
        'title',
        'slug',
        'department',
        'location',
        'type',
        'experience_level',
        'description',
        'responsibilities',
        'requirements',
        'nice_to_haves',
        'required_documents',
        'salary_min',
        'salary_max',
        'salary_currency',
        'salary_visible',
        'status',
        'deadline',
        'published_at',
        'closed_at',
    ];

    protected $casts = [
        'responsibilities'   => 'array',
        'requirements'       => 'array',
        'nice_to_haves'      => 'array',
        'required_documents' => 'array',
        'salary_min'         => 'decimal:2',
        'salary_max'         => 'decimal:2',
        'salary_visible'     => 'boolean',
        'deadline'           => 'date',
        'published_at'       => 'datetime',
        'closed_at'          => 'datetime',
    ];

    // ── Slug auto-generation ──────────────────────────────────────────────────

    protected static function booted(): void
    {
        static::creating(function (JobPosting $job) {
            if (empty($job->slug)) {
                $job->slug = static::generateUniqueSlug($job->title);
            }
        });

        static::updating(function (JobPosting $job) {
            if ($job->isDirty('title') && !$job->isDirty('slug')) {
                $job->slug = static::generateUniqueSlug($job->title, $job->id);
            }
        });
    }

    public static function generateUniqueSlug(string $title, ?int $excludeId = null): string
    {
        $base = Str::slug($title);
        $slug = $base;
        $i    = 1;

        while (
            static::withTrashed()
                ->where('slug', $slug)
                ->when($excludeId, fn($q) => $q->where('id', '!=', $excludeId))
                ->exists()
        ) {
            $slug = "{$base}-{$i}";
            $i++;
        }

        return $slug;
    }

    // ── Scopes ────────────────────────────────────────────────────────────────

    public function scopePublished($query)
    {
        return $query->where('status', 'published');
    }

    public function scopeOpen($query)
    {
        return $query->where('status', 'published')
                     ->where(fn($q) => $q->whereNull('deadline')
                                        ->orWhere('deadline', '>=', now()->toDateString()));
    }

    public function scopeByDepartment($query, string $department)
    {
        return $query->where('department', $department);
    }

    public function scopeByType($query, string $type)
    {
        return $query->where('type', $type);
    }

    // ── Computed ──────────────────────────────────────────────────────────────

    public function getIsExpiredAttribute(): bool
    {
        return $this->deadline && $this->deadline->isPast();
    }

    public function getIsOpenAttribute(): bool
    {
        return $this->status === 'published' && !$this->is_expired;
    }

    public function getSalaryRangeAttribute(): ?string
    {
        if (!$this->salary_visible || (!$this->salary_min && !$this->salary_max)) {
            return null;
        }

        $currency = $this->salary_currency ?? 'KES';

        if ($this->salary_min && $this->salary_max) {
            return "{$currency} " . number_format($this->salary_min) . ' – ' . number_format($this->salary_max);
        }

        if ($this->salary_min) {
            return "From {$currency} " . number_format($this->salary_min);
        }

        return "Up to {$currency} " . number_format($this->salary_max);
    }

    public function getApplicationCountAttribute(): int
    {
        return $this->applications_count ?? $this->applications()->count();
    }

    // ── State transitions ─────────────────────────────────────────────────────

    public function publish(): void
    {
        $this->update([
            'status'       => 'published',
            'published_at' => $this->published_at ?? now(),
        ]);
    }

    public function close(): void
    {
        $this->update([
            'status'    => 'closed',
            'closed_at' => now(),
        ]);
    }

    // ── Relations ─────────────────────────────────────────────────────────────

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function applications()
    {
        return $this->hasMany(Application::class);
    }
}