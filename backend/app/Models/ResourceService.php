<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A service (or one package of it) a resource can do. */
class ResourceService extends Model
{
    public $timestamps = false;

    protected $table = 'resource_services';

    protected $fillable = ['resource_id', 'service_id', 'service_variant_id'];
}
