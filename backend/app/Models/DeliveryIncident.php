<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DeliveryIncident extends Model
{
    protected $fillable = [
        'manifest_id',
        'delivery_item_id',
        'reported_by',
        'reported_against',
        'reporter_role',
        'category',
        'severity',
        'description',
        'redacted_description',
        'is_redacted',
        'admin_notes',
        'driver_can_see',
        'customer_can_see',
        'status',
        'resolved_by',
        'resolved_at',
    ];

    protected $casts = [
        'is_redacted'      => 'boolean',
        'driver_can_see'   => 'boolean',
        'customer_can_see' => 'boolean',
        'resolved_at'      => 'datetime',
    ];

    protected $appends = ['severity_label', 'category_label', 'status_label'];

    // Sensitive fields — never leak raw description to non-admins via API
    // Controllers must call visibleDescriptionFor($user) instead
    protected $hidden = ['description', 'admin_notes'];

    // ── Relationships ────────────────────────────────────────

    public function manifest(): BelongsTo
    {
        return $this->belongsTo(DeliveryManifest::class, 'manifest_id');
    }

    public function deliveryItem(): BelongsTo
    {
        return $this->belongsTo(DeliveryItem::class, 'delivery_item_id');
    }

    public function reporter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reported_by');
    }

    public function accused(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reported_against');
    }

    public function resolver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by');
    }

    // ── Accessors ────────────────────────────────────────────

    public function getSeverityLabelAttribute(): string
    {
        return match ($this->severity) {
            'low'      => 'Low',
            'medium'   => 'Medium',
            'high'     => 'High',
            'critical' => 'Critical',
            default    => ucfirst($this->severity),
        };
    }

    public function getCategoryLabelAttribute(): string
    {
        return match ($this->category) {
            'misconduct'      => 'Misconduct',
            'rude_customer'   => 'Rude Customer',
            'security_issue'  => 'Security Issue',
            'road_condition'  => 'Road Condition',
            'assault'         => 'Assault',
            'property_damage' => 'Property Damage',
            'other'           => 'Other',
            default           => ucfirst($this->category),
        };
    }

    public function getStatusLabelAttribute(): string
    {
        return match ($this->status) {
            'open'          => 'Open',
            'under_review'  => 'Under Review',
            'resolved'      => 'Resolved',
            'dismissed'     => 'Dismissed',
            default         => ucfirst($this->status),
        };
    }

    // ── Helpers ──────────────────────────────────────────────

    /**
     * Return the description appropriate for the viewing user.
     * Admin always sees full description.
     * Driver/Customer see redacted version only if admin has allowed it.
     */
    public function visibleDescriptionFor(User $user): ?string
    {
        if ($user->isAdmin()) {
            return $this->getRawOriginal('description');
        }

        if ($user->role === 'driver' && $this->driver_can_see) {
            return $this->is_redacted
                ? $this->redacted_description
                : $this->getRawOriginal('description');
        }

        if ($user->role === 'customer' && $this->customer_can_see) {
            return $this->is_redacted
                ? $this->redacted_description
                : $this->getRawOriginal('description');
        }

        return null;
    }

    public function isCritical(): bool
    {
        return $this->severity === 'critical';
    }

    public function isAssault(): bool
    {
        return $this->category === 'assault';
    }

    /**
     * Should this incident block or warn before assigning driver to a customer?
     */
    public function blocksFreeAssignment(): bool
    {
        return in_array($this->severity, ['high', 'critical'])
            && in_array($this->status, ['open', 'under_review']);
    }

    // ── Scopes ───────────────────────────────────────────────

    public function scopeOpen($query)
    {
        return $query->where('status', 'open');
    }

    public function scopeCritical($query)
    {
        return $query->where('severity', 'critical');
    }

    public function scopeInvolving($query, int $userId)
    {
        return $query->where(function ($q) use ($userId) {
            $q->where('reported_by', $userId)
              ->orWhere('reported_against', $userId);
        });
    }

    public function scopeBetween($query, int $driverId, int $customerId)
    {
        return $query->where(function ($q) use ($driverId, $customerId) {
            $q->where('reported_by', $driverId)->where('reported_against', $customerId);
        })->orWhere(function ($q) use ($driverId, $customerId) {
            $q->where('reported_by', $customerId)->where('reported_against', $driverId);
        });
    }

    /**
     * Scope incidents involving a driver paired with ANY of the given customer user IDs.
     * Used by the manifest safety check when validating a driver against multiple orders.
     */
    public function scopeBetweenMany($query, int $driverId, array $customerUserIds)
    {
        return $query->where(function ($q) use ($driverId, $customerUserIds) {
            // Customer filed against driver
            $q->where(function ($inner) use ($driverId, $customerUserIds) {
                $inner->where('reported_against', $driverId)
                    ->whereIn('reported_by', $customerUserIds);
            })
            // Driver filed against customer
            ->orWhere(function ($inner) use ($driverId, $customerUserIds) {
                $inner->where('reported_by', $driverId)
                    ->whereIn('reported_against', $customerUserIds);
            });
        });
    }
}
