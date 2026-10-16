<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\BooksMasterController;
use App\Models\Books\VoucherType;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Books: the letter that Shift+V then picks a voucher type with (script 180): one letter, one type, capital letters, clearable. */
class VoucherTypeShortcutsTest extends TestCase
{
    use Concerns\RunsSqlScripts;

    protected function setUp(): void
    {
        parent::setUp();
        Schema::create('voucher_types', function ($t) {
            $t->id(); $t->string('code')->nullable(); $t->string('name'); $t->string('base_type'); $t->boolean('posts_accounts')->default(true); $t->string('stock_effect')->default('none');
            $t->boolean('has_items')->default(false); $t->string('party_kind')->nullable(); $t->unsignedBigInteger('default_ledger_id')->nullable(); $t->boolean('is_system')->default(false); $t->boolean('is_active')->default(true); $t->timestamps();
        });
        $this->runSqlScripts('180_voucher_type_shortcuts.sql');
        VoucherType::create(['code' => 'SI', 'name' => 'Sales', 'base_type' => 'sales']);
        VoucherType::create(['code' => 'PI', 'name' => 'Purchase', 'base_type' => 'purchase']);
    }

    private function set(string $name, $shortcut)
    {
        return app(BooksMasterController::class)->updateType(Request::create('/x', 'PUT', ['shortcut' => $shortcut]), VoucherType::where('name', $name)->value('id'));
    }

    public function test_a_letter_is_saved_in_capitals(): void
    {
        $this->assertSame(200, $this->set('Sales', 's')->getStatusCode());
        $this->assertSame('S', VoucherType::where('name', 'Sales')->value('shortcut'));
    }

    public function test_one_letter_opens_one_type_but_its_owner_may_save_it_again(): void
    {
        $this->set('Sales', 'S');
        $res = $this->set('Purchase', 's');
        $this->assertSame(422, $res->getStatusCode());
        $this->assertNull(VoucherType::where('name', 'Purchase')->value('shortcut'));
        $this->assertSame(200, $this->set('Sales', 'S')->getStatusCode());
    }

    public function test_a_letter_can_be_cleared_and_only_a_single_letter_is_taken(): void
    {
        $this->set('Sales', 'S');
        $this->assertSame(200, $this->set('Sales', '')->getStatusCode());
        $this->assertNull(VoucherType::where('name', 'Sales')->value('shortcut'));
        foreach (['ab', '1'] as $bad) {
            try {
                $this->set('Sales', $bad);
                $this->fail('a bad letter was accepted');
            } catch (\Illuminate\Validation\ValidationException $e) {
                $this->assertArrayHasKey('shortcut', $e->errors());
            }
        }
    }
}
