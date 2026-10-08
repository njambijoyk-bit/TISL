<?php

namespace App\Models\Access;

use Illuminate\Database\Eloquent\Model;

class RoleApproval extends Model
{
    protected $table = 'role_approvals';
    public $timestamps = false;
    public $incrementing = false;
    protected $primaryKey = null;
    protected $fillable = ['role_id', 'approval_key', 'max_amount'];
    protected $casts = ['max_amount' => 'float'];
}
