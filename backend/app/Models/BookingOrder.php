<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BookingOrder extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'booking_id',
        'order_id',
        'occurrence_date',
        'notes',
        'created_at',
    ];

    protected $casts = [
        'occurrence_date' => 'date',
        'created_at'      => 'datetime',
    ];

    protected static function boot()
    {
        parent::boot();
        static::creating(fn($m) => $m->created_at = now());
    }

    public function booking()
    {
        return $this->belongsTo(Booking::class);
    }

    public function order()
    {
        return $this->belongsTo(Order::class);
    }
}