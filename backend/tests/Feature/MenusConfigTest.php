<?php

namespace Tests\Feature;

use App\Models\Menus\ModifierPolicy;
use App\Services\Books\BooksException;
use App\Services\Menus\FoodLedgers;
use App\Services\Menus\IngredientKinds;
use App\Services\Menus\MenusLists;
use App\Services\Menus\MenusSettings;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Menus, Configuration (script 193): the tips window, the packaging kind and account, the account for prepared food, and the lists the restaurant keeps. */
class MenusConfigTest extends TestCase
{
    use Concerns\CreatesIngredientWorld;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createIngredientWorld();
        Schema::create('menus_settings', function ($t) { $t->unsignedTinyInteger('id')->primary(); $t->json('settings')->nullable(); $t->unsignedBigInteger('updated_by')->nullable(); $t->timestamps(); });
        Schema::table('accounting_settings', function ($t) { $t->unsignedBigInteger('tips_payable_ledger_id')->nullable(); $t->unsignedBigInteger('default_sales_ledger_id')->nullable(); });
        $this->runSqlScripts('193_menus_config_foundation.sql');
    }

    private function fails(callable $fn, string $part): void
    {
        try {
            $fn();
        } catch (BooksException $e) {
            $this->assertStringContainsString($part, $e->getMessage());

            return;
        }
        $this->fail("Expected: {$part}");
    }

    private function raw(array $settings): void
    {
        DB::table('menus_settings')->updateOrInsert(['id' => 1], ['settings' => json_encode($settings), 'created_at' => now(), 'updated_at' => now()]);
    }

    // ------------------------------------------------------------ the tips window

    public function test_the_tips_window_is_checked_and_kept(): void
    {
        $this->fails(fn () => MenusSettings::save(['tips_window' => 'sometimes'], null), 'Choose when tips');
        $this->fails(fn () => MenusSettings::save(['tips_from' => '6pm'], null), 'hours and minutes');
        $this->fails(fn () => MenusSettings::save(['tips_window' => 'days', 'tips_days' => []], null), 'at least one day');
        $saved = MenusSettings::save(['tips_window' => 'days', 'tips_days' => [5, 1, 5, 9], 'tips_from' => '18:00', 'tips_to' => '23:30'], null);
        $this->assertSame(['days', [1, 5], '18:00', '23:30'], [$saved['tips_window'], $saved['tips_days'], $saved['tips_from'], $saved['tips_to']]);
    }

    public function test_tips_may_be_handed_over_by_the_window(): void
    {
        $monday = Carbon::parse('2026-10-19');   // a Monday
        $at = fn (string $day, string $time) => Carbon::parse("{$day} {$time}");
        $this->assertTrue(MenusSettings::tipsMayBeIssued($at('2026-10-19', '03:00')), 'anytime by default');
        MenusSettings::save(['tips_window' => 'never'], null);
        $this->assertFalse(MenusSettings::tipsMayBeIssued($at('2026-10-19', '19:00')), 'never: they are held');
        MenusSettings::save(['tips_window' => 'daily', 'tips_from' => '18:00', 'tips_to' => '23:00'], null);
        $this->assertTrue(MenusSettings::tipsMayBeIssued($at('2026-10-21', '19:00')));
        $this->assertFalse(MenusSettings::tipsMayBeIssued($at('2026-10-21', '12:00')));
        MenusSettings::save(['tips_window' => 'daily', 'tips_from' => '22:00', 'tips_to' => '02:00'], null);
        $this->assertTrue(MenusSettings::tipsMayBeIssued($at('2026-10-21', '01:00')), 'a window that runs over midnight');
        $this->assertFalse(MenusSettings::tipsMayBeIssued($at('2026-10-21', '12:00')));
        MenusSettings::save(['tips_window' => 'days', 'tips_days' => [1], 'tips_from' => '18:00', 'tips_to' => '23:00'], null);
        $this->assertTrue(MenusSettings::tipsMayBeIssued($at('2026-10-19', '19:00')), 'Monday evening');
        $this->assertFalse(MenusSettings::tipsMayBeIssued($at('2026-10-20', '19:00')), 'not Tuesday');
        $this->assertSame(1, $monday->isoWeekday());
    }

    public function test_tips_are_booked_to_the_menus_account_else_the_books_tips_payable(): void
    {
        $this->assertNull(MenusSettings::tipLedgerId());
        DB::table('accounting_settings')->where('id', 1)->update(['tips_payable_ledger_id' => $this->supplier]);
        $this->assertSame($this->supplier, MenusSettings::tipLedgerId(), 'the books\' own default');
        $this->raw(['tip_ledger_id' => $this->costOfSales]);
        $this->assertSame($this->costOfSales, MenusSettings::tipLedgerId(), 'the Menus account wins');
    }

    // ------------------------------------------------------------ packaging and prepared food

    public function test_the_packaging_kind_must_exist_and_only_one_is_kept(): void
    {
        $this->fails(fn () => MenusSettings::save(['packaging_kind_id' => 999], null), 'does not exist');
        app(IngredientKinds::class)->seedDefaults();
        $packaging = \App\Models\Menus\IngredientKind::where('code', 'packaging')->value('id');
        $supplies = \App\Models\Menus\IngredientKind::where('code', 'supplies')->value('id');
        $this->assertSame($packaging, MenusSettings::save(['packaging_kind_id' => $packaging], null)['packaging_kind_id']);
        $this->assertSame($supplies, MenusSettings::save(['packaging_kind_id' => $supplies], null)['packaging_kind_id'], 'choosing another replaces it');
        $this->assertNull(MenusSettings::save(['packaging_kind_id' => null], null)['packaging_kind_id']);
    }

    public function test_charged_packaging_is_booked_to_its_own_account_else_the_dish_sales_account_else_the_books_default(): void
    {
        $this->assertNull(MenusSettings::packagingSalesLedgerId());
        DB::table('accounting_settings')->where('id', 1)->update(['default_sales_ledger_id' => $this->inventory]);
        $this->assertSame($this->inventory, MenusSettings::packagingSalesLedgerId());
        $this->raw(['sales_ledger_id' => $this->costOfSales]);
        $this->assertSame($this->costOfSales, MenusSettings::packagingSalesLedgerId());
        $this->raw(['sales_ledger_id' => $this->costOfSales, 'packaging_sales_ledger_id' => $this->supplier]);
        $this->assertSame($this->supplier, MenusSettings::packagingSalesLedgerId());
    }

    public function test_prepared_food_is_carried_on_the_chosen_account_else_the_one_called_prepared_food_inventory(): void
    {
        $this->fails(fn () => FoodLedgers::prepared(), 'Prepared Food Inventory');
        $stock = (int) DB::table('ledger_groups')->where('name', 'Stock-in-hand')->value('id');
        $byName = DB::table('ledgers')->insertGetId(['name' => 'Prepared Food Inventory', 'group_id' => $stock]);
        $this->assertSame($byName, FoodLedgers::prepared());
        $this->raw(['prepared_food_ledger_id' => $this->inventory]);
        $this->assertSame($this->inventory, FoodLedgers::prepared(), 'the chosen account wins');
    }

    // ------------------------------------------------------------ the lists

    public function test_servings_and_audiences_are_the_restaurants_own_lists(): void
    {
        $lists = app(MenusLists::class);
        $this->assertSame([], $lists->all()['servings'], 'none is put in');
        $lists->save('servings', ['name' => 'Jumbo']);
        $kids = $lists->save('servings', ['name' => 'Kids']);
        $lists->save('audiences', ['name' => 'Adults']);
        $this->fails(fn () => $lists->save('servings', ['name' => 'jumbo']), 'already a serving called');
        $this->fails(fn () => $lists->save('audiences', ['name' => ' ']), 'Give the audience a name');
        $lists->save('servings', ['name' => 'Little ones', 'is_active' => false], $kids->id);
        $this->assertSame(['Jumbo', 'Little ones'], array_column($lists->all()['servings'], 'name'));
        $this->assertFalse($lists->all()['servings'][1]['is_active']);
        $lists->reorder('servings', [$kids->id, DB::table('menus_servings')->where('name', 'Jumbo')->value('id')]);
        $this->assertSame(['Little ones', 'Jumbo'], array_column($lists->all()['servings'], 'name'));
        $lists->delete('servings', $kids->id);
        $this->assertSame(['Jumbo'], array_column($lists->all()['servings'], 'name'));
    }

    public function test_one_modifier_policy_is_always_the_default(): void
    {
        $lists = app(MenusLists::class);
        $free = $lists->save('policies', ['name' => 'Free', 'kind' => 'free']);
        $this->assertTrue($free->is_default, 'the first one is the default');
        $fee = $lists->save('policies', ['name' => 'Removal fee 20', 'kind' => 'fixed', 'amount' => 20]);
        $this->assertFalse($fee->is_default);
        $pct = $lists->save('policies', ['name' => 'Removal fee 10%', 'kind' => 'percent', 'amount' => 10, 'is_default' => true]);
        $this->assertTrue($pct->is_default);
        $this->assertSame(1, ModifierPolicy::where('is_default', true)->count());
        $this->assertFalse(ModifierPolicy::find($free->id)->is_default, 'making another the default takes it from the old one');
        $this->fails(fn () => $lists->delete('policies', $pct->id), 'default policy');
        $this->fails(fn () => $lists->save('policies', ['name' => 'Removal fee 10%', 'kind' => 'percent', 'amount' => 10, 'is_active' => false], $pct->id), 'switched on');
        $this->fails(fn () => $lists->save('policies', ['name' => 'Removal fee 10%', 'kind' => 'percent', 'amount' => 10, 'is_default' => false], $pct->id), 'has to be the default');
        $lists->delete('policies', $fee->id);
        $this->assertSame(2, ModifierPolicy::count());
    }

    public function test_a_modifier_policy_prices_must_make_sense(): void
    {
        $lists = app(MenusLists::class);
        $this->fails(fn () => $lists->save('policies', ['name' => 'Odd', 'kind' => 'maybe']), 'free, a fixed fee or a percentage');
        $this->fails(fn () => $lists->save('policies', ['name' => 'Fee', 'kind' => 'fixed', 'amount' => 0]), 'Enter the fee');
        $this->fails(fn () => $lists->save('policies', ['name' => 'Cut', 'kind' => 'percent', 'amount' => 0]), 'percentage');
        $this->fails(fn () => $lists->save('policies', ['name' => 'Cut', 'kind' => 'percent', 'amount' => 150]), 'more than 100');
        $free = $lists->save('policies', ['name' => 'Free', 'kind' => 'free', 'amount' => 55]);
        $this->assertSame(0.0, (float) $free->amount, 'free carries no amount');
    }
}
