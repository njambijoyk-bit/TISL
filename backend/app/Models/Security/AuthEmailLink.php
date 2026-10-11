<?php

namespace App\Models\Security;

use Illuminate\Database\Eloquent\Model;

/** One emailed sign-in link. Only hashes are kept: of the code in the link, and of the code in the asking browser's cookie. */
class AuthEmailLink extends Model
{
    protected $table = 'auth_email_links';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $guarded = [];

    protected $casts = ['tries' => 'integer', 'expires_at' => 'datetime', 'used_at' => 'datetime'];
}
