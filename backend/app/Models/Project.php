<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\{BelongsTo, HasMany};

class Project extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'project_number',
        'customer_id',
        'title',
        'description',
        'status',
        'priority',
        'owner_admin_id',
        'delivery_location',
        'base_currency',
        'exchange_rate_to_kes',
        'converted_currency_at',
        'default_shipping_address',
        'default_billing_address',
        'billing_same_as_shipping',
        'start_date',
        'target_end_date',
        'metadata',
    ];

    protected $casts = [
        'metadata' => 'array',
        'billing_same_as_shipping' => 'boolean',
        'exchange_rate_to_kes' => 'decimal:8',
        'converted_currency_at' => 'datetime',
        'start_date' => 'datetime',
        'target_end_date' => 'datetime',
    ];
    
    // ─────────────────────────────
    // Lifecycle Hooks
    // ─────────────────────────────

    protected static function booted(): void
    {
        // `deleting` fires for both soft-delete and forceDelete().
        // We only cascade when it is a permanent (force) delete — soft-delete
        // must leave all children intact so they survive a restore.
        static::deleting(function (self $project) {
            if ($project->isForceDeleting()) {
                static::cascadeDeleteChildren($project);
            }
        });
    }

    private static function cascadeDeleteChildren(self $project): void
    {
        $project->participants()->delete();
        $project->links()->delete();
        $project->items()->delete();
        $project->tasks()->delete();
        $project->milestones()->delete();
        $project->messages()->delete();
        $project->activity()->delete();
    }
    
    // ─────────────────────────────
    // Relationships
    // ─────────────────────────────

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function ownerAdmin(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_admin_id');
    }

    public function participants(): HasMany
    {
        return $this->hasMany(ProjectParticipant::class);
    }

    public function links(): HasMany
    {
        return $this->hasMany(ProjectLink::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(ProjectItem::class)->orderBy('display_order');
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(ProjectTask::class)->orderBy('created_at', 'desc');
    }

    public function milestones(): HasMany
    {
        return $this->hasMany(ProjectMilestone::class)->orderBy('created_at', 'desc');
    }

    public function messages(): HasMany
    {
        return $this->hasMany(ProjectMessage::class)->orderBy('created_at', 'asc');
    }

    public function activity(): HasMany
    {
        return $this->hasMany(ProjectActivity::class)->orderBy('created_at', 'desc');
    }

    // ─────────────────────────────
    // Helpful Scopes
    // ─────────────────────────────

    public function scopeActive($query)
    {
        return $query->whereIn('status', ['planning', 'active', 'on_hold']);
    }

    public function scopeForCustomer($query, int $customerId)
    {
        return $query->where('customer_id', $customerId);
    }
}