<?php

namespace App\Models\Ecommerce;

use Illuminate\Database\Eloquent\Model;
use App\Models\User;

class HamperActivityLog extends Model
{
    protected $fillable = [
        'hamper_id', 'user_id',
        'performed_by', 'action', 'description',
        'severity', 'metadata',
    ];

    protected $casts = ['metadata' => 'array'];

    public function hamper()       { return $this->belongsTo(Hamper::class); }
    public function user()         { return $this->belongsTo(User::class); }
}