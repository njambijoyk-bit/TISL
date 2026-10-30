<?php

namespace Tests\Feature;

use App\Models\Books\Ledger;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\Currency;
use App\Models\User;
use App\Services\Books\VoucherAdminNotes;
use Tests\TestCase;

/** The admin notes: system-made metadata that records the customer's tax treatment and who saved the voucher, for staff only. */
class VoucherAdminNotesTest extends TestCase
{
    private function plan(?Ledger $party): array
    {
        return ['type' => new VoucherType(['code' => 'SI', 'name' => 'Sales', 'base_type' => 'sales', 'has_items' => true]), 'party' => $party, 'currency' => new Currency(['code' => 'KES']), 'location_id' => null];
    }

    private function user(): User
    {
        $u = new User();
        $u->id = 5;
        $u->name = 'Wanjiru';

        return $u;
    }

    public function test_it_records_the_customers_tax_treatment_the_mode_the_taxes_and_who_saved_it(): void
    {
        $svc = app(VoucherAdminNotes::class);
        $taxes = [['label' => 'VAT 16%', 'amount' => 160.0]];
        $exempt = $svc->build($this->plan(new Ledger(['name' => 'Charity Ltd', 'tax_nature' => 'exempt'])), ['meta' => ['invoice_mode' => 'accounting']], $taxes, $this->user());
        $this->assertSame('exempt', $exempt['party']['tax_treatment']);
        $this->assertSame('accounting', $exempt['invoice_mode']);
        $this->assertSame([['label' => 'VAT 16%', 'amount' => 160.0]], $exempt['taxes_charged']);
        $this->assertSame('Wanjiru', $exempt['created']['by']['name']);
        $this->assertSame(0, $exempt['times_edited']);
        $this->assertSame('_note', array_key_last($exempt), 'the note that says it is system metadata stays at the very bottom');

        $plain = $svc->build($this->plan(new Ledger(['name' => 'Plain Co'])), [], [], $this->user());
        $this->assertSame('follows_account', $plain['party']['tax_treatment']);
        $this->assertSame('item', $plain['invoice_mode']);
        $this->assertArrayNotHasKey('taxes_charged', $plain, 'nothing charged: nothing listed');
    }

    public function test_every_save_rebuilds_it_keeping_who_made_it_and_counting_the_edits(): void
    {
        $svc = app(VoucherAdminNotes::class);
        $first = $svc->build($this->plan(null), [], [], $this->user());
        $second = $svc->build($this->plan(new Ledger(['name' => 'Dev In', 'tax_nature' => 'zero_rated'])), [], [], $this->user(), $first);
        $this->assertSame($first['created'], $second['created']);
        $this->assertSame(1, $second['times_edited']);
        $this->assertSame('zero_rated', $second['party']['tax_treatment']);
        $this->assertSame(2, $svc->build($this->plan(null), [], [], $this->user(), $second)['times_edited']);
    }

    public function test_it_cannot_be_typed_in_and_never_travels_with_a_voucher_to_a_customer(): void
    {
        $v = new Voucher(['voucher_number' => 'INV-1', 'admin_notes' => ['tampered' => true]]);
        $this->assertNull($v->admin_notes, 'not fillable: a request cannot set it');
        $v->forceFill(['admin_notes' => ['party' => ['ledger' => 'X']]]);
        $this->assertSame(['party' => ['ledger' => 'X']], $v->admin_notes, 'the system can set it');
        $this->assertArrayNotHasKey('admin_notes', $v->toArray(), 'left out of every serialisation');
        $this->assertStringNotContainsString('admin_notes', $v->toJson());
    }

    public function test_the_staff_lines_end_with_the_system_note(): void
    {
        $notes = app(VoucherAdminNotes::class)->build($this->plan(new Ledger(['name' => 'Dev In', 'tax_nature' => 'exempt'])), [], [['label' => 'VAT', 'amount' => 5.0]], $this->user());
        $lines = VoucherAdminNotes::lines($notes);
        $this->assertSame('Customer / supplier tax', $lines[1][0]);
        $this->assertStringContainsString('Exempt', $lines[1][1]);
        $this->assertSame(['', VoucherAdminNotes::NOTE], end($lines));
        $this->assertSame([], VoucherAdminNotes::lines(null));
    }
}
