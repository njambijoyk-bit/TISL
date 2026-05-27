<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OrderActivityLog extends Model
{
    protected $fillable = [
        'order_id',
        'user_id',
        'performed_by',
        'action',
        'description',
        'severity',
        'metadata',
    ];

    protected $casts = [
        'metadata' => 'array',
    ];

    public function order()
    {
        return $this->belongsTo(Order::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}