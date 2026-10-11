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
        'tip_ledger_id' => null,         // where tips are booked (usually money held for staff); empty = the till takes no tips
        'service_charge_ledger_id' => null,
        'qr_ordering' => true,           // guests may order from the table's QR code
        'qr_open_by_scan' => false,      // may a scan open an empty table? (off: staff seat the guests first)
        'custom_orders' => false,        // customers may ask for a made-to-order cake or a catering quote (off until switched on)
        'custom_deposit_pct' => 50,      // the share of a quote paid to confirm it
        'custom_quote_days' => 7,        // how long a quote can be accepted
        'custom_lead_hours' => 72,       // the least notice for a catering job
        'service_charge_pct' => 0,       // 0 = no service charge; otherwise added to dine-in orders (the cashier may waive it)
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
        foreach (['tip_ledger_id', 'service_charge_ledger_id'] as $key) {
            if (array_key_exists($key, $in)) {
                $id = $in[$key] ? (int) $in[$key] : null;
                if ($id && ! DB::table('ledgers')->where('id', $id)->exists()) {
                    throw new BooksException('That account does not exist.');
                }
                $cur[$key] = $id;
            }
        }
        foreach (['qr_ordering', 'qr_open_by_scan', 'custom_orders'] as $key) {
            if (array_key_exists($key, $in)) {
                $cur[$key] = (bool) $in[$key];
            }
        }
        foreach (['custom_deposit_pct' => [0, 100], 'custom_quote_days' => [1, 90], 'custom_lead_hours' => [0, 720]] as $key => [$lo, $hi]) {
            if (array_key_exists($key, $in)) {
                $n = round((float) $in[$key], 2);
                if ($n < $lo || $n > $hi) {
                    throw new BooksException("{$key} must be between {$lo} and {$hi}.");
                }
                $cur[$key] = $key === 'custom_deposit_pct' ? $n : (int) $n;
            }
        }
        if (array_key_exists('service_charge_pct', $in)) {
            $pct = round((float) $in['service_charge_pct'], 2);
            if ($pct < 0 || $pct > 30) {
                throw new BooksException('The service charge is between 0 and 30 percent.');
            }
            $cur['service_charge_pct'] = $pct;
        }
        if ((float) $cur['service_charge_pct'] > 0 && ! $cur['service_charge_ledger_id']) {
            throw new BooksException('Choose the account the service charge is booked to (it is managed in the books like VAT).');
        }
        $row = ['settings' => json_encode($cur), 'updated_by' => $by, 'updated_at' => now()];
        DB::table('menus_settings')->where('id', 1)->exists() ? DB::table('menus_settings')->where('id', 1)->update($row) : DB::table('menus_settings')->insert(['id' => 1, 'created_at' => now()] + $row);

        return $cur;
    }
}
