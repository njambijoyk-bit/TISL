<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class HamperActivityLog extends Model
{
    protected $fillable = [
        'hamper_id', 'hamper_order_id', 'user_id',
        'performed_by', 'action', 'description',
        'severity', 'metadata',
    ];

    protected $casts = ['metadata' => 'array'];

    public function hamper()       { return $this->belongsTo(Hamper::class); }
    public function hamperOrder()  { return $this->belongsTo(HamperOrder::class); }
    public function user()         { return $this->belongsTo(User::class); }
}