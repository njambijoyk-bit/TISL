<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Something the customer must provide for a service (address, photos, model no.…). */
class ServiceRequirement extends Model
{
    protected $table = 'service_requirements';

    protected $fillable = ['service_id', 'label', 'field_type', 'choices', 'help_text', 'is_required', 'position'];

    protected $casts = [
        'choices'     => 'array',
        'is_required' => 'boolean',
    ];

    public const TYPES = ['text', 'textarea', 'number', 'select', 'file'];
}
