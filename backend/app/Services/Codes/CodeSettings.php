<?php

namespace App\Services\Codes;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** The company's choices for codes (Settings → Codes): what internal codes look like and the defaults for labels. One row; works with the defaults until script 119 is run. */
final class CodeSettings
{
    public const DEFAULTS = [
        'internal_prefix' => '29',          // internal retail codes are EAN-13s starting with 20-29 (the range GS1 keeps for stores' own use)
        'kinds' => ['variant' => 'auto', 'pack' => 'auto', 'asset' => 'code128', 'batch' => 'code128'],   // auto = a real GTIN keeps its retail code, anything else is Code 128
        'label' => ['name' => true, 'sku' => true, 'price' => false, 'code_text' => true, 'batch' => true, 'size' => 'a4-24'],
    ];

    public static function ready(): bool
    {
        return Schema::hasTable('code_settings');
    }

    /** @return array<string, mixed> */
    public static function all(): array
    {
        $saved = [];
        if (self::ready()) {
            $row = DB::table('code_settings')->where('id', 1)->value('settings');
            $saved = $row ? (json_decode((string) $row, true) ?: []) : [];
        }

        return array_replace_recursive(self::DEFAULTS, $saved);
    }

    /** @param array<string, mixed> $in @return array<string, mixed> */
    public static function save(array $in, ?int $by): array
    {
        if (! self::ready()) {
            throw new CodeException('Codes are not set up yet: run database script 119_codes.sql first.');
        }
        $cur = self::all();
        if (isset($in['internal_prefix'])) {
            if (! preg_match('/^2[0-9]$/', (string) $in['internal_prefix'])) {
                throw new CodeException('An internal code prefix is two digits from 20 to 29.');
            }
            $cur['internal_prefix'] = (string) $in['internal_prefix'];
        }
        foreach ((array) ($in['kinds'] ?? []) as $type => $kind) {
            if (! array_key_exists($type, self::DEFAULTS['kinds']) || ($kind !== 'auto' && ! isset(CodeFactory::KINDS[$kind]))) {
                throw new CodeException("\"{$kind}\" is not a kind of code we can make for {$type}.");
            }
            $cur['kinds'][$type] = $kind;
        }
        foreach ((array) ($in['label'] ?? []) as $k => $v) {
            if (! array_key_exists($k, self::DEFAULTS['label'])) {
                continue;
            }
            $cur['label'][$k] = $k === 'size' ? (string) $v : (bool) $v;
        }
        $json = json_encode($cur);
        $exists = DB::table('code_settings')->where('id', 1)->exists();
        $row = ['settings' => $json, 'updated_by' => $by, 'updated_at' => now()];
        $exists ? DB::table('code_settings')->where('id', 1)->update($row) : DB::table('code_settings')->insert(['id' => 1, 'created_at' => now()] + $row);

        return $cur;
    }
}
