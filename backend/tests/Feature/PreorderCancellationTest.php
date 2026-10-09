<?php

namespace Tests\Feature;

use App\Models\Books\Voucher;
use App\Models\Ticket;
use App\Services\Books\BooksException;
use App\Services\Books\OrderSummaryService;
use App\Services\Books\VoucherService;
use App\Services\Preorders\PreorderCancellation;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A customer asks to cancel a PAID preorder; staff approve (one credit note for everything owed, money back when it was paid at the till) or decline.
 * The credit-note builder itself is the books' own (VoucherService::createReturn); here it is stood in for so the rules around it are what is tested.
 */
class PreorderCancellationTest extends PreorderTestCase
{

    protected function setUp(): void
    {
        parent::setUp();
        $this->createPreorderTables();
        Schema::create('tickets', function ($t) { $t->id(); $t->string('ticket_number'); $t->unsignedBigInteger('customer_id')->nullable(); $t->unsignedBigInteger('assigned_to')->nullable(); $t->string('subject')->nullable(); $t->text('description')->nullable(); $t->string('status')->default('open'); $t->string('priority')->nullable(); $t->string('category')->nullable(); $t->softDeletes(); $t->timestamps(); });
        Schema::create('customers', function ($t) { $t->id(); $t->string('first_name')->nullable(); $t->string('last_name')->nullable(); $t->string('email')->nullable(); $t->softDeletes(); $t->timestamps(); });
        Schema::table('vouchers', function ($t) { $t->decimal('total_amount', 12, 2)->default(0); $t->string('party_name')->nullable(); $t->timestamps(); });
        DB::table('voucher_types')->insert([['id' => 1, 'base_type' => 'sales_order'], ['id' => 2, 'base_type' => 'cash_sale'], ['id' => 3, 'base_type' => 'sales']]);
        DB::table('customers')->insert(['id' => 7, 'first_name' => 'Amina', 'last_name' => 'W', 'email' => 'a@x.co']);
    }

    /** A paid preorder: the Sales Order and the sale made from it (type 2 cash sale, 3 invoice). */
    private function preorder(?int $saleType = 2, float $delivered = 0, bool $preorder = true, ?array $cancel = null): Voucher
    {
        $meta = array_filter(['preorder' => $preorder ? ['campaign_ids' => [1]] : null, 'cancel_request' => $cancel]);
        $id = DB::table('vouchers')->insertGetId(['voucher_type_id' => 1, 'customer_id' => 7, 'status' => 'posted', 'voucher_number' => 'PRE-00001', 'total_amount' => 1000, 'meta' => json_encode($meta)]);
        DB::table('voucher_items')->insert(['voucher_id' => $id, 'variant_id' => 5, 'quantity' => 2, 'delivered_quantity' => $delivered]);
        if ($saleType) {
            DB::table('vouchers')->insert(['voucher_type_id' => $saleType, 'customer_id' => 7, 'status' => 'posted', 'source_voucher_id' => $id, 'voucher_number' => 'CS-1']);
        }

        return Voucher::findOrFail($id);
    }

    private function svc(bool $paidAtOnce = true, array $lines = [], ?array $refund = ['ledgers' => [], 'default_id' => 12]): PreorderCancellation
    {
        $this->partialMock(VoucherService::class, function ($m) use ($paidAtOnce, $lines, $refund) {
            $m->shouldReceive('paidAtOnce')->andReturn($paidAtOnce);
            $m->shouldReceive('returnable')->andReturn(['lines' => $lines, 'refund' => $refund]);
        });

        return app(PreorderCancellation::class);
    }

    private function line(int $id, float $qty, float $amount, bool $charge = false): array
    {
        return ['id' => $id, 'is_charge' => $charge, 'available_amount' => $amount, 'available_quantity' => $qty];
    }

    public function test_a_paid_preorder_with_nothing_delivered_can_be_asked_about(): void
    {
        $e = app(PreorderCancellation::class)->eligibility($this->preorder());
        $this->assertTrue($e['can_request']);
        $this->assertNull($e['reason']);
    }

    public function test_an_unpaid_order_is_cancelled_the_ordinary_way(): void
    {
        $e = app(PreorderCancellation::class)->eligibility($this->preorder(null));
        $this->assertFalse($e['can_request']);
        $this->assertSame('not_paid', $e['reason']);
    }

    public function test_something_delivered_closes_the_door(): void
    {
        $o = $this->preorder(2, 1);
        $this->assertSame('delivered', app(PreorderCancellation::class)->eligibility($o)['reason']);
        $this->expectException(BooksException::class);
        $this->expectExceptionMessage('already been delivered');
        app(PreorderCancellation::class)->request($o, 'changed my mind', 7);
    }

    public function test_an_ordinary_order_is_not_handled_here(): void
    {
        $this->assertSame('not_preorder', app(PreorderCancellation::class)->eligibility($this->preorder(2, 0, false))['reason']);
    }

