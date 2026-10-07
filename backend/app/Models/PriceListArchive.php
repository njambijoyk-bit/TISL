<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A zip (PDF + CSV + JSON) of a price list that was taken off the server, kept where customers who are allowed can still open it. */
class PriceListArchive extends Model
{
    protected $fillable = ['title', 'file_path', 'file_name', 'size_bytes', 'list_name', 'list_as_at', 'access', 'customer_types', 'uploaded_by'];

    protected $casts = ['customer_types' => 'array', 'list_as_at' => 'datetime', 'size_bytes' => 'integer'];

    protected function serializeDate(\DateTimeInterface $date): string
    {
        return \Carbon\Carbon::instance($date)->setTimezone(config('app.timezone'))->format('Y-m-d\TH:i:sP');
    }
}
