<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Policy extends Model
{
    protected $fillable = [
        'key', 'title', 'content', 'disagree_consequence_text',
        'sensitivity', 'major_version', 'minor_version',
        'requires_acceptance', 'is_active', 'created_by', 'updated_by',
    ];

    protected $guarded = ['version'];

    protected $casts = [
        'requires_acceptance' => 'boolean',
        'is_active'           => 'boolean',
    ];

    public function getVersionAttribute(): string
    {
        return "{$this->major_version}.{$this->minor_version}";
    }

    public function acceptances() { return $this->hasMany(PolicyAcceptance::class); }
    public function changeLogs()  { return $this->hasMany(PolicyChangeLog::class); }
    public function createdBy()   { return $this->belongsTo(User::class, 'created_by'); }
    public function updatedBy()   { return $this->belongsTo(User::class, 'updated_by'); }
}