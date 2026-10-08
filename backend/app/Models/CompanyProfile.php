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

    protected $fillable = ['name', 'short_code', 'legal_name', 'tax_pin', 'email', 'phone', 'address', 'city', 'country', 'website', 'tagline', 'logo_url', 'updated_by', 'phones', 'emails', 'description', 'declaration', 'payment_terms', 'payment_mode', 'delivery_terms'];

    protected $casts = ['phones' => 'array', 'emails' => 'array'];

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

    /** Words that do not count when a name is shortened: only the connectors. (Limited, Ltd and the like do count: "Tisl Industrial Supply Limited" is TISL.) */
    private const SKIP_WORDS = ['and', 'of', 'the', 'for'];

    /**
     * A short mark from a name: the first letters of its words in capitals ("Tisl Industrial Supply Limited" gives TISL, "Acme Foods Ltd" gives AFL),
     * up to five letters. One word gives its first four letters. Empty when the name has no letters or digits.
     */
    public static function abbreviate(?string $name): string
    {
        $words = preg_split('/[^\p{L}\p{N}]+/u', trim(str_replace(["'", '’'], '', (string) $name)), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $kept = array_values(array_filter($words, fn ($w) => ! in_array(mb_strtolower($w), self::SKIP_WORDS, true)));
        $words = $kept ?: $words;   // a name made only of skipped words keeps them
        if (! $words) {
            return '';
        }
        if (count($words) === 1) {
            return mb_strtoupper(mb_substr($words[0], 0, 4));
        }

        return mb_strtoupper(implode('', array_map(fn ($w) => mb_substr($w, 0, 1), array_slice($words, 0, 5))));
    }

    /**
     * What the admin sidebar and other small places show for the business: the short code if there is one, otherwise a short mark made from the
     * trading name, otherwise from the legal name. (A profile that was never saved has only the placeholder code, so it is not used.)
     */
    public function brandMark(): string
    {
        $code = $this->exists ? trim((string) $this->short_code) : '';
        if ($code !== '') {
            return $code;
        }

        return self::abbreviate($this->name) ?: self::abbreviate($this->legal_name);
    }

    /**
     * Tidy a list of contacts [{value, label, is_default}]: blanks dropped, exactly one default (the first marked one,
     * else the first). Returns [] when there are none.
     */
    public static function cleanContacts(?array $rows): array
    {
        $out = [];
        foreach ((array) $rows as $r) {
            $v = trim((string) (is_array($r) ? ($r['value'] ?? '') : $r));
            if ($v === '') {
                continue;
            }
            $out[] = ['value' => $v, 'label' => trim((string) (is_array($r) ? ($r['label'] ?? '') : '')) ?: null, 'is_default' => is_array($r) && ! empty($r['is_default'])];
        }
        if (! $out) {
            return [];
        }
        $def = array_search(true, array_column($out, 'is_default'), true);
        foreach ($out as $i => &$o) {
            $o['is_default'] = $i === ($def === false ? 0 : $def);
        }

        return $out;
    }

    /** Every email address, default first; falls back to the single email column until the list is filled in. */
    public function emailList(): array
    {
        $l = static::cleanContacts($this->emails ?? []);

        return $l ?: static::cleanContacts($this->email ? [['value' => $this->email, 'label' => 'Main', 'is_default' => true]] : []);
    }

    public function phoneList(): array
    {
        $l = static::cleanContacts($this->phones ?? []);

        return $l ?: static::cleanContacts($this->phone ? [['value' => $this->phone, 'label' => 'Main', 'is_default' => true]] : []);
    }

    /** The address the system sends mail from, and the one customers reply to. */
    public static function defaultEmail(): ?string
    {
        foreach (static::current()->emailList() as $e) {
            if ($e['is_default']) {
                return $e['value'];
            }
        }

        return null;
    }

    /** The number printed first on documents and quoted in WhatsApp messages. */
    public static function defaultPhone(): ?string
    {
        foreach (static::current()->phoneList() as $p) {
            if ($p['is_default']) {
                return $p['value'];
            }
        }

        return null;
    }

    /** A phone number as wa.me wants it: digits only, with the country code (0712… → 254712…). */
    public static function waDigits(?string $phone): ?string
    {
        $raw = trim((string) $phone);
        if ($raw === '') {
            return null;
        }
        $plus = str_starts_with($raw, '+') || str_starts_with($raw, '00');
        $d = preg_replace('/\D+/', '', $raw);
        if (str_starts_with($d, '00')) {
            $d = substr($d, 2);
        }
        $code = preg_replace('/\D+/', '', (string) config('app.phone_country_code', '254'));
        if (! $plus && str_starts_with($d, '0')) {
            $d = $code . substr($d, 1);
        } elseif (! $plus && strlen($d) <= 9) {
            $d = $code . $d;
        }

        return strlen($d) >= 8 ? $d : null;
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
