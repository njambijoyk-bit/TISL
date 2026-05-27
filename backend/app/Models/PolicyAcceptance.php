<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PolicyAcceptance extends Model
{
    public $timestamps = false;
    
    protected $fillable = [
        'policy_id', 'policy_key', 'policy_version', 'policy_snapshot',
        'customer_id', 'user_id', 'customer_number', 'action_context',
        'reference_type', 'reference_id', 'response', 'disagree_reason',
        'ip_address', 'user_agent', 'was_successful', 'flagged', 'accepted_at',
    ];

    protected $casts = ['was_successful' => 'boolean', 'flagged' => 'boolean'];

    public function policy()   { return $this->belongsTo(Policy::class); }
    public function customer() { return $this->belongsTo(Customer::class); }
    public function user()     { return $this->belongsTo(User::class); }
}