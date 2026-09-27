<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Admin-assigned mapping of a database table to a module (for backups).
 *
 * The keyed by table_name. A row either assigns the table to a module
 * (module_key set, is_excluded = 0) or marks it as never-backed-up
 * (is_excluded = 1). These rows override the built-in ModuleTables::MAP, so
 * the admin can place any table — including ones added later via SQL — without
 * a code change.
 */
class ModuleTableMap extends Model
{
    protected $table = 'module_table_map';

    protected $primaryKey = 'table_name';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['table_name', 'module_key', 'is_excluded'];

    protected $casts = ['is_excluded' => 'boolean'];
}
