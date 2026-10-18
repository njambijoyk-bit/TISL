<?php

namespace Tests\Feature;

use App\Models\Menus\Tip;
use App\Models\Menus\TipEvent;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Menus tips, build step 6.1 (script 212): the tips box and its history. */
class MenusTipsTableTest extends TestCase
{
    use Concerns\CreatesCounterWorld;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createCounterWorld();
    }

    public function test_the_tips_box_is_off_until_the_script_has_been_run(): void
    {
        $this->assertFalse(Tip::installed());
        $this->runSqlScripts('212_menus_tips.sql');
        $this->assertTrue(Tip::installed());
        $this->assertTrue(Schema::hasColumns('menus_tips', ['order_id', 'amount', 'ledger_id', 'status', 'issued_by', 'issued_to', 'issue_voucher_id', 'issue_narration']));
    }

    public function test_a_tip_waits_as_pending_and_keeps_its_history(): void
    {
        $this->runSqlScripts('212_menus_tips.sql');
        $tip = Tip::create(['order_id' => 7, 'amount' => 200, 'ledger_id' => 55, 'customer_name' => 'Wanjiru', 'short_no' => 4, 'received_by' => 3]);
        $tip = $tip->fresh();
        $this->assertSame([Tip::PENDING, '200.00', true], [$tip->status, (string) $tip->amount, $tip->pending()]);

        $tip->update(['status' => Tip::ISSUED, 'issued_by' => 3, 'issued_to' => 9, 'issue_voucher_id' => 31]);
        TipEvent::create(['tip_id' => $tip->id, 'kind' => TipEvent::ISSUED, 'amount' => 200, 'voucher_id' => 31, 'to_user_id' => 9, 'done_by' => 3, 'done_at' => now()]);
        TipEvent::create(['tip_id' => $tip->id, 'kind' => TipEvent::REVERSED, 'amount' => 200, 'voucher_id' => 31, 'reversal_voucher_id' => 32, 'narration' => 'Wrong person', 'done_by' => 4, 'done_at' => now()]);

        $this->assertSame([false, ['issued', 'reversed']], [$tip->fresh()->pending(), $tip->events->pluck('kind')->all()]);
    }

    public function test_an_order_has_one_tip_only(): void
    {
        $this->runSqlScripts('212_menus_tips.sql');
        Tip::create(['order_id' => 7, 'amount' => 100]);
        $this->expectException(QueryException::class);
        Tip::create(['order_id' => 7, 'amount' => 50]);
    }
}
