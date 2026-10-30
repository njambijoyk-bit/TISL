<?php

namespace App\Models\Events;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/** Who owns events: TISL itself (is_internal) or an outside organiser, with a verification status and a commission rate. */
class EventOrganiser extends Model
{
    use SoftDeletes;

    protected $table = 'event_organisers';

    public const STATUSES = ['pending', 'verified', 'suspended', 'rejected'];
    public const KINDS = ['business' => 'Business', 'individual' => 'Individual', 'company' => 'Company'];
    public const ROLES = ['owner', 'manager', 'finance', 'door', 'staff'];

    protected $fillable = ['name', 'slug', 'kind', 'email', 'phone', 'website', 'logo', 'description', 'tax_pin', 'registration_no', 'status', 'status_note', 'verified_at', 'verified_by',
        'commission_percent', 'is_internal', 'created_by'];

    protected $casts = ['is_internal' => 'boolean', 'verified_at' => 'datetime', 'commission_percent' => 'decimal:2'];

    public function members(): HasMany
    {
        return $this->hasMany(EventOrganiserMember::class, 'organiser_id');
    }

    public function events(): HasMany
    {
        return $this->hasMany(Event::class, 'organiser_id');
    }

    /** May this organiser publish events and sell tickets? TISL itself always may; an outside organiser only once verified. */
    public function inGoodStanding(): bool
    {
        return $this->is_internal || $this->status === 'verified';
    }

    public function users()
    {
        return User::whereIn('id', $this->members()->pluck('user_id'));
    }
}
