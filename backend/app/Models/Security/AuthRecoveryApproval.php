<?php

namespace App\Models\Security;

use Illuminate\Database\Eloquent\Model;

/** One administrator's approval of a recovery request. */
class AuthRecoveryApproval extends Model
{
    protected $table = 'auth_recovery_approvals';

    protected $guarded = [];
}
