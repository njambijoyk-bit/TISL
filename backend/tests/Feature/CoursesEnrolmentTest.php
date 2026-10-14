<?php

namespace Tests\Feature;

use App\Models\Courses\Access;
use App\Models\Courses\Enrolment;
use App\Models\Courses\Fee;
use App\Models\Courses\Instalment;
use App\Models\Courses\Offering;
use App\Models\Books\Voucher;
use App\Models\Memberships\CreditEntry;
use App\Models\Memberships\Membership;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Courses\CourseFees;
use App\Services\Courses\CourseSettings;
use App\Services\Courses\EnrolmentService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Courses step 2: fees, what an enrolment costs and how it is paid, the money coming in, access opened and held back, cancelling, refunds and the hourly job. "Now" is Monday 12 Oct 2026, 12:00. */
class CoursesEnrolmentTest extends TestCase
{
    use Concerns\CreatesCoursesWorld;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createCoursesWorld();
    }

    private function fails(callable $fn, string $msg): void
    {
        try {
            $fn();
            $this->fail("Expected: {$msg}");
        } catch (BooksException $e) {
            $this->assertStringContainsString($msg, $e->getMessage());
        }
    }

    private function fees(): CourseFees
    {
        return app(CourseFees::class);
    }

    private function svc(): EnrolmentService
    {
        return app(EnrolmentService::class);
    }

    private function enrol(Offering $o, User $student, array $in = [], ?User $by = null, string $channel = 'online'): Enrolment
    {
        return $this->svc()->enrol($o, $in + ['student_user_id' => $student->id], $by, $channel);
    }

    private function hasAccess(User $u, Offering $o): bool
    {
        return Access::where('user_id', $u->id)->where('offering_id', $o->id)->whereNull('revoked_at')->exists();
    }

    private function settings(array $s): void
    {
        CourseSettings::save($s, null);
    }

    // ── fees ──────────────────────────────────────────────────────────────

    public function test_a_fee_takes_sensible_defaults_from_its_kind(): void
    {
        $o = $this->offering();
        $reg = $this->fees()->save($o, ['kind' => 'registration', 'amount' => '500.456', 'ledger_id' => $this->serviceLedger]);
        $this->assertSame(['registration', 'Registration fee', 500.46, true, false, true, false, 10], [$reg->kind, $reg->name, (float) $reg->amount, (bool) $reg->once_per_student, (bool) $reg->refundable, (bool) $reg->is_active, (bool) $reg->is_optional, (int) $reg->sort_order]);
        $kit = $this->fees()->save($o, ['kind' => 'materials', 'name' => '  Knife set ', 'amount' => 2000, 'ledger_id' => $this->productLedger, 'is_optional' => true]);   // a kit sells under a product account
        $this->assertSame(['Knife set', false, true, true, 20], [$kit->name, (bool) $kit->once_per_student, (bool) $kit->refundable, (bool) $kit->is_optional, (int) $kit->sort_order]);
        $tuition = $this->fees()->save($o, ['amount' => 1000, 'ledger_id' => $this->serviceLedger]);
        $this->assertSame(['tuition', false, true, 30], [$tuition->kind, (bool) $tuition->once_per_student, (bool) $tuition->refundable, (int) $tuition->sort_order]);
        $edited = $this->fees()->save($o, ['amount' => 1200, 'is_active' => false], $tuition);   // what is left out stays as it was
        $this->assertSame([1200.0, false, true, 30, (int) $this->serviceLedger], [(float) $edited->amount, (bool) $edited->is_active, (bool) $edited->refundable, (int) $edited->sort_order, (int) $edited->ledger_id]);
        $rows = $this->fees()->rows($o);
        $this->assertSame(['Registration fee', 'Knife set', 'Tuition'], array_column($rows, 'name'));
        $this->assertSame(['Membership income', 'Goods', 'Membership income'], array_column($rows, 'ledger'));
        $this->assertSame('Registration fee', $rows[0]['kind_label']);
        $this->assertSame([], $this->fees()->rows($this->offering()));
    }

    public function test_a_fee_is_checked(): void
    {
        $o = $this->offering();
        $ok = ['amount' => 100, 'ledger_id' => $this->serviceLedger];
        $this->fails(fn () => $this->fees()->save($o, ['kind' => 'tip'] + $ok), 'what kind of fee');
        $this->fails(fn () => $this->fees()->save($o, ['name' => str_repeat('a', 121)] + $ok), 'up to 120 letters');
        $this->fails(fn () => $this->fees()->save($o, ['name' => '   '] + $ok), 'up to 120 letters');
        $this->assertSame(120, mb_strlen($this->fees()->save($o, ['name' => str_repeat('é', 120)] + $ok)->name));
        $this->fails(fn () => $this->fees()->save($o, ['amount' => 0, 'ledger_id' => $this->serviceLedger]), 'amount of the fee');
        $this->fails(fn () => $this->fees()->save($o, ['amount' => -5, 'ledger_id' => $this->serviceLedger]), 'amount of the fee');
        $this->fails(fn () => $this->fees()->save($o, ['amount' => 100000000.01, 'ledger_id' => $this->serviceLedger]), 'amount of the fee');
        $this->assertSame(100000000.0, (float) $this->fees()->save($o, ['amount' => 100000000, 'ledger_id' => $this->serviceLedger])->amount);
        $this->assertSame(0.01, (float) $this->fees()->save($o, ['amount' => 0.01, 'ledger_id' => $this->serviceLedger])->amount);
        $this->fails(fn () => $this->fees()->save($o, ['amount' => 100]), 'sales account this fee is booked under');
        $gone = DB::table('ledgers')->insertGetId(['name' => 'Old', 'group_id' => DB::table('ledgers')->where('id', $this->serviceLedger)->value('group_id'), 'tax_nature' => 'taxable', 'is_active' => false]);
        $this->fails(fn () => $this->fees()->save($o, ['amount' => 100, 'ledger_id' => $gone]), 'active sales account');
        $exp = DB::table('ledgers')->insertGetId(['name' => 'Rent', 'group_id' => DB::table('ledger_groups')->insertGetId(['name' => 'Expenses', 'behaviour' => 'expense']), 'tax_nature' => 'taxable']);
        $this->fails(fn () => $this->fees()->save($o, ['amount' => 100, 'ledger_id' => $exp]), 'not a sales account');
        $this->fails(fn () => $this->fees()->save($o, ['is_optional' => true, 'once_per_student' => true] + $ok), 'can not also be optional');
        $this->fails(fn () => $this->fees()->save($o, ['kind' => 'registration', 'is_optional' => true] + $ok), 'can not also be optional');   // registration is once per student by default
        $mine = $this->fee($o);
        $this->fails(fn () => $this->fees()->save($this->offering(), ['amount' => 5], $mine), 'another offering');
        $this->assertSame(1000.0, (float) $mine->fresh()->amount);
    }

    public function test_a_fee_somebody_was_charged_can_only_be_switched_off(): void
    {
        $o = $this->offering();
        $charged = $this->fee($o);
        $spare = $this->fee($o, ['name' => 'Spare', 'is_optional' => true]);
        $this->enrol($o, $this->person());
        $this->fails(fn () => $this->fees()->delete($o, $charged), 'switch it off instead');
        $this->fails(fn () => $this->fees()->delete($this->offering(), $spare), 'another offering');
        $this->fees()->delete($o, $spare);
        $this->assertSame([$charged->id], Fee::pluck('id')->all());
    }

    // ── what it costs ─────────────────────────────────────────────────────

    public function test_the_plan_charges_the_fees_that_are_on_and_the_extras_chosen(): void
    {
        $o = $this->offering(['title' => 'Bread']);
        $t = $this->fee($o, ['sort_order' => 20]);
        $kit = $this->fee($o, ['kind' => 'materials', 'name' => 'Kit', 'amount' => 300, 'is_optional' => true, 'sort_order' => 30, 'ledger_id' => $this->productLedger]);
        $book = $this->fee($o, ['kind' => 'other', 'name' => 'Book', 'amount' => 200, 'is_optional' => true, 'sort_order' => 40]);
        $this->fee($o, ['name' => 'Old', 'is_active' => false, 'sort_order' => 5]);
        $reg = $this->fee($o, ['kind' => 'registration', 'name' => 'Registration', 'amount' => 150.5, 'once_per_student' => true, 'refundable' => false, 'sort_order' => 10]);
        $u = $this->person();
        $p = $this->svc()->plan($o, $u, [$kit->id], 10);
        $this->assertSame(['Registration', 'Tuition', 'Kit'], array_column($p['lines'], 'name'));
        $this->assertSame([$reg->id, $t->id, $kit->id], array_column($p['lines'], 'fee_id'));
        $this->assertSame([true, false, false], array_column($p['lines'], 'once_per_student'));
        $this->assertSame([false, true, true], array_column($p['lines'], 'refundable'));
        $this->assertSame([(int) $this->serviceLedger, (int) $this->serviceLedger, (int) $this->productLedger], array_column($p['lines'], 'ledger_id'));
        $this->assertSame([1450.5, 145.05, []], [$p['subtotal'], $p['discount'], $p['skipped']]);
        $this->fails(fn () => $this->svc()->plan($o, $u, [$t->id]), 'not offered');   // a fee that is not an extra can not be "chosen"
        $this->fails(fn () => $this->svc()->plan($o, $u, [999]), 'not offered');
        $this->assertSame(['Registration', 'Tuition', 'Kit', 'Book'], array_column($this->svc()->plan($o, $u, [$book->id, $kit->id])['lines'], 'name'));
    }

    public function test_a_once_only_fee_is_not_charged_again_while_an_earlier_enrolment_stands(): void
    {
        $a = $this->offering();
        $b = $this->offering();
        foreach ([$a, $b] as $o) {
            $this->fee($o);
            $this->fee($o, ['kind' => 'registration', 'name' => 'Registration', 'amount' => 500, 'once_per_student' => true, 'refundable' => false]);
        }
        $u = $this->person();
        $other = $this->person('Baraka');
        $first = $this->enrol($a, $u);
        $p = $this->svc()->plan($b, $u);
        $this->assertSame([['Tuition'], ['Registration'], 1000.0], [array_column($p['lines'], 'name'), $p['skipped'], $p['subtotal']]);
        $this->assertCount(2, $this->svc()->plan($b, $other)['lines']);   // only the person who paid it before
        $this->svc()->cancel($first);   // cancelled: it counts no more
        $this->assertCount(2, $this->svc()->plan($b, $u)['lines']);
        Enrolment::whereKey($first->id)->update(['status' => 'completed']);
        $this->assertCount(1, $this->svc()->plan($b, $u)['lines']);
        Enrolment::whereKey($first->id)->update(['status' => 'refunded']);
        $this->assertCount(2, $this->svc()->plan($b, $u)['lines']);
    }

    public function test_a_member_whose_plan_waives_tuition_pays_only_the_other_fees(): void
    {
        $o = $this->offering();
        $this->fee($o);
        $this->fee($o, ['kind' => 'materials', 'name' => 'Kit', 'amount' => 300]);
        $u = $this->person();
        $plan = $this->plan([], [['courses', ['mode' => 'all', 'waive_tuition' => true]]]);
        Membership::forceCreate(['number' => 'MB-1', 'plan_id' => $plan->id, 'member_user_id' => $u->id, 'status' => 'active', 'period_from' => '2026-10-01', 'paid_until' => '2026-11-01']);
        $p = $this->svc()->plan($o, $u);
        $this->assertSame([['Kit'], ['Tuition (free with your membership)'], 300.0], [array_column($p['lines'], 'name'), $p['skipped'], $p['subtotal']]);
        $this->assertCount(2, $this->svc()->plan($o, $this->person('Baraka'))['lines']);
        $plain = $this->plan([], [['courses', ['mode' => 'all', 'waive_tuition' => false]]]);
        $v = $this->person('Wanjiru');
        Membership::forceCreate(['number' => 'MB-2', 'plan_id' => $plain->id, 'member_user_id' => $v->id, 'status' => 'active', 'period_from' => '2026-10-01', 'paid_until' => '2026-11-01']);
        $this->assertCount(2, $this->svc()->plan($o, $v)['lines']);
    }

    public function test_the_schedule_splits_the_total_into_a_deposit_and_instalments(): void
    {
        $now = Carbon::parse('2026-10-12 23:30', 'Africa/Nairobi');
        $rows = fn (array $o, float $total) => array_map(fn ($r) => [$r['label'], $r['due']->toDateString(), $r['amount']], $this->svc()->schedule($this->offering($o), $total, $now));
        $this->assertSame([['Payment', '2026-10-12', 1160.0]], $rows([], 1160));
        $this->assertSame([], $rows([], 0));
        $this->assertSame([['Payment', '2026-10-12', 1160.0]], $rows(['instalments' => 1], 1160));
        $this->assertSame([['Instalment 1 of 3', '2026-10-12', 33.33], ['Instalment 2 of 3', '2026-10-26', 33.33], ['Instalment 3 of 3', '2026-11-09', 33.34]], $rows(['instalments' => 3, 'instalment_days' => 14], 100));
        $this->assertSame([['Deposit', '2026-10-12', 300.0], ['Instalment 1 of 2', '2026-11-11', 350.0], ['Instalment 2 of 2', '2026-12-11', 350.0]], $rows(['deposit_pct' => 30, 'instalments' => 2], 1000));
        $this->assertSame([['Deposit', '2026-10-12', 333.33], ['Balance', '2026-10-19', 666.67]], $rows(['deposit_pct' => 33.333, 'instalment_days' => 7], 1000));
        $this->assertSame([['Deposit', '2026-10-12', 250.0], ['Balance', '2026-11-11', 750.0]], $rows(['deposit_pct' => 25, 'instalments' => 1], 1000));
        $this->assertSame([['Deposit', '2026-10-12', 0.01]], $rows(['deposit_pct' => 99.99, 'instalments' => 2], 0.01));   // nothing left after the deposit
        $this->assertSame([['Payment', '2026-10-12', 10.0]], $rows(['deposit_pct' => 0, 'instalments' => 0], 10));
    }

    public function test_a_quote_shows_the_total_with_tax_and_the_schedule(): void
    {
        $o = $this->offering(['deposit_pct' => 50, 'instalments' => 1, 'grant_on' => 'deposit']);
        $this->fee($o);
        $q = $this->svc()->quote($o, $this->person(), $this->person('Payer'));
        $this->assertSame([1160.0, 1000.0, 0.0, 'deposit'], [$q['total'], $q['subtotal'], $q['discount'], $q['grant_on']]);
        $this->assertSame([['Deposit', '2026-10-12', 580.0], ['Balance', '2026-11-11', 580.0]], array_map(fn ($r) => [$r['label'], $r['due_date'], $r['amount']], $q['schedule']));
        $this->assertSame([], $this->placed);   // nothing is booked by a quote
        $free = $this->svc()->quote($this->offering(), $this->person('B'), $this->person('C'));
        $this->assertSame([0.0, [], 'paid'], [$free['total'], $free['schedule'], $free['grant_on']]);
        $all = $this->svc()->quote($o, $this->person('D'), $this->person('E'), [], 100);
        $this->assertSame([0.0, []], [$all['total'], $all['schedule']]);
    }

    // ── enrolling ─────────────────────────────────────────────────────────

    public function test_enrolling_books_an_order_and_an_invoice_and_sets_out_the_payments(): void
    {
        $o = $this->offering(['title' => 'Sourdough', 'deposit_pct' => 40, 'instalments' => 2, 'instalment_days' => 10, 'location_id' => 2, 'delivery' => 'in_person']);
        $this->fee($o);
        $this->fee($o, ['kind' => 'materials', 'name' => 'Kit', 'amount' => 500, 'ledger_id' => $this->productLedger]);
        $u = $this->person('Amina');
        $e = $this->enrol($o, $u, ['notes' => '  Vegetarian  ']);
        $this->assertSame(['EN-'.str_pad((string) $e->id, 6, '0', STR_PAD_LEFT), 'pending', 'online', 1740.0, 0.0, 'Vegetarian', null], [$e->number, $e->status, $e->channel, (float) $e->total, (float) $e->paid_total, $e->notes, $e->payer_user_id]);
        $this->assertSame((int) $u->customer->id, (int) $e->customer_id);
        $this->assertSame('2026-10-14 12:00', $e->expires_at->timezone('Africa/Nairobi')->format('Y-m-d H:i'));   // the place is held 48 hours
        $order = $this->placed[0];
        $this->assertSame([2, 1, (int) $u->customer->id, 'storefront', $e->id, 'Amina', '0712000000'], [$order['location_id'], $order['currency_id'], $order['customer_id'], $order['channel'], $order['meta']['course_enrolment_id'], $order['meta']['contact']['name'], $order['meta']['contact']['phone']]);
        $this->assertSame([['Sourdough — Tuition', 1000.0, (int) $this->serviceLedger], ['Sourdough — Kit', 500.0, (int) $this->productLedger]], array_map(fn ($l) => [$l['description'], $l['rate'], $l['ledger_id']], $order['lines']));
        $this->assertSame("Enrolment {$e->number}: Sourdough", $order['narration']);
        $this->assertSame([\App\Models\Books\VoucherType::SALES, false, '2026-11-01'], [$this->invoices[0]['type'], $this->invoices[0]['moves_stock'], $this->invoices[0]['due_date']]);
        $this->assertSame([$this->invoices[0]['order'], $this->invoices[0]['invoice']], [(int) $e->voucher_id, (int) $e->invoice_id]);
        $this->assertSame([[1, 'Deposit', '2026-10-12', 696.0], [2, 'Instalment 1 of 2', '2026-10-22', 522.0], [3, 'Instalment 2 of 2', '2026-11-01', 522.0]],
            $e->instalments->map(fn ($i) => [(int) $i->seq, $i->label, $i->due_date->toDateString(), (float) $i->amount])->all());
        $this->assertSame(['Tuition', 'Kit'], $e->lines->pluck('name')->all());
        $this->assertFalse($this->hasAccess($u, $o));
        $this->assertSame(['course_enrolled'], $this->sentTo($u->id));
        $this->assertStringContainsString('696.00', collect($this->sent)->firstWhere('type', 'course_enrolled')['message']);
        $this->fails(fn () => $this->enrol($o, $u), 'Amina is enrolled in this already');
        $this->assertSame(1, (int) Enrolment::latest('id')->value('id') - $e->id + 1);
    }

    public function test_an_order_at_a_branchless_offering_goes_to_the_default_branch_and_a_counter_enrolment_is_marked_so(): void
    {
        $o = $this->offering();
        $this->fee($o);
        $staff = $this->person('Clerk', false);
        $e = $this->enrol($o, $this->person(), [], $staff, 'counter');
        $this->assertSame([1, 'counter', (int) $staff->id], [$this->placed[0]['location_id'], $e->channel, (int) $e->created_by]);
        $this->assertSame('online', $this->enrol($o, $this->person('B'), [], null, 'kiosk')->channel);
        DB::table('locations')->update(['is_default' => false]);
        $this->enrol($o, $this->person('C'));
        $this->assertSame(1, $this->placed[2]['location_id']);   // no default: the first branch
    }

    public function test_someone_else_can_pay_and_is_invoiced_and_told(): void
    {
        $o = $this->offering();
        $this->fee($o);
        $kid = $this->person('Kid', false);
        $mum = $this->person('Mum');
        $e = $this->enrol($o, $kid, ['payer_user_id' => $mum->id]);
        $this->assertSame([(int) $mum->id, (int) $mum->customer->id], [(int) $e->payer_user_id, (int) $e->customer_id]);
        $this->assertSame('Mum', $this->placed[0]['meta']['contact']['name']);
        $this->assertSame(['course_enrolled'], $this->sentTo($mum->id));
        $this->assertSame(['course_enrolled'], $this->sentTo($kid->id));
        $this->fails(fn () => $this->enrol($this->offering(), $kid, ['payer_user_id' => 999]), 'Choose who pays');
        $o2 = $this->offering();
        $this->fee($o2);
        $this->fails(fn () => $this->enrol($o2, $mum, ['payer_user_id' => $kid->id]), 'Kid needs a customer account');
        $this->fails(fn () => $this->enrol($o2, $kid), 'Kid needs a customer account');
        $this->assertSame((int) $mum->id, (int) $this->enrol($o2, $kid, ['payer_user_id' => $mum->id])->payer_user_id);
        $self = $this->enrol($this->offeringWithFee(), $mum, ['payer_user_id' => $mum->id]);
        $this->assertNull($self->payer_user_id);   // paying for yourself is not "someone else"
    }

    private function offeringWithFee(array $o = [], float $amount = 1000): Offering
    {
        $x = $this->offering($o);
        $this->fee($x, ['amount' => $amount]);

        return $x;
    }

    public function test_a_free_offering_enrols_at_once_without_the_books(): void
    {
        $o = $this->offering();
        $u = $this->person('Free', false);   // no customer account needed when nothing is charged
        $e = $this->enrol($o, $u);
        $this->assertSame(['active', 0.0, null, null, null], [$e->status, (float) $e->total, $e->voucher_id, $e->invoice_id, $e->expires_at]);
        $this->assertNotNull($e->activated_at);
        $this->assertTrue($this->hasAccess($u, $o));
        $this->assertSame([], $this->placed);
        $this->assertEqualsCanonicalizing(['course_enrolled', 'course_open'], $this->sentTo($u->id));
        $this->assertCount(0, $e->instalments);
    }

    public function test_only_what_is_open_can_be_enrolled_in_and_places_run_out(): void
    {
        $this->fails(fn () => $this->enrol($this->offering(['status' => 'draft']), $this->person()), 'not open for enrolment');
        $this->fails(fn () => $this->enrol($this->offering(['status' => 'archived']), $this->person('B')), 'not open for enrolment');
        $this->fails(fn () => $this->svc()->enrol($this->offering(), ['student_user_id' => 999]), 'Choose the student');
        $o = $this->offeringWithFee(['capacity' => 2]);
        $a = $this->enrol($o, $this->person('C'));
        $this->enrol($o, $this->person('D'));
        $this->fails(fn () => $this->enrol($o, $this->person('E')), 'Every place is taken');
        $this->svc()->cancel($a);
        $this->assertSame('pending', $this->enrol($o, $this->person('F'))->status);
    }

    public function test_a_discount_is_given_only_by_staff_within_the_limit_and_with_a_reason(): void
    {
        $o = $this->offeringWithFee();
        $staff = $this->person('Clerk', false);
        $this->fails(fn () => $this->enrol($o, $this->person('A'), ['discount_pct' => 10, 'discount_note' => 'x']), 'Only staff');
        $this->fails(fn () => $this->enrol($o, $this->person('B'), ['discount_pct' => 10], $staff), 'Say why');
        $this->fails(fn () => $this->enrol($o, $this->person('C'), ['discount_pct' => 10, 'discount_note' => '   '], $staff), 'Say why');
        $this->fails(fn () => $this->enrol($o, $this->person('D'), ['discount_pct' => -1], $staff), 'can not be negative');
        $this->settings(['max_discount_pct' => 20]);
        $this->fails(fn () => $this->enrol($o, $this->person('E'), ['discount_pct' => 20.01, 'discount_note' => 'Friend'], $staff), 'most that can be taken off is 20 percent');
        $e = $this->enrol($o, $this->person('F'), ['discount_pct' => 20, 'discount_note' => ' Staff family '], $staff);
        $this->assertSame([20.0, 'Staff family'], [(float) $e->discount_pct, $e->discount_note]);
        $disc = end($this->placed)['lines'][1];
        $this->assertSame(['charge', 'discount', 'Discount 20%: Staff family', 200.0], [$disc['type'], $disc['kind'], $disc['description'], $disc['amount']]);
        $this->assertSame(0.0, (float) $this->enrol($o, $this->person('G'))->discount_pct);
        $this->settings(['max_discount_pct' => 100]);
        $all = $this->enrol($o, $this->person('H'), ['discount_pct' => 100, 'discount_note' => 'Scholarship'], $staff);
        $this->assertSame(['active', 0.0, null], [$all->status, (float) $all->total, $all->invoice_id]);   // nothing left to pay: enrolled at once
    }

    public function test_a_discount_with_a_fraction_reads_cleanly(): void
    {
        $o = $this->offeringWithFee();
        $this->enrol($o, $this->person(), ['discount_pct' => 12.5, 'discount_note' => 'Promo'], $this->person('Clerk', false));
        $this->assertSame('Discount 12.5%: Promo', end($this->placed)['lines'][1]['description']);
    }

    public function test_the_place_is_held_as_long_as_the_settings_say(): void
    {
        $o = $this->offeringWithFee();
        $this->settings(['pending_hours' => 0]);
        $this->assertNull($this->enrol($o, $this->person('A'))->expires_at);
        $this->settings(['pending_hours' => 5]);
        $this->assertSame('2026-10-12 17:00', $this->enrol($o, $this->person('B'))->expires_at->timezone('Africa/Nairobi')->format('Y-m-d H:i'));
    }

    // ── money in ──────────────────────────────────────────────────────────

    public function test_counter_payments_fill_the_schedule_in_order_and_open_access_when_paid_in_full(): void
    {
        $o = $this->offeringWithFee(['deposit_pct' => 50, 'instalments' => 1]);   // access when paid in full (the default)
        $u = $this->person();
        $e = $this->enrol($o, $u);
        $this->assertSame(580.0, $this->svc()->nextDue($e));
        $clerk = $this->person('Clerk', false);
        $e = $this->svc()->takePayment($e, [['payment_method_id' => 1, 'amount' => 300, 'reference' => 'R1'], ['payment_method_id' => 4, 'amount' => '400']], $clerk);
        $this->assertSame(['invoice' => (int) $e->invoice_id, 'tenders' => [['payment_method_id' => 1, 'amount' => 300.0, 'reference' => 'R1'], ['payment_method_id' => 4, 'amount' => 400.0, 'reference' => null]], 'amount' => 700.0, 'payment_method_id' => 1, 'channel' => 'admin'], $this->receipts[0]);
        $this->assertSame([700.0, 'pending', null], [(float) $e->paid_total, $e->status, $e->expires_at]);   // paid something: the place is no longer let go
        $this->assertSame([580.0, 120.0], $e->instalments->map(fn ($i) => (float) $i->paid_amount)->all());
        $this->assertSame(460.0, $this->svc()->nextDue($e));
        $this->assertFalse($this->hasAccess($u, $o));
        $this->fails(fn () => $this->svc()->takePayment($e, [['payment_method_id' => 1, 'amount' => 460.01]]), 'more than the 460.00 still to pay');
        $this->fails(fn () => $this->svc()->takePayment($e, [['payment_method_id' => 1, 'amount' => 0]]), 'Enter the amount');
        $this->fails(fn () => $this->svc()->takePayment($e, []), 'Enter the amount');
        $e = $this->svc()->takePayment($e, [['payment_method_id' => 1, 'amount' => 460]]);
        $this->assertSame(['active', 1160.0, 0.0], [$e->status, (float) $e->paid_total, $e->balance()]);
        $this->assertTrue($this->hasAccess($u, $o));
        $this->assertSame(0.0, $this->svc()->nextDue($e));
        $this->assertSame(['course_enrolled', 'course_paid', 'course_paid', 'course_open'], $this->sentTo($u->id));
        $this->fails(fn () => $this->svc()->takePayment($e, [['payment_method_id' => 1, 'amount' => 1]]), 'more than the 0.00');
    }

    public function test_access_can_open_at_the_deposit(): void
    {
        $o = $this->offeringWithFee(['deposit_pct' => 30, 'instalments' => 2, 'grant_on' => 'deposit']);
        $u = $this->person();
        $e = $this->enrol($o, $u);
        $e = $this->svc()->takePayment($e, [['payment_method_id' => 1, 'amount' => 348]]);
        $this->assertSame('active', $e->status);
        $this->assertTrue($this->hasAccess($u, $o));
        $o2 = $this->offeringWithFee(['deposit_pct' => 30, 'instalments' => 2, 'grant_on' => 'deposit']);
        $e2 = $this->svc()->takePayment($this->enrol($o2, $u), [['payment_method_id' => 1, 'amount' => 347.99]]);
        $this->assertSame('pending', $e2->status);   // a cent short of the deposit
    }

    public function test_money_can_only_be_taken_on_a_live_enrolment(): void
    {
        $o = $this->offeringWithFee();
        $e = $this->enrol($o, $this->person());
        $this->svc()->cancel($e);
        $this->fails(fn () => $this->svc()->takePayment($e->fresh(), [['payment_method_id' => 1, 'amount' => 1]]), 'waiting for payment or running');
        $free = $this->enrol($this->offering(), $this->person('B'));
        $this->fails(fn () => $this->svc()->takePayment($free, [['payment_method_id' => 1, 'amount' => 1]]), 'waiting for payment or running');
        $this->assertSame([], $this->receipts);
    }

    public function test_an_online_payment_starts_on_the_gateway_for_the_next_amount_due(): void
    {
        $o = $this->offeringWithFee(['deposit_pct' => 25, 'instalments' => 1]);
        $kid = $this->person('Kid', false);
        $mum = $this->person('Mum', true, '0722333444');
        $e = $this->enrol($o, $kid, ['payer_user_id' => $mum->id]);
        $r = $this->svc()->pay($e, ['payment_method_id' => 4]);
        $this->assertSame(['invoice' => (int) $e->invoice_id, 'method' => 'M-Pesa online', 'amount' => 290.0, 'phone' => '0722333444'], $this->started[0]);
        $this->assertSame([701, 'pending', 290.0, 'mpesa_stk'], [$r['attempt']['id'], $r['attempt']['status'], $r['attempt']['amount'], $r['attempt']['gateway']]);
        $this->assertSame('Check your phone and enter your M-Pesa PIN to pay 290.00.', $r['message']);
        $this->assertNotEmpty($r['attempt']['token']);
        $this->svc()->pay($e, ['payment_method_id' => 4, 'amount' => '1160', 'phone' => '0700']);
        $this->assertSame([1160.0, '0700'], [$this->started[1]['amount'], $this->started[1]['phone']]);
        $this->svc()->pay($e, ['payment_method_id' => 4, 'amount' => '1']);
        $this->assertSame(1.0, $this->started[2]['amount']);
        $this->fails(fn () => $this->svc()->pay($e, ['payment_method_id' => 4, 'amount' => 0.99]), 'between 1 and 1,160.00');
        $this->fails(fn () => $this->svc()->pay($e, ['payment_method_id' => 4, 'amount' => 1160.01]), 'between 1 and 1,160.00');
        $this->fails(fn () => $this->svc()->pay($e, ['payment_method_id' => 1]), 'Choose how to pay');   // cash is not taken online
        $this->fails(fn () => $this->svc()->pay($e, []), 'Choose how to pay');
        DB::table('payment_methods')->insert(['id' => 5, 'name' => 'Odd', 'kind' => 'card', 'is_online' => true, 'gateway' => 'no_such_gateway', 'is_active' => true]);
        $this->fails(fn () => $this->svc()->pay($e, ['payment_method_id' => 5]), "can't be charged automatically");
        $this->assertCount(3, $this->started);
        $this->svc()->cancel($e);
        $this->fails(fn () => $this->svc()->pay($e->fresh(), ['payment_method_id' => 4]), 'nothing to pay');
        $this->fails(fn () => $this->svc()->pay($this->enrol($this->offering(), $this->person('Z')), ['payment_method_id' => 4]), 'nothing to pay');
    }

    public function test_a_gateway_receipt_reaches_the_enrolment_through_its_invoice(): void
    {
        $o = $this->offeringWithFee();
        $u = $this->person();
        $e = $this->enrol($o, $u);
        $this->svc()->paid(Voucher::create(['voucher_type_id' => 2, 'total_amount' => 1160, 'meta' => ['other' => 1]]), 1160);   // not an enrolment's
        $this->svc()->paid(Voucher::create(['voucher_type_id' => 2, 'total_amount' => 1160, 'meta' => ['course_enrolment_id' => 999]]), 1160);   // an invoice no enrolment has
        $this->assertSame(0.0, (float) $e->fresh()->paid_total);
        $this->svc()->paid(Voucher::find($e->invoice_id), 1160);
        $this->assertSame(['active', 1160.0], [$e->fresh()->status, (float) $e->fresh()->paid_total]);
        $this->assertTrue($this->hasAccess($u, $o));
    }

    // ── access held back and given back ───────────────────────────────────

    public function test_a_late_instalment_holds_access_back_until_it_is_paid(): void
    {
        $o = $this->offeringWithFee(['deposit_pct' => 50, 'instalments' => 1, 'instalment_days' => 30, 'grant_on' => 'deposit', 'grace_days' => 3]);
        $u = $this->person();
        $e = $this->svc()->takePayment($this->enrol($o, $u), [['payment_method_id' => 1, 'amount' => 580]]);
        $this->assertTrue($this->hasAccess($u, $o));
        $this->sent = [];
        $this->assertSame(['released' => 0, 'held' => 0, 'reminded' => 0], $this->svc()->sweep(Carbon::parse('2026-11-14 12:00', 'Africa/Nairobi')));   // due 11 Nov + 3 days' grace: still fine
        $r = $this->svc()->sweep(Carbon::parse('2026-11-15 00:30', 'Africa/Nairobi'));
        $this->assertSame(1, $r['held']);
        $this->assertTrue((bool) $e->fresh()->access_paused);
        $this->assertFalse($this->hasAccess($u, $o));
        $this->assertSame(['course_lapsed'], $this->sentTo($u->id));
        $this->assertNotNull(Instalment::where('enrolment_id', $e->id)->where('seq', 2)->value('lapsed_told_at'));
        $this->assertSame(0, $this->svc()->sweep(Carbon::parse('2026-11-16 12:00', 'Africa/Nairobi'))['held']);   // held once, told once
        $this->assertSame(['course_lapsed'], $this->sentTo($u->id));
        $e = $this->svc()->takePayment($e->fresh(), [['payment_method_id' => 1, 'amount' => 580]]);
        $this->assertFalse((bool) $e->access_paused);
        $this->assertTrue($this->hasAccess($u, $o));
    }

    public function test_a_payment_that_leaves_an_instalment_still_late_keeps_access_held(): void
    {
        $o = $this->offeringWithFee(['instalments' => 2, 'instalment_days' => 10, 'grant_on' => 'deposit', 'grace_days' => 0]);
        $u = $this->person();
        $e = $this->svc()->takePayment($this->enrol($o, $u), [['payment_method_id' => 1, 'amount' => 580]]);
        $this->svc()->sweep(Carbon::parse('2026-10-23 08:00', 'Africa/Nairobi'));   // the second was due on the 22nd
        $this->assertTrue((bool) $e->fresh()->access_paused);
        $this->at('2026-10-23 09:00');
        $e = $this->svc()->takePayment($e->fresh(), [['payment_method_id' => 1, 'amount' => 100]]);
        $this->assertTrue((bool) $e->access_paused);
        $this->assertFalse($this->hasAccess($u, $o));
    }

    public function test_reminders_go_once_for_payments_coming_due(): void
    {
        $o = $this->offeringWithFee(['deposit_pct' => 50, 'instalments' => 1, 'instalment_days' => 10]);
        $u = $this->person();
        $e = $this->enrol($o, $u);
        $this->sent = [];
        $r = $this->svc()->sweep(Carbon::parse('2026-10-12 13:00', 'Africa/Nairobi'));   // the deposit is due today
        $this->assertSame(1, $r['reminded']);
        $this->assertSame(['course_reminder'], $this->sentTo($u->id));
        $this->assertSame(0, $this->svc()->sweep(Carbon::parse('2026-10-12 14:00', 'Africa/Nairobi'))['reminded']);
        $this->svc()->takePayment($e->fresh(), [['payment_method_id' => 1, 'amount' => 580]]);
        $this->assertSame(0, $this->svc()->sweep(Carbon::parse('2026-10-18 12:00', 'Africa/Nairobi'))['reminded']);   // the balance is due on the 22nd: 4 days away
        $this->assertSame(1, $this->svc()->sweep(Carbon::parse('2026-10-19 12:00', 'Africa/Nairobi'))['reminded']);   // 3 days away
        $this->settings(['reminder_days' => 0]);
        $other = $this->enrol($this->offeringWithFee(['deposit_pct' => 50, 'instalments' => 1]), $this->person('B'));
        $this->assertSame(0, $this->svc()->sweep(Carbon::parse('2026-10-12 13:00', 'Africa/Nairobi'))['reminded']);
        $this->assertNull($other->instalments()->first()->reminded_at);
    }

    public function test_the_sweep_lets_go_of_places_nobody_paid_for(): void
    {
        $o = $this->offeringWithFee();
        $late = $this->enrol($o, $this->person('A'));
        $part = $this->enrol($o, $this->person('B'));
        $this->svc()->takePayment($part, [['payment_method_id' => 1, 'amount' => 100]]);
        Enrolment::whereKey($part->id)->update(['expires_at' => '2026-10-13 00:00:00']);
        $this->at('2026-10-13 12:00');
        $fresh = $this->enrol($o, $this->person('C'));
        $r = $this->svc()->sweep(Carbon::parse('2026-10-14 12:00:01', 'Africa/Nairobi'));
        $this->assertSame(1, $r['released']);
        $this->assertSame(['cancelled', 'pending', 'pending'], [$late->fresh()->status, $part->fresh()->status, $fresh->fresh()->status]);
        $this->assertSame('Not paid in time: the place was released.', $late->fresh()->cancel_reason);
        $this->assertContains((int) $late->invoice_id, $this->cancelled);
        $this->assertSame(0, $this->svc()->sweep(Carbon::parse('2026-10-14 12:00:01', 'Africa/Nairobi'))['released']);
    }

    // ── cancelling and refunding ──────────────────────────────────────────

    public function test_cancelling_an_unpaid_enrolment_cancels_the_books_and_frees_the_place(): void
    {
        $o = $this->offeringWithFee();
        $u = $this->person();
        $e = $this->enrol($o, $u);
        $clerk = $this->person('Clerk', false);
        $e = $this->svc()->cancel($e, '  Changed their mind  ', $clerk);
        $this->assertSame(['cancelled', 'Changed their mind', null], [$e->status, $e->cancel_reason, $e->expires_at]);
        $this->assertNotNull($e->cancelled_at);
        $this->assertSame([(int) $e->invoice_id, (int) $e->voucher_id], $this->cancelled);
        $this->fails(fn () => $this->svc()->cancel($e), 'can not be cancelled now');
        $this->assertContains('course_cancelled', $this->sentTo($u->id));
        $this->assertNull($this->svc()->cancel($this->enrol($o, $this->person('B')), '   ')->cancel_reason);
        $this->assertSame(300, mb_strlen($this->svc()->cancel($this->enrol($o, $this->person('C')), str_repeat('x', 400))->cancel_reason));
    }

    public function test_an_invoice_already_cancelled_in_the_books_is_left_alone_and_access_is_ended(): void
    {
        $o = $this->offering();
        $u = $this->person();
        $free = $this->enrol($o, $u);
        $this->assertTrue($this->hasAccess($u, $o));
        $this->svc()->cancel($free);
        $this->assertFalse($this->hasAccess($u, $o));
        $this->assertSame([], $this->cancelled);
        $e = $this->enrol($this->offeringWithFee(), $u);
        Voucher::whereKey($e->invoice_id)->update(['status' => Voucher::CANCELLED]);
        $this->svc()->cancel($e);
        $this->assertSame([(int) $e->voucher_id], $this->cancelled);
    }

    public function test_money_paid_means_a_refund_not_a_cancel(): void
    {
        $e = $this->enrol($this->offeringWithFee(), $this->person());
        $e = $this->svc()->takePayment($e, [['payment_method_id' => 1, 'amount' => 1]]);
        $this->fails(fn () => $this->svc()->cancel($e), 'refund it');
        $this->assertSame([], $this->cancelled);
    }

    public function test_a_refund_credits_the_refundable_fees_and_ends_access(): void
    {
        $o = $this->offering(['title' => 'Pastry', 'refund_days' => 7]);
        $this->fee($o);
        $this->fee($o, ['kind' => 'registration', 'name' => 'Registration', 'amount' => 200, 'once_per_student' => true, 'refundable' => false]);
        $u = $this->person();
        $e = $this->svc()->takePayment($this->enrol($o, $u), [['payment_method_id' => 1, 'amount' => 1392]]);
        $this->assertTrue($this->hasAccess($u, $o));
        $clerk = $this->person('Clerk', false);
        $e = $this->svc()->refund($e, $clerk, false, '  Moved away ');
        $this->assertSame(['refunded', 'Moved away', false], [$e->status, $e->cancel_reason, (bool) $e->access_paused]);
        $this->assertNotNull($e->refunded_at);
        $this->assertSame((int) $e->invoice_id, $this->credited[0]['invoice']);
        $this->assertSame([[(int) $e->invoice_id * 100, 'return', 1]], array_map(fn ($l) => [$l['item_id'], $l['mode'], $l['quantity']], $this->credited[0]['lines']));   // the tuition line only
        $this->assertSame(['Moved away', "Enrolment {$e->number} refunded"], [$this->credited[0]['reason'], $this->credited[0]['narration']]);
        $this->assertArrayNotHasKey('refund_ledger_id', $this->credited[0]);
        $this->assertNotNull($e->credit_note_id);
        $this->assertFalse($this->hasAccess($u, $o));
        $this->assertContains('course_cancelled', $this->sentTo($u->id));
        $this->fails(fn () => $this->svc()->refund($e), 'can not be refunded');
    }

    public function test_the_refund_window_closes_except_for_a_decision(): void
    {
        $o = $this->offeringWithFee(['refund_days' => 7]);
        $e = $this->enrol($o, $this->person());
        $this->assertTrue($this->svc()->refundOpen($e, $o, Carbon::parse('2026-10-19 23:59:59', 'Africa/Nairobi')));
        $this->assertFalse($this->svc()->refundOpen($e, $o, Carbon::parse('2026-10-20 00:00:00', 'Africa/Nairobi')));
        $this->assertTrue($this->svc()->refundOpen($e, $this->offering(), Carbon::parse('2036-01-01')));   // no window: always
        $this->at('2026-10-20 09:00');
        $this->fails(fn () => $this->svc()->refund($e), 'refund window of 7 days has closed');
        $this->assertSame('refunded', $this->svc()->refund($e, null, true)->status);
        $this->assertSame('Course fees refunded', $e->fresh()->cancel_reason);
    }

    public function test_what_cannot_be_refunded_automatically_is_left_to_the_books(): void
    {
        $o = $this->offering();
        $this->fee($o, ['kind' => 'registration', 'name' => 'Registration', 'refundable' => false, 'once_per_student' => true]);
        $e = $this->enrol($o, $this->person('A'));
        $this->fails(fn () => $this->svc()->refund($e), 'Every fee on this enrolment is non-refundable');
        $o2 = $this->offering();
        $this->fee($o2);
        $this->fee($o2, ['name' => 'Deposit kept', 'refundable' => false]);
        $staff = $this->person('Clerk', false);
        $d = $this->enrol($o2, $this->person('B'), ['discount_pct' => 10, 'discount_note' => 'x'], $staff);
        $this->fails(fn () => $this->svc()->refund($d), 'has a discount and a fee that is not refundable');
        $o3 = $this->offeringWithFee();
        $x = $this->enrol($o3, $this->person('C'), ['discount_pct' => 10, 'discount_note' => 'x'], $staff);
        $this->svc()->refund($x);
        $this->assertCount(2, $this->credited[0]['lines']);   // the fee and its discount
        $y = $this->enrol($o3, $this->person('D'));
        $this->credited[] = ['invoice' => (int) $y->invoice_id];   // the books have credited it already
        $this->fails(fn () => $this->svc()->refund($y), 'credited already');
        $free = $this->enrol($this->offering(), $this->person('E'));
        $this->fails(fn () => $this->svc()->refund($free), 'can not be refunded');
        $z = $this->enrol($o3, $this->person('F'));
        $this->placed = [];   // the order can no longer be matched to the invoice
        $this->fails(fn () => $this->svc()->refund($z), 'no longer matches');
    }

    // ── credits from a membership ─────────────────────────────────────────

    public function test_an_offering_can_be_taken_with_membership_credits_which_come_back_on_cancel(): void
    {
        $o = $this->offeringWithFee(['credit_cost' => 3]);
        $u = $this->person();
        $plan = $this->plan();
        $m = Membership::forceCreate(['number' => 'MB-1', 'plan_id' => $plan->id, 'member_user_id' => $u->id, 'status' => 'active', 'period_from' => '2026-10-01', 'paid_until' => '2026-11-01']);
        CreditEntry::create(['membership_id' => $m->id, 'user_id' => $u->id, 'kind' => 'grant', 'delta' => 5, 'remaining' => 5, 'created_at' => now()]);
        $e = $this->enrol($o, $u, ['use_credits' => true]);
        $this->assertSame(['active', 0.0, 3, 'Paid with credits', null], [$e->status, (float) $e->total, (int) $e->credits_spent, $e->notes, $e->invoice_id]);
        $this->assertSame([], $this->placed);
        $this->assertTrue($this->hasAccess($u, $o));
        $this->assertSame(2, app(\App\Services\Memberships\Credits::class)->balance($u->id));
        $this->svc()->cancel($e);
        $this->assertSame(5, app(\App\Services\Memberships\Credits::class)->balance($u->id));
        $this->fails(fn () => $this->enrol($this->offeringWithFee(), $u, ['use_credits' => true]), 'cannot be taken with credits');
        $this->fails(fn () => $this->enrol($this->offeringWithFee(['credit_cost' => 6]), $u, ['use_credits' => true]), 'credits');
        $this->assertSame(5, app(\App\Services\Memberships\Credits::class)->balance($u->id));
        $this->assertSame(1, Enrolment::count());
    }

    // ── what the screens show ─────────────────────────────────────────────

    public function test_a_student_sees_their_enrolment_without_the_books(): void
    {
        $o = $this->offeringWithFee(['deposit_pct' => 50, 'instalments' => 1, 'refund_days' => 3]);
        $u = $this->person();
        $e = $this->enrol($o, $u);
        $staff = $this->svc()->row($e);
        $this->assertSame([(int) $e->invoice_id, true, true, 'Amina', 'amina@example.com', 580.0, 1160.0], [(int) $staff['invoice_id'], $staff['can_refund'], $staff['refund_open'], $staff['student'], $staff['student_email'], $staff['next_due'], $staff['balance']]);
        $this->assertSame([[580.0, false, false], [580.0, false, false]], array_map(fn ($i) => [$i['amount'], $i['paid'], $i['late']], $staff['instalments']));
        $mine = $this->svc()->row($e, false);
        $this->assertSame([null, null, false], [$mine['invoice_id'], $mine['credit_note_id'], $mine['can_refund']]);
        $this->at('2026-10-13 09:00');
        $this->assertSame([true, false], array_column($this->svc()->row($e->fresh())['instalments'], 'late'));
        $this->svc()->cancel($e->fresh());
        $this->assertSame([0.0, false], [$this->svc()->row($e->fresh())['next_due'], $this->svc()->row($e->fresh())['can_refund']]);
    }

    // ── who may do it (HTTP) ──────────────────────────────────────────────

    public function test_staff_routes_need_the_right_permission(): void
    {
        $o = $this->offeringWithFee();
        $u = $this->person('Student');
        $nobody = $this->staff('Nobody', ['courses.view']);
        Sanctum::actingAs($nobody, ['*']);
        $this->postJson("/api/admin/courses/offerings/{$o->id}/fees", ['amount' => 5, 'ledger_id' => $this->serviceLedger])->assertForbidden();
        $this->postJson("/api/admin/courses/offerings/{$o->id}/enrol", ['student_user_id' => $u->id])->assertForbidden();
        $this->getJson('/api/admin/courses/enrolments')->assertForbidden();
        $clerk = $this->staff('Clerk', ['courses.view', 'courses.enrol']);
        Sanctum::actingAs($clerk, ['*']);
        $this->getJson("/api/admin/courses/offerings/{$o->id}/fees")->assertOk()->assertJsonPath('fees.0.name', 'Tuition');
        $this->postJson("/api/admin/courses/offerings/{$o->id}/fees", ['amount' => 5, 'ledger_id' => $this->serviceLedger])->assertForbidden();
        $id = $this->postJson("/api/admin/courses/offerings/{$o->id}/enrol", ['student_user_id' => $u->id])->assertCreated()->assertJsonPath('enrolment.status', 'pending')->json('enrolment.id');
        $this->assertSame('counter', Enrolment::find($id)->channel);
        $this->postJson("/api/admin/courses/offerings/{$o->id}/enrol", ['student_user_id' => $u->id])->assertStatus(422)->assertJsonPath('message', 'Student is enrolled in this already.');
        $this->postJson("/api/admin/courses/enrolments/{$id}/payment", ['tenders' => [['payment_method_id' => 1, 'amount' => 100]]])->assertOk()->assertJsonPath('enrolment.paid_total', 100);
        $this->postJson("/api/admin/courses/enrolments/{$id}/refund", [])->assertForbidden();
        $this->getJson('/api/admin/courses/enrolments?q=stud')->assertOk()->assertJsonPath('enrolments.0.id', $id);
        $this->assertSame([], $this->getJson('/api/admin/courses/enrolments?status=cancelled')->assertOk()->json('enrolments'));
        $this->getJson('/api/admin/courses/enrolments/meta')->assertOk()->assertJsonPath('can_enrol', true)->assertJsonPath('can_refund', false);
        $boss = $this->staff('Boss', ['courses.view', 'courses.refund']);
        Sanctum::actingAs($boss, ['*']);
        $this->postJson("/api/admin/courses/enrolments/{$id}/cancel", [])->assertForbidden();
        $this->postJson("/api/admin/courses/enrolments/{$id}/refund", ['reason' => 'Ill'])->assertOk()->assertJsonPath('enrolment.status', 'refunded');
        $mgr = $this->staff('Manager', ['courses.view', 'courses.manage']);
        Sanctum::actingAs($mgr, ['*']);
        $this->postJson("/api/admin/courses/offerings/{$o->id}/fees", ['kind' => 'materials', 'amount' => 5, 'ledger_id' => $this->productLedger])->assertOk()->assertJsonCount(2, 'fees');
        $this->postJson("/api/admin/courses/offerings/{$o->id}/enrol", ['student_user_id' => $u->id])->assertForbidden();
    }

    public function test_a_person_enrols_themselves_and_acts_only_on_their_own_enrolments(): void
    {
        $o = $this->offeringWithFee();
        $draft = $this->offeringWithFee(['status' => 'draft']);
        $me = $this->person('Me');
        $them = $this->person('Them');
        $theirs = $this->enrol($o, $them);
        Sanctum::actingAs($me, ['*']);
        $this->postJson("/api/courses/offerings/{$draft->id}/enrol", [])->assertNotFound();
        $this->postJson("/api/courses/offerings/{$draft->id}/quote", [])->assertNotFound();
        $q = $this->postJson("/api/courses/offerings/{$o->id}/quote", [])->assertOk()->json();
        $this->assertSame([1160.0, ['M-Pesa online']], [(float) $q['total'], array_column($q['payment_methods'], 'name')]);
        $r = $this->postJson("/api/courses/offerings/{$o->id}/enrol", ['payment_method_id' => 4, 'phone' => '0799', 'discount_pct' => 50])->assertCreated()->json();   // a discount can not be asked for
        $this->assertSame(['pending', null, 0.0, 701], [$r['enrolment']['status'], $r['enrolment']['invoice_id'], (float) $r['enrolment']['discount_pct'], $r['attempt']['id']]);
        $this->assertSame('0799', $this->started[0]['phone']);
        $mine = $r['enrolment']['id'];
        $this->assertSame([$mine], array_column($this->getJson('/api/courses/my/enrolments')->assertOk()->json('enrolments'), 'id'));
        $this->postJson("/api/courses/enrolments/{$theirs->id}/pay", ['payment_method_id' => 4])->assertNotFound();
        $this->postJson("/api/courses/enrolments/{$mine}/pay", ['payment_method_id' => 4, 'amount' => 10])->assertOk()->assertJsonPath('attempt.amount', 10);
        $this->assertCount(2, $this->started);
        $free = $this->offering();
        $this->postJson("/api/courses/offerings/{$free->id}/enrol", [])->assertCreated()->assertJsonPath('message', 'You are enrolled.');
        $held = $this->offeringWithFee();
        $this->postJson("/api/courses/offerings/{$held->id}/enrol", [])->assertCreated()->assertJsonPath('message', 'Your place is held: pay to confirm it.');
        $kid = $this->person('Kid', false);
        $this->enrol($this->offeringWithFee(), $kid, ['payer_user_id' => $me->id]);
        $this->assertCount(4, $this->getJson('/api/courses/my/enrolments')->json('enrolments'));   // what I pay for counts as mine too
    }
}
