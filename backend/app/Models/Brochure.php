<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/** A brochure (one item) or catalogue (several): the same document at different sizes. The ordered entries are one JSON column. */
class Brochure extends Model
{
    use SoftDeletes;

    protected $fillable = ['title', 'subtitle', 'size', 'status', 'access', 'customer_types', 'settings', 'entries', 'created_by', 'published_at'];

    protected $casts = ['customer_types' => 'array', 'settings' => 'array', 'entries' => 'array', 'published_at' => 'datetime'];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    protected function serializeDate(\DateTimeInterface $date): string
    {
        return \Carbon\Carbon::instance($date)->setTimezone(config('app.timezone'))->format('Y-m-d\TH:i:sP');
    }
}
