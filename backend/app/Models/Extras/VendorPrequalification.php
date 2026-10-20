<?php

namespace App\Models\Extras;

use App\Models\User;
use App\Models\Vendor;
use Illuminate\Database\Eloquent\Model;

/**
 * Who is pre-qualified, for which category and until when. Staff record it from the documents a vendor sent in; every approval, refusal and revocation carries a written reason.
 */
class VendorPrequalification extends Model
{
    public const CATEGORIES = ['goods', 'services', 'works'];

    protected $fillable = ['vendor_id', 'category', 'status', 'qualified_from', 'valid_until', 'reason', 'notes', 'recorded_by', 'machine_flags', 'reminded_at'];

    protected $casts = ['qualified_from' => 'date', 'valid_until' => 'date', 'machine_flags' => 'array', 'reminded_at' => 'datetime'];

    public function vendor()
    {
        return $this->belongsTo(Vendor::class);
    }

    public function recorder()
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }

    /** Qualified and not yet expired. */
    public function scopeCurrent($query)
    {
        return $query->where('status', 'qualified')
            ->where(fn ($q) => $q->whereNull('valid_until')->orWhere('valid_until', '>=', now()->toDateString()));
    }

    public function isCurrent(): bool
    {
        return $this->status === 'qualified' && (! $this->valid_until || ! $this->valid_until->isPast());
    }
}
