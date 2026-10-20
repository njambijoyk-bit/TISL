<?php

namespace App\Models\Extras;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Models\User;

class PrequalificationTemplate extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'category',
        'description',
        'sections',
        'required_documents',
        'validity_months',
        'is_active',
        'created_by',
    ];

    protected $casts = [
        'sections'           => 'array',
        'required_documents' => 'array',
        'validity_months'    => 'integer',
        'is_active'          => 'boolean',
    ];

    // =========================================================================
    // RELATIONSHIPS
    // =========================================================================

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function submissions()
    {
        return $this->hasMany(Prequalification::class, 'template_id');
    }

    // =========================================================================
    // SCOPES
    // =========================================================================

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    public function scopeByCategory($query, string $category)
    {
        return $query->where('category', $category);
    }
}
