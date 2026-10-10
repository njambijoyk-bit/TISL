<?php

namespace App\Services\Security;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The security switches the owner can change from the screen (script 125): rule modes, grace dates, which roles a rule is for.
 * A setting with no row yet is whatever `config/security.php` says (which in turn comes from the environment), so nothing changes until someone chooses.
 * Before script 125 is run the table is absent and every setting is its default.
 */
final class SecuritySettings
{
    private static ?bool $ready = null;

    /** @var array<string, mixed>|null */
    private static ?array $rows = null;

    public static function forget(): void
    {
        self::$ready = null;
        self::$rows = null;
    }

    public static function ready(): bool
    {
        return self::$ready ??= Schema::hasTable('security_settings');
    }

    /** @return array<string, mixed> every row, decoded */
    private function rows(): array
    {
        if (self::$rows === null) {
            self::$rows = [];
            if (self::ready()) {
                foreach (DB::table('security_settings')->get(['setting_key', 'value']) as $r) {
                    self::$rows[$r->setting_key] = $r->value === null ? null : json_decode($r->value, true);
                }
            }
        }

        return self::$rows;
    }

    /** The value chosen on the screen, else the default in `config('security.policy.<key>')`, else `$default`. */
    public function get(string $key, mixed $default = null): mixed
    {
        $rows = $this->rows();

        return array_key_exists($key, $rows) ? $rows[$key] : config('security.policy.'.$key, $default);
    }

    /** Has the owner chosen this one (as opposed to it being the default)? */
    public function isChosen(string $key): bool
    {
        return array_key_exists($key, $this->rows());
    }

    public function set(string $key, mixed $value, ?int $byUserId): void
    {
        if (! self::ready()) {
            throw new \RuntimeException('Run database/sql/125_security_policy.sql first.');
        }
        $now = now();
        $row = DB::table('security_settings')->where('setting_key', $key);
        if ($row->exists()) {
            $row->update(['value' => json_encode($value), 'updated_by_id' => $byUserId, 'updated_at' => $now]);
        } else {
            DB::table('security_settings')->insert(['setting_key' => $key, 'value' => json_encode($value), 'updated_by_id' => $byUserId, 'created_at' => $now, 'updated_at' => $now]);
        }
        self::$rows = null;
    }
}
