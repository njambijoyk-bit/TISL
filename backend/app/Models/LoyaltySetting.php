<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

class LoyaltySetting extends Model
{
    protected $fillable = ['key', 'value', 'updated_by'];

    protected $casts = ['value' => 'json'];

    const CACHE_KEY = 'loyalty_settings_all';

    // ── Static helpers ────────────────────────────────────────────────────────

    public static function get(string $key, mixed $default = null): mixed
    {
        $all = self::all()->keyBy('key');
        return $all->has($key) ? $all[$key]->value : $default;
    }

    public static function set(string $key, mixed $value, ?int $updatedBy = null): void
    {
        self::updateOrCreate(
            ['key' => $key],
            ['value' => $value, 'updated_by' => $updatedBy]
        );
        Cache::forget(self::CACHE_KEY);
    }

    public static function getAll(): array
    {
        return Cache::remember(self::CACHE_KEY, 3600, function () {
            return self::all()->keyBy('key')->map(fn($s) => $s->value)->toArray();
        });
    }

    public static function bust(): void
    {
        Cache::forget(self::CACHE_KEY);
    }

    // ── Relationships ─────────────────────────────────────────────────────────

    public function updatedBy()
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}