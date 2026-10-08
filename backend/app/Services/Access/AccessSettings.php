<?php

namespace App\Services\Access;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The owner's choices about branch limits, one per area (books, stock...), kept in access_settings (script 99).
 * Nothing set means the default row, and with no default row the server setting ACCESS_SCOPE_MODE ('log' unless changed).
 */
class AccessSettings
{
    public const MODES = ['off', 'log', 'on'];

    private static ?array $rows = null;

    public static function reset(): void
    {
        self::$rows = null;
    }

    private static function rows(): array
    {
        if (self::$rows !== null) {
            return self::$rows;
        }
        try {
            return self::$rows = Schema::hasTable('access_settings') ? DB::table('access_settings')->pluck('value', 'key')->all() : [];
        } catch (\Throwable) {
            return self::$rows = [];
        }
    }

    /** off | log | on for an area ('general' and unknown areas follow the default). */
    public function mode(string $area = 'general'): string
    {
        $rows = self::rows();
        foreach (["scope_mode.{$area}", 'scope_mode'] as $key) {
            if (isset($rows[$key]) && in_array($rows[$key], self::MODES, true)) {
                return $rows[$key];
            }
        }
        $c = (string) config('access.scope_mode', 'log');

        return in_array($c, self::MODES, true) ? $c : 'log';
    }

    /** Every area's mode, and the default, for the settings screen. */
    public function all(): array
    {
        $out = ['default' => $this->mode('general'), 'areas' => []];
        foreach (Catalog::AREAS as $key => $label) {
            $out['areas'][] = ['key' => $key, 'label' => $label, 'mode' => $this->mode($key), 'own' => isset(self::rows()["scope_mode.{$key}"])];
        }

        return $out;
    }

    /** Set an area's mode; null or 'default' removes the area's own choice so it follows the default again. */
    public function set(string $area, ?string $mode, ?int $by = null): void
    {
        $key = $area === 'default' ? 'scope_mode' : "scope_mode.{$area}";
        if ($mode === null || $mode === 'default') {
            DB::table('access_settings')->where('key', $key)->delete();
        } else {
            DB::table('access_settings')->updateOrInsert(['key' => $key], ['value' => $mode, 'updated_by' => $by, 'updated_at' => now(), 'created_at' => now()]);
        }
        self::reset();
    }
}
