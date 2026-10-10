<?php

namespace App\Models\Security;

use Illuminate\Database\Eloquent\Model;

/** The few words a person chose to be shown on the sign-in page. */
class AuthSeal extends Model
{
    protected $table = 'auth_seals';

    protected $primaryKey = 'user_id';

    public $incrementing = false;

    protected $guarded = [];
}
