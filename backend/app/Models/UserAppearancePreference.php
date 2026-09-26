<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UserAppearancePreference extends Model
{
    protected $fillable = [
        'user_id', 'colouring_id', 'mode_override',
        'heading_font_id', 'body_font_id', 'icon_style_id',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function colouring(): BelongsTo
    {
        return $this->belongsTo(Colouring::class);
    }

    public function headingFont(): BelongsTo
    {
        return $this->belongsTo(AppearanceFont::class, 'heading_font_id');
    }

    public function bodyFont(): BelongsTo
    {
        return $this->belongsTo(AppearanceFont::class, 'body_font_id');
    }

    public function iconStyle(): BelongsTo
    {
        return $this->belongsTo(IconStyle::class);
    }
}
