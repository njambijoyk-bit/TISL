<?php

namespace App\Models\Courses;

use Illuminate\Database\Eloquent\Model;

/** Proof that a student completed an offering. Never deleted: a wrong one is revoked. */
class Certificate extends Model
{
    protected $table = 'course_certificates';

    protected $guarded = [];

    protected $casts = ['issued_at' => 'datetime', 'expires_at' => 'datetime', 'revoked_at' => 'datetime'];
}
