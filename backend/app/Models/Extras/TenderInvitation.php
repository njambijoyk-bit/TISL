<?php

namespace App\Models\Extras;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Models\User;
use App\Models\Vendor;

class TenderInvitation extends Model
{
    use HasFactory;

    protected $fillable = [
        'tender_id',
        'vendor_id',
        'invited_by',
        'responded',
        'declined_reason',
    ];

    protected $casts = [
        'responded' => 'boolean',
    ];

    public function tender()
    {
        return $this->belongsTo(Tender::class);
    }

    public function vendor()
    {
        return $this->belongsTo(Vendor::class);
    }

    public function inviter()
    {
        return $this->belongsTo(User::class, 'invited_by');
    }
}
