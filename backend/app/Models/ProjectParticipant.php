<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProjectParticipant extends Model
{
    protected $fillable = [
        'project_id',
        'participant_type', // customer|admin
        'customer_id',
        'admin_user_id',
        'role',
        'can_view_finance',
        'can_comment',
        'can_upload_docs',
        'can_approve',
        'status', // invited|active|removed
        'invited_by',
        'invited_at',
        'accepted_at',
    ];

    protected $casts = [
        'can_view_finance' => 'boolean',
        'can_comment' => 'boolean',
        'can_upload_docs' => 'boolean',
        'can_approve' => 'boolean',
        'invited_at' => 'datetime',
        'accepted_at' => 'datetime',
    ];

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function adminUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'admin_user_id');
    }

    public function invitedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invited_by');
    }

    // Convenience: get the actual "person" model (Customer or User)
    public function getPersonAttribute()
    {
        return $this->participant_type === 'customer'
            ? $this->customer
            : $this->adminUser;
    }

    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    public function scopeCustomers($query)
    {
        return $query->where('participant_type', 'customer');
    }

    public function scopeAdmins($query)
    {
        return $query->where('participant_type', 'admin');
    }
}