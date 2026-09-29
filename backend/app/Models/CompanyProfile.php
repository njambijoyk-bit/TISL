<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

/**
 * The single row that says who the business is. Emails, documents, chat and
 * numbering read the name from here — no brand is written into code.
 */
class CompanyProfile extends Model
{
    protected $table = 'company_profile';

    protected $fillable = ['name', 'short_code', 'legal_name', 'tax_pin', 'email', 'phone', 'address', 'city', 'country', 'website', 'tagline', 'logo_url', 'updated_by'];

    public static function current(): self
    {
        return Cache::remember('company_profile', 600, function () {
            try {
                return static::first() ?? new static(['name' => config('app.name'), 'short_code' => 'CO']);
            } catch (\Throwable) {
                return new static(['name' => config('app.name'), 'short_code' => 'CO']);
            }
        });
    }

    public static function name(): string
    {
        return static::current()->name ?: (string) config('app.name');
    }

    public static function forget(): void
    {
        Cache::forget('company_profile');
    }

    protected static function booted(): void
    {
        static::saved(fn () => static::forget());
    }
}
