<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ServiceOptionValue extends Model
{
    protected $table = 'service_option_values';

    protected $fillable = ['option_id', 'value', 'position'];

    public function option(): BelongsTo
    {
        return $this->belongsTo(ServiceOption::class, 'option_id');
    }
}
