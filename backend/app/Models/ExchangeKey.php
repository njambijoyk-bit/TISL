<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/** A key another company's viewer uses to fetch an export of THIS company's books. Only a hash of the secret is kept; the file password is kept encrypted. */
class ExchangeKey extends Model
{
    protected $fillable = ['label', 'key_id', 'secret_hash', 'file_password_enc', 'max_level', 'is_active', 'last_used_at', 'last_used_ip', 'uses', 'created_by', 'revoked_at'];

    protected $hidden = ['secret_hash', 'file_password_enc'];

    protected $casts = ['is_active' => 'boolean', 'max_level' => 'integer', 'last_used_at' => 'datetime', 'revoked_at' => 'datetime'];

    public static function ready(): bool
    {
        static $ready;

        return $ready ??= Schema::hasTable('exchange_keys');
    }

    /** Make a key. @return array{0: self, 1: string, 2: string} the key, the key text to hand over (shown once) and the file password (shown once) */
    public static function make(string $label, int $maxLevel, ?int $by): array
    {
        $id = 'wk' . Str::lower(Str::random(10));
        $secret = Str::random(40);
        $password = Str::random(24);
        $key = static::create(['label' => $label, 'key_id' => $id, 'secret_hash' => hash('sha256', $secret), 'file_password_enc' => Crypt::encryptString($password),
            'max_level' => max(1, min(4, $maxLevel)), 'is_active' => true, 'created_by' => $by]);

        return [$key, $id . '.' . $secret, $password];
    }

    public function filePassword(): string
    {
        return Crypt::decryptString($this->file_password_enc);
    }

    /** The key for "keyId.secret", or null. */
    public static function fromBearer(?string $token): ?self
    {
        if (! $token || ! str_contains($token, '.') || ! static::ready()) {
            return null;
        }
        [$id, $secret] = explode('.', $token, 2);
        $key = static::where('key_id', $id)->where('is_active', true)->first();

        return $key && hash_equals($key->secret_hash, hash('sha256', $secret)) ? $key : null;
    }
}
