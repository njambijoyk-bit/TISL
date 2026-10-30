<?php

namespace Tests\Feature;

use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use App\Models\Inventory\InventoryCategory;
use App\Models\User;
use App\Services\Books\ChartStarterService;
use App\Services\Books\Engine\LedgerBalances;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * A ledger made under Fixed Assets is also an asset type in Assets (under "Fixed Assets"), in one go: if Assets refuses, the ledger is not made either.
 * System ledgers keep their names. An asset type can carry a least value (floor) for its new assets.
 */
class FixedAssetLedgersTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;
    use Concerns\StandsInForAccess;

    private int $fixed;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
        Schema::dropIfExists('inventory_categories');
        Schema::create('inventory_categories', function ($t) {
            $t->id(); $t->unsignedBigInteger('parent_id')->nullable(); $t->string('name'); $t->string('slug')->nullable(); $t->text('description')->nullable(); $t->string('icon')->nullable();
            $t->integer('sort_order')->default(0); $t->boolean('is_active')->default(true); $t->unsignedBigInteger('created_by')->nullable();
            $t->unsignedBigInteger('asset_ledger_id')->nullable(); $t->unsignedBigInteger('accumulated_ledger_id')->nullable(); $t->unsignedBigInteger('expense_ledger_id')->nullable();
            $t->string('default_method', 20)->default('none'); $t->integer('default_life_years')->nullable(); $t->decimal('default_rate', 7, 4)->nullable();
            $t->string('default_floor_type', 10)->nullable(); $t->decimal('default_floor_value', 18, 4)->nullable();
            $t->timestamps();
        });
        $this->fixed = (int) LedgerGroup::create(['name' => 'Fixed Assets', 'nature' => 'asset', 'is_primary' => true, 'is_system' => true, 'sort_order' => 30, 'behaviour' => 'standard'])->id;
        $u = new User();
        $u->id = 77;
        $this->grant($u, ['books.view', 'books.post', 'inventory.manage']);
        Sanctum::actingAs($u, ['*']);
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('inventory_categories');
        LedgerBalances::forget();
        parent::tearDown();
    }

    public function test_a_ledger_under_fixed_assets_becomes_an_asset_type_with_its_depreciation_ledgers(): void
    {
        $r = $this->postJson('/api/admin/books/ledgers', ['name' => 'Computers', 'group_id' => $this->fixed])->assertCreated()->assertJsonPath('data.asset_type.name', 'Computers');
        $ledger = (int) $r->json('data.id');
        $cat = InventoryCategory::where('name', 'Computers')->first();
        $this->assertSame($ledger, (int) $cat->asset_ledger_id);
        $parent = InventoryCategory::find($cat->parent_id);
        $this->assertSame('Fixed Assets', $parent->name, 'under the asset type "Fixed Assets"');
        $acc = Ledger::find($cat->accumulated_ledger_id);
        $this->assertSame('Accumulated Depreciation – Computers', $acc->name);
        $this->assertSame($this->fixed, (int) $acc->group_id, 'no Accumulated Depreciation group in this chart: it sits under Fixed Assets');
        $this->assertSame('C', $acc->opening_side);
        $exp = Ledger::find($cat->expense_ledger_id);
        $this->assertSame('Depreciation – Computers', $exp->name);
        $this->assertSame(8, (int) $exp->group_id, 'Indirect Expenses');
        $this->assertSame(0, InventoryCategory::where('name', 'Accumulated Depreciation – Computers')->count(), 'the accumulated depreciation ledger is not an asset type');

        $this->postJson('/api/admin/books/ledgers', ['name' => 'Vehicles', 'group_id' => $this->fixed])->assertCreated();
        $this->assertSame(1, InventoryCategory::where('name', 'Fixed Assets')->count(), 'one parent type for all of them');
    }

    public function test_if_assets_refuses_the_ledger_is_not_saved_either(): void
    {
        InventoryCategory::create(['name' => 'Vans', 'slug' => 'vans', 'asset_ledger_id' => 1]);   // a type that posts to another ledger
        $before = DB::table('ledgers')->count();
        $this->postJson('/api/admin/books/ledgers', ['name' => 'Vans', 'group_id' => $this->fixed])->assertStatus(422)->assertJsonValidationErrors('name');
        $this->assertSame($before, DB::table('ledgers')->count(), 'neither the ledger nor its depreciation ledgers were made');
        $this->assertSame(0, Ledger::where('name', 'Vans')->count());
        $this->assertSame(1, (int) InventoryCategory::where('name', 'Vans')->value('asset_ledger_id'), 'the type is untouched');
    }

    public function test_a_type_of_that_name_with_no_ledger_is_linked_not_made_twice(): void
    {
        $c = InventoryCategory::create(['name' => 'Furniture', 'slug' => 'furniture', 'default_method' => 'straight_line', 'default_life_years' => 8]);
        $id = (int) $this->postJson('/api/admin/books/ledgers', ['name' => 'Furniture', 'group_id' => $this->fixed])->assertCreated()->json('data.id');
        $this->assertSame(1, InventoryCategory::where('name', 'Furniture')->count());
        $this->assertSame($id, (int) $c->fresh()->asset_ledger_id);
        $this->assertSame('straight_line', $c->fresh()->default_method, 'its own settings are kept');
    }

    public function test_land_is_a_type_that_does_not_depreciate_and_other_groups_make_no_type(): void
    {
        $this->postJson('/api/admin/books/ledgers', ['name' => 'Land', 'group_id' => $this->fixed])->assertCreated();
        $land = InventoryCategory::where('name', 'Land')->first();
        $this->assertSame('none', $land->default_method);
        $this->assertNull($land->accumulated_ledger_id);
        $this->assertSame(0, Ledger::where('name', 'like', '%Depreciation%Land')->count());

        $this->postJson('/api/admin/books/ledgers', ['name' => 'Petty cash box', 'group_id' => 3])->assertCreated()->assertJsonPath('data.asset_type', null);
        $cwip = LedgerGroup::create(['name' => 'Capital Work in Progress', 'parent_id' => $this->fixed, 'nature' => 'asset', 'sort_order' => 40, 'behaviour' => 'standard']);
        $this->postJson('/api/admin/books/ledgers', ['name' => 'New wing', 'group_id' => $cwip->id])->assertCreated();
        $this->assertSame(0, InventoryCategory::whereIn('name', ['Petty cash box', 'New wing'])->count(), 'current assets and work in progress are not asset types');
    }

    public function test_renaming_or_moving_a_ledger_keeps_its_asset_type_in_step(): void
    {
        $id = (int) $this->postJson('/api/admin/books/ledgers', ['name' => 'Laptops', 'group_id' => $this->fixed])->json('data.id');
        $this->putJson("/api/admin/books/ledgers/{$id}", ['name' => 'Laptops & Tablets'])->assertOk();
        $this->assertSame('Laptops & Tablets', InventoryCategory::where('asset_ledger_id', $id)->value('name'));

        $other = Ledger::create(['group_id' => 3, 'name' => 'Generator', 'opening_balance' => 0, 'opening_side' => 'D', 'is_active' => true]);
        $this->putJson("/api/admin/books/ledgers/{$other->id}", ['group_id' => $this->fixed])->assertOk();
        $this->assertSame('Generator', InventoryCategory::where('asset_ledger_id', $other->id)->value('name'), 'moved under Fixed Assets: now an asset type');
    }

    public function test_a_system_ledger_cannot_be_renamed(): void
    {
        DB::table('ledgers')->where('id', 12)->update(['is_system' => true]);
        $this->putJson('/api/admin/books/ledgers/12', ['name' => 'Bank fees'])->assertStatus(422)->assertJsonValidationErrors('name');
        $this->assertSame('Bank charges', Ledger::find(12)->name);
        $this->putJson('/api/admin/books/ledgers/12', ['name' => 'Bank charges', 'notes' => 'kept'])->assertOk();
        $this->putJson('/api/admin/books/ledgers/6', ['name' => 'Office rent'])->assertOk();   // not a system ledger
        $this->assertSame('Office rent', Ledger::find(6)->name);
    }

    public function test_the_assets_starter_pack_links_each_class_and_reuses_its_depreciation_ledgers(): void
    {
        $r = app(ChartStarterService::class)->apply(['assets'], null);
        $this->assertContains('Computers & IT Equipment', $r['asset_types']);
        $this->assertNotContains('Accumulated Depreciation – Buildings', $r['asset_types']);
        $this->assertNotContains('Work in Progress – Buildings', $r['asset_types']);
        $cat = InventoryCategory::where('name', 'Computers & IT Equipment')->first();
        $this->assertSame('Accumulated Depreciation – Computers & IT Equipment', Ledger::find($cat->accumulated_ledger_id)->name);
        $this->assertSame(1, Ledger::where('name', 'like', 'Accumulated Depreciation _ Computers & IT Equipment')->count(), 'the pack\'s own ledger, not a second one');
        $this->assertSame(1, Ledger::where('name', 'like', 'Depreciation _ Computers & IT Equipment')->count());
        $lease = InventoryCategory::where('name', 'Leasehold Improvements')->first();
        $this->assertSame(LedgerGroup::where('name', 'Accumulated Depreciation')->value('id'), Ledger::find($lease->accumulated_ledger_id)->group_id, 'made in the Accumulated Depreciation group');
        $this->assertNull(InventoryCategory::where('name', 'Land')->value('accumulated_ledger_id'));
        $names = DB::table('ledgers')->pluck('name');
        $this->assertSame($names->count(), $names->unique()->count());
    }

    public function test_an_asset_type_can_carry_a_floor_as_an_amount_or_a_percent_of_cost(): void
    {
        $id = $this->postJson('/api/admin/inventory/categories', ['name' => 'Sofas', 'default_floor_type' => 'percent', 'default_floor_value' => 10])->assertCreated()->json('id');
        $c = InventoryCategory::find($id);
        $this->assertSame(5000.0, $c->floorFor(50000));
        $this->postJson('/api/admin/inventory/categories', ['name' => 'Bad', 'default_floor_type' => 'percent', 'default_floor_value' => 120])->assertStatus(422);
        $this->putJson("/api/admin/inventory/categories/{$id}", ['default_floor_type' => 'amount', 'default_floor_value' => 2000])->assertOk();
        $c->refresh();
        $this->assertSame(2000.0, $c->floorFor(50000));
        $this->assertSame(1500.0, $c->floorFor(1500), 'never above the cost');
        $this->putJson("/api/admin/inventory/categories/{$id}", ['default_floor_type' => null])->assertOk();
        $this->assertNull($c->fresh()->floorFor(50000));
    }
}