    public function test_asking_opens_a_ticket_and_records_the_request_and_cannot_be_done_twice(): void
    {
        $o = $this->preorder();
        $number = app(PreorderCancellation::class)->request($o, 'Found it cheaper elsewhere', 7);

        $this->assertStringStartsWith('TKT-' . now()->format('Y') . '-', $number);
        $t = Ticket::where('ticket_number', $number)->first();
        $this->assertSame('Cancel preorder PRE-00001', $t->subject);
        $this->assertSame('open', $t->status);
        $m = $o->fresh()->meta['cancel_request'];
        $this->assertSame('requested', $m['status']);
        $this->assertSame($number, $m['ticket']);

        $this->expectException(BooksException::class);
        $this->expectExceptionMessage('already asked');
        app(PreorderCancellation::class)->request($o->fresh(), 'again', 7);
    }

    public function test_staff_see_the_waiting_requests_with_the_refund_choices(): void
    {
        $o = $this->preorder();
        app(PreorderCancellation::class)->request($o, 'Changed my mind', 7);
        $rows = $this->svc(true, [], ['ledgers' => [['id' => 12, 'name' => 'M-Pesa']], 'default_id' => 12])->pending();

        $this->assertCount(1, $rows);
        $this->assertSame('Amina W', $rows[0]['customer']);
        $this->assertSame('paid', $rows[0]['sale']['kind']);
        $this->assertSame(12, $rows[0]['refund']['default_id']);
        $this->assertNull($rows[0]['blocked']);

        DB::table('voucher_items')->update(['delivered_quantity' => 1]);   // something went out since
        $this->assertStringContainsString('delivered since', $this->svc()->pending()[0]['blocked']);
    }

    public function test_approving_reverses_every_line_still_owed_and_refunds_from_the_default_ledger(): void
    {
        $o = $this->preorder();
        $number = app(PreorderCancellation::class)->request($o, 'Changed my mind', 7);
        $credit = (new Voucher)->forceFill(['voucher_number' => 'CN-9', 'meta' => ['refunded_to' => 'M-Pesa']]);
        $this->partialMock(VoucherService::class, function ($m) use ($credit) {
            $m->shouldReceive('paidAtOnce')->andReturn(true);
            $m->shouldReceive('returnable')->andReturn(['lines' => [$this->line(31, 2, 900), $this->line(32, 1, 100, true), $this->line(33, 0, 0)], 'refund' => ['ledgers' => [], 'default_id' => 12]]);
            $m->shouldReceive('createReturn')->once()->withArgs(function ($sale, $opts) {
                $this->assertSame([
                    ['item_id' => 31, 'mode' => 'return', 'quantity' => 2.0],
                    ['item_id' => 32, 'mode' => 'adjust', 'amount' => 100.0],
                ], $opts['lines']);
                $this->assertSame(12, $opts['refund_ledger_id']);

                return true;
            })->andReturn($credit);
        });

        $result = app(PreorderCancellation::class)->approve($o->fresh(), null, 'Sorry to see you go', null);

        $this->assertSame('CN-9', $result->voucher_number);
        $m = $o->fresh()->meta['cancel_request'];
        $this->assertSame('approved', $m['status']);
        $this->assertSame('CN-9', $m['credit_note']);
        $this->assertSame('M-Pesa', $m['refunded_to']);
        $this->assertSame('Changed my mind', $m['reason'], 'what the customer wrote is kept');
        $this->assertSame('resolved', Ticket::where('ticket_number', $number)->value('status'));
        $this->assertFalse(app(PreorderCancellation::class)->eligibility($o->fresh())['can_request']);
    }

    public function test_an_invoice_on_account_is_credited_with_no_refund_ledger(): void
    {
        $o = $this->preorder(3);
        app(PreorderCancellation::class)->request($o, 'No longer needed', 7);
        $this->partialMock(VoucherService::class, function ($m) {
            $m->shouldReceive('paidAtOnce')->andReturn(false);
            $m->shouldReceive('outstanding')->andReturn(0.0);
            $m->shouldReceive('returnable')->andReturn(['lines' => [$this->line(31, 2, 900)], 'refund' => null]);
            $m->shouldReceive('createReturn')->once()->withArgs(fn ($s, $opts) => ! array_key_exists('refund_ledger_id', $opts))->andReturn((new Voucher)->forceFill(['voucher_number' => 'CN-2', 'meta' => []]));
        });
        app(PreorderCancellation::class)->approve($o->fresh(), null, null, null);
        $this->assertSame('approved', $o->fresh()->meta['cancel_request']['status']);
    }

    public function test_a_sale_paid_at_the_till_needs_a_refund_ledger(): void
    {
        $o = $this->preorder();
        app(PreorderCancellation::class)->request($o, 'No longer needed', 7);
        $this->svc(true, [$this->line(31, 2, 900)], ['ledgers' => [], 'default_id' => null]);
        $this->expectException(BooksException::class);
        $this->expectExceptionMessage('Choose where the refund is paid from');
        app(PreorderCancellation::class)->approve($o->fresh(), null, null, null);
    }

