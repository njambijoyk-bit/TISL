<?php

namespace Tests\Feature\Concerns;

use App\Models\Books\Voucher;
use App\Models\Menus\Dish;
use App\Models\Menus\Ingredient;
use App\Models\Menus\IngredientItem;
use App\Models\Menus\StockBatch;
use App\Services\Books\VoucherService;
use App\Services\Menus\IngredientReceiving;
use App\Services\Menus\IngredientVoucherStock;
use App\Services\Menus\Ingredients;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Menus' own ingredient stock (scripts 181 to 183): units, the three food accounts, the books stood in for (what they are asked to post or cancel is kept in $posted and $cancelled),
 * and helpers to make ingredients, put batches on the shelf and write a dish with a recipe.
 */
trait CreatesIngredientWorld
{
    use CreatesFoodTables;

    protected array $posted = [];
    protected array $cancelled = [];
    protected int $inventory;
    protected int $costOfSales;
    protected int $supplier;

    protected function createIngredientWorld(): void
    {
        $this->createFoodTables();
        Schema::create('ledger_groups', function ($t) { $t->id(); $t->unsignedBigInteger('parent_id')->nullable(); $t->string('name'); $t->string('nature')->nullable(); $t->timestamps(); });
        Schema::create('ledgers', function ($t) { $t->id(); $t->string('name'); $t->unsignedBigInteger('group_id'); $t->boolean('is_active')->default(true); $t->timestamps(); $t->softDeletes(); });
        Schema::create('voucher_types', function ($t) { $t->id(); $t->string('base_type'); $t->string('stock_effect')->default('none'); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('vouchers', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_type_id')->nullable(); $t->string('voucher_number')->nullable(); $t->string('status')->default('posted'); $t->unsignedBigInteger('location_id')->nullable(); $t->unsignedBigInteger('party_ledger_id')->nullable(); $t->date('date')->nullable(); $t->boolean('moves_stock')->default(false); $t->decimal('subtotal', 18, 2)->default(0); $t->decimal('tax_total', 18, 2)->default(0); $t->decimal('total_amount', 18, 2)->default(0); $t->json('meta')->nullable(); $t->timestamps(); });
        Schema::create('voucher_items', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_id'); $t->unsignedInteger('line_no')->default(1); $t->decimal('tax_amount', 18, 2)->default(0); $t->string('item_type')->default('custom'); $t->boolean('is_header')->default(false); $t->unsignedBigInteger('dish_id')->nullable(); $t->decimal('quantity', 18, 4)->default(1); $t->json('menu_uses')->nullable();
            $t->unsignedBigInteger('ingredient_item_id')->nullable(); $t->string('description')->nullable(); $t->string('variant_label')->nullable(); $t->string('sku')->nullable(); $t->string('unit_code', 12)->nullable(); $t->decimal('unit_factor', 18, 6)->default(1);
            $t->decimal('base_quantity', 18, 4)->default(0); $t->decimal('rate', 18, 4)->default(0); $t->decimal('amount', 18, 2)->default(0); $t->string('batch_no')->nullable(); $t->date('expiry_date')->nullable(); });
        Schema::create('accounting_settings', function ($t) { $t->id(); $t->unsignedBigInteger('opening_balance_ledger_id')->nullable(); $t->integer('edit_window_days')->default(30); $t->timestamps(); });
        Schema::create('currencies', function ($t) { $t->id(); $t->string('code', 8); $t->boolean('is_base')->default(false); $t->timestamps(); });
        DB::table('currencies')->insert(['id' => 1, 'code' => 'KES', 'is_base' => true]);
        DB::table('accounting_settings')->insert(['id' => 1, 'edit_window_days' => 30]);
        DB::table('voucher_types')->insert([['id' => 1, 'base_type' => 'purchase', 'stock_effect' => 'in'], ['id' => 2, 'base_type' => 'journal', 'stock_effect' => 'none'], ['id' => 3, 'base_type' => 'sales', 'stock_effect' => 'out'], ['id' => 4, 'base_type' => 'sales_order', 'stock_effect' => 'none'],
            ['id' => 7, 'base_type' => 'opening_stock', 'stock_effect' => 'in'], ['id' => 8, 'base_type' => 'receipt_note', 'stock_effect' => 'in']]);
        $stock = DB::table('ledger_groups')->insertGetId(['name' => 'Stock-in-hand']);
        $creditors = DB::table('ledger_groups')->insertGetId(['name' => 'Sundry Creditors']);
        $direct = DB::table('ledger_groups')->insertGetId(['name' => 'Direct Expenses']);
        $this->inventory = DB::table('ledgers')->insertGetId(['name' => 'Food Ingredients Inventory', 'group_id' => $stock]);
        $this->costOfSales = DB::table('ledgers')->insertGetId(['name' => 'Food Cost of Sales', 'group_id' => $direct]);
        DB::table('ledgers')->insert(['name' => 'Food Waste Expense', 'group_id' => $direct]);
        $this->supplier = DB::table('ledgers')->insertGetId(['name' => 'Naivas Wholesale', 'group_id' => $creditors]);

        $books = $this->createMock(VoucherService::class);
        // the books stood in for: a voucher is saved with its lines, and the hooks the real ones call for ingredient lines are called here too
        $books->method('create')->willReturnCallback(function (array $d, $by = null) {
            $this->posted[] = $d;
            $sub = collect($d['lines'] ?? [])->sum(fn ($l) => round($l['quantity'] * $l['rate'], 2)) ?: collect($d['entries'] ?? [])->where('side', 'D')->sum('amount');
            $moves = in_array((int) $d['voucher_type_id'], [1, 7, 8], true);
            $id = DB::table('vouchers')->insertGetId(['voucher_type_id' => $d['voucher_type_id'], 'voucher_number' => 'V-'.count($this->posted), 'location_id' => $d['location_id'] ?? null, 'party_ledger_id' => $d['party_ledger_id'] ?? null, 'date' => $d['date'] ?? '2026-10-16', 'moves_stock' => $moves,
                'subtotal' => $sub, 'tax_total' => 0, 'total_amount' => $sub, 'meta' => isset($d['meta']) ? json_encode($d['meta']) : null, 'created_at' => now(), 'updated_at' => now()]);
            foreach (array_values($d['lines'] ?? []) as $i => $l) {
                $row = ['voucher_id' => $id, 'line_no' => $i + 1, 'tax_amount' => 0, 'quantity' => $l['quantity'], 'rate' => $l['rate'], 'amount' => round($l['quantity'] * $l['rate'], 2), 'description' => $l['description'] ?? null];
                if (($l['type'] ?? '') === 'ingredient') {
                    $item = IngredientItem::with('ingredient.baseUnit', 'ingredient.altUnit')->findOrFail($l['ingredient_item_id']);
                    $factor = $item->toBase($l['unit'] ?? 'base', 1.0);
                    $row = ['item_type' => 'ingredient', 'ingredient_item_id' => $item->id, 'variant_label' => $item->name, 'description' => $item->ingredient->name, 'unit_factor' => $factor, 'base_quantity' => round($l['quantity'] * $factor, 4),
                        'batch_no' => $l['batch_no'] ?? null, 'expiry_date' => $l['expiry_date'] ?? null, 'unit_code' => $l['unit'] ?? 'base'] + $row;
                }
                DB::table('voucher_items')->insert($row);
            }
            $voucher = Voucher::find($id);
            app(IngredientVoucherStock::class)->apply($voucher, $by);

            return $voucher;
        });
        $books->method('cancel')->willReturnCallback(function (Voucher $v, ?string $reason = null, $by = null) {
            $this->cancelled[] = [$v->id, $reason];
            if (! empty($v->meta['menus_receipt_id'])) {
                app(IngredientReceiving::class)->beforeVoucherCancelled($v, null);
            }
            app(IngredientVoucherStock::class)->undo($v, $by);
            $v->update(['status' => 'cancelled']);

            return $v;
        });
        $this->app->instance(VoucherService::class, $books);
    }

    /** A saved voucher with dish lines: ['dish' => Dish, 'qty' => n, 'uses' => [...]] each. Type 3 is a sales invoice (moves stock out), 4 a sales order (does not). */
    protected function sale(array $lines, bool $moves = true, int $type = 3, int $location = 1): Voucher
    {
        $id = DB::table('vouchers')->insertGetId(['voucher_type_id' => $type, 'voucher_number' => 'INV-'.(DB::table('vouchers')->count() + 1), 'status' => 'posted', 'location_id' => $location,
            'date' => '2026-10-16', 'moves_stock' => $moves, 'created_at' => now(), 'updated_at' => now()]);
        foreach ($lines as $i => $l) {
            DB::table('voucher_items')->insert(['voucher_id' => $id, 'line_no' => $i + 1, 'item_type' => 'dish', 'dish_id' => $l['dish']->id, 'quantity' => $l['qty'], 'menu_uses' => isset($l['uses']) ? json_encode($l['uses']) : null]);
        }

        return Voucher::find($id);
    }
}
