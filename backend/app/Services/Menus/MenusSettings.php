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
        'tip_ledger_id' => null,         // where tips are booked (money held for staff); empty = the books' own Tips Payable account
        'service_charge_ledger_id' => null,
        'modifier_fee_ledger_id' => null, // where a fee kept apart from the dish is booked (empty: the account the dish sales go to)
        'modifier_fees_vatable' => true, // a fee for leaving something out or adding extra is part of the dish's price and carries the dish's own VAT; off: it is kept apart, without VAT
        'sell_through_sides' => false,   // a sold dish takes its stock through its side (the recipe the side is made from) instead of the dish's own recipe; off until it has been tested
        'qr_ordering' => true,           // guests may order from the table's QR code
        'qr_open_by_scan' => false,      // may a scan open an empty table? (off: staff seat the guests first)
        'custom_orders' => false,        // customers may ask for a made-to-order cake or a catering quote (off until switched on)
        'custom_deposit_pct' => 50,      // the share of a quote paid to confirm it
        'custom_quote_days' => 7,        // how long a quote can be accepted
        'custom_lead_hours' => 72,       // the least notice for a catering job
        'chef_lead_hours' => 48,         // the least notice for a private chef
        'rota_max_week_hours' => 48,     // the rota warns when a chef is given more than this in a week
        'rota_swaps_need_approval' => true,   // a swap the colleague agreed to still waits for a manager
        'rota_ahead_weeks' => 2,         // patterns plan this many weeks ahead as drafts (daily)
        'rota_overtime_source' => 'attendance', // where payroll takes a chef's overtime from: 'attendance' (the company's working day) or 'rota' (hours beyond the shifts rostered)
        'rota_overtime_grace' => 15,     // minutes beyond the rostered hours before a day counts as overtime (rota source)
        'rota_claims_need_approval' => true, // a claim on an open shift waits for a manager (off: the first chef who is free gets it)
        'rota_clock_from_rota' => true,  // chefs may clock in and out from the rota page (the same Attendance sign-in)
        'rota_clock_early' => 30,        // minutes before a shift starts that clocking in opens
        'rota_premium_source' => 'off',  // 'payroll': shift premiums are added to a chef's payslip as an earning; 'off': they are only shown
        'rota_overtime_needs_approval' => false, // chefs' overtime waits for a manager before payroll pays it (and payroll can not be approved while any is waiting)
        'rota_clock_location' => 'off',  // clocking in by place: 'off', 'warn' (recorded, allowed) or 'require' (refused away from the branch)
        'rota_clock_radius' => 150,      // metres from the branch that count as there (a branch's own radius overrides)
        'rota_clock_accuracy' => 200,    // a position less accurate than this many metres is not trusted
        'rota_shift_min_share' => 50,    // per-shift pay: a shift counts as worked when at least this share (%) of its rostered time was signed in
        'rota_overtime_staff' => false,  // overtime approval also covers other staff with attendance (approved by whoever can mark their attendance)
        'rota_clock_qr' => 'off',        // a code shown at the door proves the chef is there: 'rotating' (changes every few minutes, shown on a screen), 'fixed' (printed) or 'off'
        'rota_clock_qr_minutes' => 2,    // how long a rotating door code lasts
        'rota_clock_wifi' => false,      // clocking in from the branch's own Wi-Fi (its public internet address) proves the chef is there
        'plans_enabled' => false,        // customers may subscribe to meal plans online (off until switched on)
        'plans_bill_ahead_days' => 3,    // a week is billed this many days before it starts
        'rota_no_show_alerts' => true,   // managers are told when a rostered chef has not signed in
        'rota_min_rest_hours' => 10,     // ...and when the rest between one day's work and the next is shorter than this
        'prepared_food_ledger_id' => null,      // where cooked food waiting to be sold is carried (empty: the account called Prepared Food Inventory)
        'tips_window' => 'anytime',             // when tips may be handed over: anytime | daily (between two times) | days (on chosen days between two times) | never (they are held)
        'tips_from' => '00:00',                 // the window opens at this time (HH:MM)
        'tips_to' => '23:59',                   // and closes at this one; a window that closes before it opens runs over midnight
        'tips_days' => [1, 2, 3, 4, 5, 6, 7],   // the days of the week for the days window (1 Monday to 7 Sunday)
        'packaging_kind_id' => null,            // the kind of ingredient that is takeaway packaging (one at a time)
        'packaging_sales_ledger_id' => null,    // where charged packaging is booked (empty: the sales account for dishes, else the books' default sales account)
        'currency_id' => null,                  // the currency the kitchen's vouchers are written in (empty: the system's base currency)
        'purchase_ledger_id' => null,           // the purchase account ingredients are bought under when they have none of their own (it decides the VAT; empty: the books' default purchase account)
        'ingredient_stock_ledger_id' => null,   // where ingredient stock is carried (empty: the account called Food Ingredients Inventory)
        'food_cost_ledger_id' => null,          // cost of the ingredients a dish used (empty: Food Cost of Sales)
        'food_waste_ledger_id' => null,         // ingredients thrown away (empty: Food Waste Expense)
        'service_charge_pct' => 0,       // 0 = no service charge; otherwise added to dine-in orders (the cashier may waive it)
    ];

    /** Where tips are booked: the Menus account, else the books' own Tips Payable. */
    public static function tipLedgerId(): ?int
    {
        $own = self::all()['tip_ledger_id'] ?? null;

        return $own ? (int) $own : self::booksLedger('tips_payable_ledger_id');
    }

    /** Where a fee for leaving something out or adding extra is booked when it is kept apart from the dish: its own account, else the sales account for dishes. */
    public static function modifierFeeLedgerId(): ?int
    {
        $s = self::all();

        return (int) ($s['modifier_fee_ledger_id'] ?: $s['sales_ledger_id']) ?: null;
    }

    /** One of the books' default accounts, or null when the books do not hold it (yet). */
    private static function booksLedger(string $column): ?int
    {
        if (! \Illuminate\Support\Facades\Schema::hasColumn('accounting_settings', $column)) {
            return null;
        }

        return \App\Models\Books\AccountingSetting::current()->{$column} ?: null;
    }

    /** Where charged packaging is booked: its own account, else the sales account for dishes, else the books' default sales account. */
    public static function packagingSalesLedgerId(): ?int
    {
        $s = self::all();

        return (int) ($s['packaging_sales_ledger_id'] ?: $s['sales_ledger_id'] ?: self::booksLedger('default_sales_ledger_id')) ?: null;
    }

    /** May tips be handed over at this moment, by the window in the settings? */
    public static function tipsMayBeIssued(?\Carbon\Carbon $at = null): bool
    {
        $s = self::all();
        $at ??= now();
        $mode = $s['tips_window'];
        if ($mode === 'never') {
            return false;
        }
        if ($mode === 'anytime') {
            return true;
        }
        if ($mode === 'days' && ! in_array((int) $at->isoWeekday(), array_map('intval', (array) $s['tips_days']), true)) {
            return false;
        }
        $now = $at->format('H:i');

        return $s['tips_from'] <= $s['tips_to'] ? ($now >= $s['tips_from'] && $now <= $s['tips_to']) : ($now >= $s['tips_from'] || $now <= $s['tips_to']);
    }

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
        if (array_key_exists('currency_id', $in)) {
            $id = $in['currency_id'] ? (int) $in['currency_id'] : null;
            if ($id && ! \App\Models\Currency::whereKey($id)->where('is_active', true)->exists()) {
                throw new BooksException('That currency is not available. Choose an active one, or leave it empty for the base currency.');
            }
            $cur['currency_id'] = $id;
        }
        if (array_key_exists('tips_window', $in)) {
            $mode = (string) $in['tips_window'];
            if (! in_array($mode, ['anytime', 'daily', 'days', 'never'], true)) {
                throw new BooksException('Choose when tips may be handed over: any time, every day between two times, on chosen days, or never.');
            }
            $cur['tips_window'] = $mode;
        }
        foreach (['tips_from', 'tips_to'] as $key) {
            if (array_key_exists($key, $in)) {
                if (! preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', (string) $in[$key])) {
                    throw new BooksException('Write the time as hours and minutes, like 18:00.');
                }
                $cur[$key] = (string) $in[$key];
            }
        }
        if (array_key_exists('tips_days', $in)) {
            $days = array_values(array_unique(array_filter(array_map('intval', (array) $in['tips_days']), fn ($d) => $d >= 1 && $d <= 7)));
            sort($days);
            $cur['tips_days'] = $days;
        }
        if (($cur['tips_window'] ?? 'anytime') === 'days' && ! ($cur['tips_days'] ?? [])) {
            throw new BooksException('Choose at least one day tips may be handed over.');
        }
        if (array_key_exists('packaging_kind_id', $in)) {
            $id = $in['packaging_kind_id'] ? (int) $in['packaging_kind_id'] : null;
            if ($id && ! \App\Models\Menus\IngredientKind::whereKey($id)->exists()) {
                throw new BooksException('That kind of ingredient does not exist.');
            }
            $cur['packaging_kind_id'] = $id;
        }
        if (array_key_exists('packaging_sales_ledger_id', $in)) {
            $id = $in['packaging_sales_ledger_id'] ? (int) $in['packaging_sales_ledger_id'] : null;
            if ($id && ($problem = TradingAccounts::problem($id, 'sales'))) {
                throw new BooksException($problem);
            }
            $cur['packaging_sales_ledger_id'] = $id;
        }
        if (array_key_exists('purchase_ledger_id', $in)) {
            $id = $in['purchase_ledger_id'] ? (int) $in['purchase_ledger_id'] : null;
            if ($id && ($problem = TradingAccounts::problem($id, 'purchase'))) {
                throw new BooksException($problem);
            }
            $cur['purchase_ledger_id'] = $id;
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
        foreach (['modifier_fee_ledger_id', 'tip_ledger_id', 'service_charge_ledger_id', 'ingredient_stock_ledger_id', 'food_cost_ledger_id', 'food_waste_ledger_id', 'prepared_food_ledger_id'] as $key) {
            if (array_key_exists($key, $in)) {
                $id = $in[$key] ? (int) $in[$key] : null;
                if ($id && ! DB::table('ledgers')->where('id', $id)->exists()) {
                    throw new BooksException('That account does not exist.');
                }
                $cur[$key] = $id;
            }
        }
        if (! empty($in['sell_through_sides']) && ! SidesFromDishes::installed()) {
            throw new BooksException('Run database scripts 200_menus_sides.sql and 201_menus_sides_from_dishes.sql first: selling through sides needs them.');
        }
        foreach (['modifier_fees_vatable', 'sell_through_sides', 'qr_ordering', 'qr_open_by_scan', 'custom_orders', 'rota_swaps_need_approval', 'rota_no_show_alerts', 'rota_claims_need_approval', 'rota_clock_from_rota', 'rota_overtime_needs_approval', 'rota_overtime_staff', 'rota_clock_wifi', 'plans_enabled'] as $key) {
            if (array_key_exists($key, $in)) {
                $cur[$key] = (bool) $in[$key];
            }
        }
        foreach (['custom_deposit_pct' => [0, 100], 'custom_quote_days' => [1, 90], 'custom_lead_hours' => [0, 720], 'chef_lead_hours' => [0, 720], 'rota_max_week_hours' => [1, 120], 'rota_min_rest_hours' => [0, 24], 'rota_ahead_weeks' => [0, 8], 'rota_overtime_grace' => [0, 120], 'rota_clock_early' => [0, 240], 'rota_clock_radius' => [20, 5000], 'rota_clock_accuracy' => [10, 2000], 'rota_shift_min_share' => [1, 100], 'rota_clock_qr_minutes' => [1, 30], 'plans_bill_ahead_days' => [0, 14]] as $key => [$lo, $hi]) {
            if (array_key_exists($key, $in)) {
                $n = round((float) $in[$key], 2);
                if ($n < $lo || $n > $hi) {
                    throw new BooksException("{$key} must be between {$lo} and {$hi}.");
                }
                $cur[$key] = $key === 'custom_deposit_pct' ? $n : (int) $n;
            }
        }
        foreach (['rota_premium_source' => ['off', 'payroll'], 'rota_clock_location' => ['off', 'warn', 'require'], 'rota_clock_qr' => ['off', 'rotating', 'fixed']] as $key => $allowed) {
            if (array_key_exists($key, $in)) {
                if (! in_array($in[$key], $allowed, true)) {
                    throw new BooksException("{$key} must be one of: ".implode(', ', $allowed).'.');
                }
                $cur[$key] = $in[$key];
            }
        }
        if (array_key_exists('rota_overtime_source', $in)) {
            if (! in_array($in['rota_overtime_source'], ['attendance', 'rota'], true)) {
                throw new BooksException('Overtime comes from attendance or from the rota.');
            }
            $cur['rota_overtime_source'] = $in['rota_overtime_source'];
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
