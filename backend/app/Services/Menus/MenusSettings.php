<?php

namespace App\Services\Menus;

use App\Services\Books\BooksException;
use App\Services\Books\TradingAccounts;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** Settings → Menus: one row. Works with the defaults until script 134 is run. */
final class MenusSettings
{
    public const DEFAULTS = [
        'sales_ledger_id' => null,       // the sales account dishes are booked under (it decides the tax)
        'category_id' => null,           // the category the hidden products behind dishes sit in
        'allergen_note' => 'Please tell us about any allergy before you order. Allergen information is given in good faith from our ingredients; our kitchen also handles nuts, milk, eggs, wheat and other allergens.',
        'receipt_footer' => '',          // a line printed at the foot of every receipt
    ];

    public static function ready(): bool
    {
        return Schema::hasTable('menus_settings');
    }

    /** @return array<string, mixed> */
    public static function all(): array
    {
        $saved = [];
        if (self::ready()) {
            $row = DB::table('menus_settings')->where('id', 1)->value('settings');
            $saved = $row ? (json_decode((string) $row, true) ?: []) : [];
        }

        return array_replace(self::DEFAULTS, array_intersect_key($saved, self::DEFAULTS));
    }

    /** @param array<string, mixed> $in @return array<string, mixed> */
    public static function save(array $in, ?int $by): array
    {
        if (! self::ready()) {
            throw new BooksException('Menus settings are not set up yet: run database script 134_menus_dishes.sql first.');
        }
        $cur = self::all();
        if (array_key_exists('sales_ledger_id', $in)) {
            $id = $in['sales_ledger_id'] ? (int) $in['sales_ledger_id'] : null;
            if ($id && ($problem = TradingAccounts::problem($id, 'sales'))) {
                throw new BooksException($problem);
            }
            $cur['sales_ledger_id'] = $id;
        }
        if (array_key_exists('category_id', $in)) {
            $id = $in['category_id'] ? (int) $in['category_id'] : null;
            if ($id && ! DB::table('categories')->where('id', $id)->exists()) {
                throw new BooksException('That category does not exist.');
            }
            $cur['category_id'] = $id;
        }
        foreach (['allergen_note' => 600, 'receipt_footer' => 200] as $key => $max) {
            if (array_key_exists($key, $in)) {
                $cur[$key] = mb_substr(trim((string) $in[$key]), 0, $max);
            }
        }
        $row = ['settings' => json_encode($cur), 'updated_by' => $by, 'updated_at' => now()];
        DB::table('menus_settings')->where('id', 1)->exists() ? DB::table('menus_settings')->where('id', 1)->update($row) : DB::table('menus_settings')->insert(['id' => 1, 'created_at' => now()] + $row);

        return $cur;
    }
}