    public function test_approving_is_refused_when_something_was_delivered_after_the_request(): void
    {
        $o = $this->preorder();
        app(PreorderCancellation::class)->request($o, 'No longer needed', 7);
        DB::table('voucher_items')->update(['delivered_quantity' => 1]);
        $this->svc();
        $this->expectException(BooksException::class);
        $this->expectExceptionMessage('delivered since the request');
        app(PreorderCancellation::class)->approve($o->fresh(), 12, null, null);
    }

    public function test_declining_keeps_the_reason_and_the_customer_may_ask_again(): void
    {
        $o = $this->preorder();
        $number = app(PreorderCancellation::class)->request($o, 'No longer needed', 7);
        app(PreorderCancellation::class)->decline($o->fresh(), 'It ships tomorrow; we cannot cancel after dispatch.', null);

        $e = app(PreorderCancellation::class)->eligibility($o->fresh());
        $this->assertTrue($e['can_request']);
        $this->assertSame('declined', $e['state']);
        $this->assertSame('It ships tomorrow; we cannot cancel after dispatch.', $e['note']);
        $this->assertSame('resolved', Ticket::where('ticket_number', $number)->value('status'));
        $this->assertCount(0, $this->svc()->pending());

        app(PreorderCancellation::class)->request($o->fresh(), 'Please reconsider', 7);   // a second request is allowed
        $this->assertSame('requested', $o->fresh()->meta['cancel_request']['status']);
    }

    public function test_nothing_can_be_decided_without_a_waiting_request(): void
    {
        $o = $this->preorder();
        $this->expectException(BooksException::class);
        $this->expectExceptionMessage('no cancellation request waiting');
        app(PreorderCancellation::class)->decline($o, 'x', null);
    }

    public function test_nothing_is_approved_without_a_waiting_request(): void
    {
        $o = $this->preorder();   // never asked
        $this->svc();
        $this->expectException(BooksException::class);
        $this->expectExceptionMessage('no cancellation request waiting');
        app(PreorderCancellation::class)->approve($o, 12, null, null);
    }

    public function test_an_approved_cancellation_shows_as_cancelled_to_the_customer(): void
    {
        $o = $this->preorder(2, 0, true, ['status' => 'approved']);
        $o->setRelation('children', collect())->setRelation('currency', null);
        $this->assertSame('cancelled', app(OrderSummaryService::class)->row($o)['status']);
    }

    public function test_a_deposit_that_was_paid_is_shown_to_staff_and_remembered_so_it_can_be_paid_back(): void
    {
        $o = $this->preorder(3);
        DB::table('vouchers')->where('source_voucher_id', $o->id)->update(['total_amount' => 1000]);   // the invoice: 1,000 asked, 300 deposit paid, 700 outstanding
        app(PreorderCancellation::class)->request($o, 'No longer needed', 7);
        $this->partialMock(VoucherService::class, function ($m) {
            $m->shouldReceive('paidAtOnce')->andReturn(false);
            $m->shouldReceive('outstanding')->andReturn(700.0);
            $m->shouldReceive('returnable')->andReturn(['lines' => [$this->line(31, 2, 1000)], 'refund' => null]);
            $m->shouldReceive('createReturn')->once()->andReturn((new Voucher)->forceFill(['voucher_number' => 'CN-3', 'meta' => []]));
        });
        $pending = app(PreorderCancellation::class)->pending();
        $this->assertSame(300.0, $pending[0]['paid_so_far']);
        app(PreorderCancellation::class)->approve($o->fresh(), null, null, null);
        $this->assertSame(300.0, (float) $o->fresh()->meta['cancel_request']['deposit_refund'], 'what the customer paid is remembered: it is theirs to get back');
    }

    public function test_an_order_nobody_paid_anything_on_has_no_deposit_to_pay_back(): void
    {
        $o = $this->preorder(3);
        DB::table('vouchers')->where('source_voucher_id', $o->id)->update(['total_amount' => 1000]);
        app(PreorderCancellation::class)->request($o, 'No longer needed', 7);
        $this->partialMock(VoucherService::class, function ($m) {
            $m->shouldReceive('paidAtOnce')->andReturn(false);
            $m->shouldReceive('outstanding')->andReturn(1000.0);
            $m->shouldReceive('returnable')->andReturn(['lines' => [$this->line(31, 2, 1000)], 'refund' => null]);
            $m->shouldReceive('createReturn')->once()->andReturn((new Voucher)->forceFill(['voucher_number' => 'CN-4', 'meta' => []]));
        });
        $this->assertNull(app(PreorderCancellation::class)->pending()[0]['paid_so_far']);
        app(PreorderCancellation::class)->approve($o->fresh(), null, null, null);
        $this->assertNull($o->fresh()->meta['cancel_request']['deposit_refund']);
    }
}
