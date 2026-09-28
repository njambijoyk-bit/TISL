<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A choice a customer makes about a service (Type, Location, Size…). */
class ServiceOption extends Model
{
    protected $table = 'service_options';

    protected $fillable = ['service_id', 'name', 'position'];

    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class);
    }

    public function values(): HasMany
    {
        return $this->hasMany(ServiceOptionValue::class, 'option_id')->orderBy('position')->orderBy('id');
    }
}
