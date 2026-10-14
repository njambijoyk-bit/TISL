<?php

namespace Tests\Feature;

use App\Models\Books\Voucher;
use App\Models\Memberships\Membership;
use App\Models\Memberships\MembershipEvent;
use App\Models\Memberships\Period;
use App\Models\Memberships\Plan;
use App\Services\Books\BooksException;
use App\Services\Memberships\MembershipService;
use App\Services\Memberships\MembershipSettings;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Memberships step 2: joining and billing through the books, renewals, late payments, pause, cancel, plan changes, memberships given by staff and refunds. "Now" is Monday 12 Oct 2026. */
class MembershipsBillingTest extends TestCase
{
    use Concerns\CreatesMembershipWorld;

    private array $log = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->createMembershipWorld();
        $this->recordingBenefit($this->log);
    }

    private function svc(): MembershipService
    {
        return app(MembershipService::class);
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

    /** what was taken back (the hourly job hands every running member their benefits again, so grants repeat on purpose) */
    private function revokes(): array
    {
        return array_values(array_filter($this->log, fn ($l) => str_starts_with($l, 'revoke')));
    }

    private function events(Membership $m): array
    {
        return MembershipEvent::where('membership_id', $m->id)->orderBy('id')->pluck('type')->all();
    }

    private function pay(Period $p, ?float $amount = null): Period
    {
        return $this->svc()->takePayment($p->fresh(), [['payment_method_id' => 1, 'amount' => $amount ?? $p->fresh()->owing(), 'reference' => 'X1']]);
    }

    private function joined(Plan $plan, array $o = []): Membership
    {
        $u = $o['user'] ?? $this->person();

        return $this->svc()->join($plan, ['member_user_id' => $u->id] + $o);
    }

    private function sweep(string $when): array
    {
        $this->at($when);

        return $this->svc()->sweep();
    }

    // ── joining ──────────────────────────────────────────────────────────

    public function test_joining_a_paid_plan_makes_an_order_and_an_invoice_with_the_fee_and_the_first_period(): void
    {
        $plan = $this->plan(['name' => 'Gold', 'price' => 1000, 'joining_fee' => 500], [['probe', []]]);
        $u = $this->person();
        $m = $this->svc()->join($plan, ['member_user_id' => $u->id, 'notes' => '  front desk  '], $u, 'counter');
        $this->assertSame('pending', $m->status);
        $this->assertSame('MB-'.str_pad((string) $m->id, 6, '0', STR_PAD_LEFT), $m->number);
        $this->assertSame('counter', $m->channel);
        $this->assertSame('front desk', $m->notes);
        $this->assertSame((int) DB::table('customers')->where('user_id', $u->id)->value('id'), (int) $m->customer_id);
        $this->assertNull($m->payer_user_id);
        $this->assertSame('2026-10-14 12:00', $m->expires_at->timezone('Africa/Nairobi')->format('Y-m-d H:i'));
        $this->assertNull($m->paid_until);
        $order = $this->placed[0];
        $this->assertSame([['type' => 'custom', 'description' => 'Gold — joining fee', 'quantity' => 1, 'rate' => 500.0, 'ledger_id' => $this->serviceLedger],
            ['type' => 'custom', 'description' => 'Gold — monthly', 'quantity' => 1, 'rate' => 1000.0, 'ledger_id' => $this->serviceLedger]], $order['lines']);
        $this->assertSame($m->customer_id, $order['customer_id']);
        $this->assertSame(1, $order['location_id']);
        $this->assertSame($m->id, $order['meta']['membership_id']);
        $this->assertSame('Sales', ucfirst($this->invoices[0]['type']));
        $this->assertFalse($this->invoices[0]['moves_stock']);
        $this->assertSame('2026-10-12', $this->invoices[0]['due_date']);
        $p = Period::where('membership_id', $m->id)->sole();
        $this->assertSame('first', $p->kind);
        $this->assertSame($p->id, $order['meta']['membership_period_id']);
        $this->assertEquals(1740, $p->amount);   // 1500 + 16% tax, from the invoice
        $this->assertSame('open', $p->status);
        $this->assertSame($this->invoices[0]['invoice'], (int) $p->invoice_id);
        $this->assertSame($this->invoices[0]['order'], (int) $p->voucher_id);
        $this->assertSame(['joined'], $this->events($m));
        $this->assertSame(['membership_joined'], $this->sentTo($u->id));
        $this->assertSame([], $this->log);   // nothing is given before it is paid
    }

    public function test_the_joining_fee_has_its_own_account_and_is_charged_once_to_a_person(): void
    {
        $other = DB::table('ledgers')->insertGetId(['name' => 'Joining fees', 'group_id' => 1, 'tax_nature' => 'taxable']);
        $plan = $this->plan(['price' => 1000, 'joining_fee' => 500, 'joining_ledger_id' => $other]);
        $u = $this->person();
        $m = $this->joined($plan, ['user' => $u]);
        $this->assertSame($other, $this->placed[0]['lines'][0]['ledger_id']);
        $this->pay(Period::where('membership_id', $m->id)->sole());
        $this->svc()->cancel($m->fresh(), null, true);
        $again = $this->joined($plan, ['user' => $u]);
        $this->assertCount(1, $this->placed[1]['lines']);
        $this->assertSame('first', Period::where('membership_id', $again->id)->sole()->kind);
        $this->assertSame(['lines' => [['description' => $plan->name.' — monthly', 'amount' => 1000.0]], 'total' => 1160.0, 'trial_days' => 0, 'period_label' => 'monthly', 'free' => false], $this->svc()->quote($plan, $this->person('Other')) === null ? [] : $this->svc()->quote($plan, $u));
    }

    public function test_a_free_plan_starts_at_once_and_gives_its_benefits(): void
    {
        $plan = $this->plan(['price' => 0, 'ledger_id' => null], [['probe', []]]);
        $u = $this->person('Ben', false);   // no customer account is needed for nothing
        $m = $this->joined($plan, ['user' => $u]);
        $this->assertSame('active', $m->status);
        $this->assertSame('2026-10-12', $m->started_on->toDateString());
        $this->assertSame('2026-10-12', $m->period_from->toDateString());
        $this->assertSame('2026-11-12', $m->paid_until->toDateString());
        $this->assertNull($m->expires_at);
        $this->assertSame([], $this->placed);
        $this->assertSame(["grant:probe:{$m->id}"], $this->log);
        $this->assertSame(['joined', 'started'], $this->events($m));
        $this->assertEqualsCanonicalizing(['membership_joined', 'membership_started'], $this->sentTo($u->id));
        $this->assertTrue($this->svc()->quote($plan, $u)['free']);
    }

    public function test_a_trial_without_a_joining_fee_starts_at_once_and_is_given_once(): void
    {
        $plan = $this->plan(['price' => 1000, 'trial_days' => 14]);
        $u = $this->person();
        $this->assertSame(['lines' => [], 'total' => 0.0, 'trial_days' => 14, 'period_label' => 'monthly', 'free' => true], $this->svc()->quote($plan, $u));
        $m = $this->joined($plan, ['user' => $u]);
        $this->assertSame('trial', $m->status);
        $this->assertSame('2026-10-26', $m->trial_ends_on->toDateString());
        $this->assertSame('2026-10-26', $m->paid_until->toDateString());
        $this->assertSame([], $this->placed);
        $this->assertSame(['joined', 'started'], $this->events($m));
        $this->assertSame('trial', MembershipEvent::where('type', 'started')->value('note'));
        // the trial is not given twice: a second membership of the same plan pays its first period
        $this->svc()->cancel($m->fresh(), null, true);
        $this->assertSame(0, $this->svc()->quote($plan, $u)['trial_days']);
        $again = $this->joined($plan, ['user' => $u]);
        $this->assertSame('pending', $again->status);
        $this->assertSame('first', Period::where('membership_id', $again->id)->sole()->kind);
        $this->pay(Period::where('membership_id', $again->id)->sole());
        $this->assertSame('active', $again->fresh()->status);
        $this->assertNull($again->fresh()->trial_ends_on);
    }

    public function test_a_trial_with_a_joining_fee_starts_when_the_fee_is_paid(): void
    {
        $plan = $this->plan(['price' => 1000, 'joining_fee' => 300, 'trial_days' => 7]);
        $m = $this->joined($plan);
        $p = Period::where('membership_id', $m->id)->sole();
        $this->assertSame('joining', $p->kind);
        $this->assertSame('Joining fee', $p->label);
        $this->assertCount(1, $this->placed[0]['lines']);
        $this->at('2026-10-13 09:00');
        $this->pay($p);
        $m = $m->fresh();
        $this->assertSame('trial', $m->status);
        $this->assertSame('2026-10-13', $m->started_on->toDateString());
        $this->assertSame('2026-10-20', $m->paid_until->toDateString());
    }

    public function test_someone_else_can_pay_and_needs_the_customer_account(): void
    {
        $plan = $this->plan();
        $kid = $this->person('Kid', false);
        $parent = $this->person('Parent');
        $m = $this->svc()->join($plan, ['member_user_id' => $kid->id, 'payer_user_id' => $parent->id]);
        $this->assertSame($parent->id, (int) $m->payer_user_id);
        $this->assertSame((int) DB::table('customers')->where('user_id', $parent->id)->value('id'), (int) $m->customer_id);
        $this->assertSame('Parent', $this->placed[0]['meta']['contact']['name']);
        $this->assertContains('membership_joined', $this->sentTo($kid->id));
        $this->assertContains('membership_joined', $this->sentTo($parent->id));
        $this->fails(fn () => $this->svc()->join($plan, ['member_user_id' => $this->person('Solo', false)->id]), 'needs a customer account');
        $this->fails(fn () => $this->svc()->join($this->plan(['trial_days' => 14]), ['member_user_id' => $this->person('Tri', false)->id]), 'needs a customer account');   // the periods after the trial are invoiced
    }

    public function test_joining_is_refused_when_it_should_be(): void
    {
        $plan = $this->plan();
        $this->fails(fn () => $this->svc()->join($this->plan(['status' => 'draft']), ['member_user_id' => $this->person()->id]), 'not open for new members');
        $this->fails(fn () => $this->svc()->join($plan, ['member_user_id' => 999]), 'Choose the member');
        $this->fails(fn () => $this->svc()->join($plan, ['member_user_id' => $this->person('P1')->id, 'payer_user_id' => 999]), 'Choose who pays');
        $u = $this->person('Twice');
        $this->joined($plan, ['user' => $u]);
        $this->fails(fn () => $this->joined($this->plan(), ['user' => $u]), 'holds a membership already');
        $small = $this->plan(['capacity' => 2]);
        $this->joined($small);
        $paused = $this->joined($small);
        $paused->update(['status' => 'paused']);
        $this->fails(fn () => $this->joined($small), 'This plan is full');
        $paused->update(['status' => 'lapsed']);   // lapsed members do not take a place
        $this->joined($small);
        DB::statement('DROP TABLE membership_events');
        $this->fails(fn () => $this->joined($plan), '163_memberships_members.sql');
    }

    // ── money in ─────────────────────────────────────────────────────────

    public function test_payment_at_the_desk_starts_the_membership_on_the_day_it_is_paid(): void
    {
        $plan = $this->plan(['price' => 1000], [['probe', []]]);
        $u = $this->person();
        $m = $this->joined($plan, ['user' => $u]);
        $p = Period::where('membership_id', $m->id)->sole();
        $this->fails(fn () => $this->svc()->takePayment($p, []), 'amount received');
        $this->fails(fn () => $this->svc()->takePayment($p, [['payment_method_id' => 1, 'amount' => 0]]), 'amount received');
        $this->fails(fn () => $this->svc()->takePayment($p, [['payment_method_id' => 1, 'amount' => 1160.02]]), 'more than the 1,160.00');
        $this->at('2026-10-14 10:00');
        $this->svc()->takePayment($p, [['payment_method_id' => 1, 'amount' => 600, 'reference' => 'R1']]);
        $this->assertSame('pending', $m->fresh()->status);
        $this->assertEquals(560, $p->fresh()->owing());
        $this->assertSame([['payment_method_id' => 1, 'amount' => 600.0, 'reference' => 'R1']], $this->receipts[0]['tenders']);
        $this->assertSame(600.0, $this->receipts[0]['amount']);
        $this->assertSame('admin', $this->receipts[0]['channel']);
        $this->assertSame((int) $p->invoice_id, $this->receipts[0]['invoice']);
        $this->svc()->takePayment($p->fresh(), [['payment_method_id' => 1, 'amount' => 360], ['payment_method_id' => 4, 'amount' => 200]]);
        $p = $p->fresh();
        $this->assertSame('paid', $p->status);
        $this->assertSame('2026-10-14', $p->period_from->toDateString());
        $this->assertSame('2026-11-14', $p->period_to->toDateString());
        $m = $m->fresh();
        $this->assertSame('active', $m->status);
        $this->assertSame('2026-10-14', $m->started_on->toDateString());
        $this->assertSame('2026-11-14', $m->paid_until->toDateString());
        $this->assertNull($m->expires_at);
        $this->assertSame(["grant:probe:{$m->id}"], $this->log);
        $this->assertSame(['membership_joined', 'membership_paid', 'membership_paid', 'membership_started'], $this->sentTo($u->id));
        $this->fails(fn () => $this->pay($p, 1), 'nothing to pay');
    }

    public function test_online_payments_go_through_the_gateway_and_come_back_through_the_books(): void
    {
        $plan = $this->plan(['price' => 1000]);
        $u = $this->person();
        $m = $this->joined($plan, ['user' => $u]);
        $p = Period::where('membership_id', $m->id)->sole();
        $this->fails(fn () => $this->svc()->pay($p, []), 'Choose how to pay');
        $this->fails(fn () => $this->svc()->pay($p, ['payment_method_id' => 1]), 'Choose how to pay');   // cash is not offered online
        DB::table('payment_methods')->insert(['id' => 5, 'name' => 'Bank', 'is_online' => true, 'gateway' => 'unknown', 'is_active' => true]);
        $this->fails(fn () => $this->svc()->pay($p, ['payment_method_id' => 5]), "can't be charged automatically");
        $r = $this->svc()->pay($p, ['payment_method_id' => 4]);
        $this->assertSame(['invoice' => (int) $p->invoice_id, 'method' => 'M-Pesa online', 'amount' => 1160.0, 'phone' => '0712000000'], $this->started[0]);
        $this->assertSame(701, $r['attempt']['id']);
        $this->assertStringContainsString('M-Pesa PIN to pay 1,160.00', $r['message']);
        $this->svc()->pay($p, ['payment_method_id' => 4, 'phone' => '0799']);
        $this->assertSame('0799', $this->started[1]['phone']);
        // the gateway's receipt reaches the membership
        $other = Voucher::create(['voucher_type_id' => 2, 'total_amount' => 10, 'meta' => ['something' => 1]]);
        $this->svc()->paid($other, 10);
        $this->assertSame('open', $p->fresh()->status);
        $this->svc()->paid(Voucher::find($p->invoice_id), 1160);
        $this->assertSame('active', $m->fresh()->status);
        $this->fails(fn () => $this->svc()->pay($p->fresh(), ['payment_method_id' => 4]), 'nothing to pay');
    }

    // ── renewals and late payments ───────────────────────────────────────

    private function running(array $planO = [], array $benefits = [['probe', []]]): Membership
    {
        $m = $this->joined($this->plan($planO + ['price' => 1000, 'grace_days' => 3], $benefits));
        $this->pay(Period::where('membership_id', $m->id)->sole());

        return $m->fresh();   // paid up to 12 Nov
    }

    public function test_the_next_period_is_invoiced_a_week_ahead_and_paying_it_moves_the_paid_time_on(): void
    {
        $m = $this->running();
        $u = $m->member_user_id;
        $this->assertSame(0, $this->sweep('2026-11-04 08:00')['renewed']);   // 8 days ahead: not yet
        $r = $this->sweep('2026-11-05 08:00');
        $this->assertSame(1, $r['renewed']);
        $p = Period::where('membership_id', $m->id)->where('kind', 'period')->sole();
        $this->assertSame('2026-11-12', $p->period_from->toDateString());
        $this->assertSame('2026-12-12', $p->period_to->toDateString());
        $this->assertSame('2026-11-12', $p->due_date->toDateString());
        $this->assertSame($m->fresh()->plan->name ?? Plan::find($m->plan_id)->name.' — 12 Nov to 11 Dec 2026', $p->label);
        $this->assertEquals(1160, $p->amount);
        $this->assertSame('2026-11-12', $this->invoices[1]['due_date']);
        $this->assertContains('membership_renewal', $this->sentTo($u));
        $this->assertSame(0, $this->sweep('2026-11-06 08:00')['renewed']);   // once
        $this->log = [];
        $this->pay($p);
        $m = $m->fresh();
        $this->assertSame('active', $m->status);
        $this->assertSame('2026-11-12', $m->period_from->toDateString());
        $this->assertSame('2026-12-12', $m->paid_until->toDateString());
        $this->assertSame(["grant:probe:{$m->id}"], $this->log);   // a benefit given each period is given again
        $this->assertContains('renewed', $this->events($m));
        $this->assertNotContains('reactivated', $this->events($m));
    }

    public function test_reminders_go_before_and_after_the_due_date_once_each(): void
    {
        $m = $this->running();
        $this->sweep('2026-11-05 08:00');
        $this->assertSame(0, $this->sweep('2026-11-08 08:00')['reminded']);
        $this->assertSame(1, $this->sweep('2026-11-09 08:00')['reminded']);   // 3 days before the 12th
        $this->assertSame(0, $this->sweep('2026-11-10 08:00')['reminded']);
        $this->assertSame(0, $this->sweep('2026-11-14 08:00')['reminded']);
        $this->assertSame(1, $this->sweep('2026-11-15 08:00')['reminded']);   // 3 days after
        $this->assertSame(0, $this->sweep('2026-11-15 09:00')['reminded']);
        $this->assertSame(2, collect($this->sent)->where('type', 'membership_reminder')->where('to', $m->member_user_id)->count());
        $this->assertSame(['A membership payment is due', 'Your membership payment is late'], collect($this->sent)->where('type', 'membership_reminder')->pluck('title')->values()->all());
    }

    public function test_unpaid_it_goes_past_due_keeping_the_benefits_then_lapses_and_paying_starts_it_again(): void
    {
        $m = $this->running();
        $this->sweep('2026-11-05 08:00');
        $this->log = [];
        $this->assertSame(0, $this->sweep('2026-11-11 08:00')['past_due']);
        $this->assertSame(1, $this->sweep('2026-11-12 08:00')['past_due']);
        $this->assertSame('past_due', $m->fresh()->status);
        $this->assertSame(0, $this->sweep('2026-11-13 08:00')['past_due']);   // said once
        $this->assertSame([], $this->revokes());   // late, but the benefits stay for the grace days
        $this->assertSame(0, $this->sweep('2026-11-15 08:00')['lapsed']);   // the 3 grace days
        $this->assertSame(1, $this->sweep('2026-11-16 08:00')['lapsed']);
        $this->assertSame('lapsed', $m->fresh()->status);
        $this->assertSame(["revoke:probe:{$m->id}"], $this->revokes());
        $this->assertSame(0, $this->sweep('2026-11-17 08:00')['lapsed']);
        $this->assertContains('membership_past_due', $this->sentTo($m->member_user_id));
        $this->assertContains('membership_lapsed', $this->sentTo($m->member_user_id));
        $this->log = [];
        $p = Period::where('membership_id', $m->id)->where('kind', 'period')->sole();
        $this->at('2026-11-20 10:00');
        $this->pay($p);
        $m = $m->fresh();
        $this->assertSame('active', $m->status);
        $this->assertSame('2026-11-20', $m->period_from->toDateString());
        $this->assertSame('2026-12-20', $m->paid_until->toDateString());
        $this->assertSame('2026-11-20', $p->fresh()->period_from->toDateString());
        $this->assertSame(["grant:probe:{$m->id}"], $this->log);
        $this->assertContains('reactivated', $this->events($m));
    }

    public function test_a_late_payment_inside_the_grace_days_carries_on_without_a_gap(): void
    {
        $m = $this->running();
        $this->sweep('2026-11-05 08:00');
        $this->sweep('2026-11-13 08:00');
        $this->at('2026-11-14 10:00');
        $this->pay(Period::where('membership_id', $m->id)->where('kind', 'period')->sole());
        $m = $m->fresh();
        $this->assertSame('active', $m->status);
        $this->assertSame('2026-12-12', $m->paid_until->toDateString());
        $this->assertNotContains('reactivated', $this->events($m));
    }

    public function test_a_plan_that_does_not_renew_a_cancelled_one_and_a_given_one_end_on_time(): void
    {
        $once = $this->running(['auto_renew' => false]);
        $this->assertSame(0, $this->sweep('2026-11-05 08:00')['ended']);
        $this->assertSame([], Period::where('membership_id', $once->id)->where('kind', 'period')->pluck('id')->all());   // no renewal for a plan that does not renew
        $this->log = [];
        $this->assertSame(0, $this->sweep('2026-11-11 23:00')['ended']);
        $this->assertSame(1, $this->sweep('2026-11-12 08:00')['ended']);
        $this->assertSame('ended', $once->fresh()->status);
        $this->assertSame(["revoke:probe:{$once->id}"], $this->revokes());
        $this->assertContains('membership_ended', $this->sentTo($once->member_user_id));
    }

    public function test_cancelling_for_the_end_voids_the_open_renewal_and_ends_it_then(): void
    {
        $m = $this->running();
        $this->sweep('2026-11-05 08:00');
        $p = Period::where('membership_id', $m->id)->where('kind', 'period')->sole();
        $m = $this->svc()->cancel($m->fresh(), '  moving away  ');
        $this->assertTrue($m->cancel_at_end);
        $this->assertSame('moving away', $m->cancel_reason);
        $this->assertSame('active', $m->status);
        $this->assertSame('void', $p->fresh()->status);
        $this->assertContains((int) $p->invoice_id, $this->cancelled);
        $this->assertContains((int) $p->voucher_id, $this->cancelled);
        $this->fails(fn () => $this->svc()->cancel($m->fresh()), 'set to end when the paid time runs out already');
        $m = $this->svc()->keep($m);
        $this->assertFalse($m->cancel_at_end);
        $this->assertNull($m->cancel_reason);
        $this->fails(fn () => $this->svc()->keep($m), 'not set to end');
        $this->svc()->cancel($m);
        $this->assertSame(0, $this->sweep('2026-11-10 08:00')['renewed']);
        $this->sweep('2026-11-12 08:00');
        $this->assertSame('cancelled', $m->fresh()->status);
        $this->assertSame(['joined', 'started', 'renewal_invoiced', 'cancel_requested', 'kept', 'cancel_requested', 'ended'], $this->events($m));
    }

    public function test_a_membership_given_for_a_time_ends_and_a_free_plan_renews_without_an_invoice(): void
    {
        $plan = $this->plan(['price' => 0, 'ledger_id' => null]);
        $free = $this->joined($plan);
        $this->sweep('2026-11-05 08:00');
        $free = $free->fresh();
        $this->assertSame('2026-12-12', $free->paid_until->toDateString());
        $this->assertSame('2026-11-12', $free->period_from->toDateString());
        $this->assertSame([], $this->placed);
        $this->assertContains('renewed', $this->events($free));
        $this->at('2026-11-06 10:00');
        $given = $this->svc()->give($this->plan(), $this->person('Guest'), Carbon::parse('2026-11-20'), 'Prize');
        $this->sweep('2026-11-19 08:00');
        $this->assertSame('active', $given->fresh()->status);
        $this->sweep('2026-11-20 08:00');
        $this->assertSame('ended', $given->fresh()->status);
    }

    public function test_an_unpaid_new_membership_lets_go_after_the_pending_time_but_not_one_with_money_in(): void
    {
        $plan = $this->plan();
        $a = $this->joined($plan);
        $b = $this->joined($plan);
        $this->svc()->takePayment(Period::where('membership_id', $b->id)->sole(), [['payment_method_id' => 1, 'amount' => 100]]);
        $this->assertSame(0, $this->sweep('2026-10-14 11:59')['released']);
        $r = $this->sweep('2026-10-14 12:01');
        $this->assertSame(1, $r['released']);
        $this->assertSame('cancelled', $a->fresh()->status);
        $this->assertSame('pending', $b->fresh()->status);
        $this->assertContains((int) Period::where('membership_id', $a->id)->value('invoice_id'), $this->cancelled);
        $this->fails(fn () => $this->svc()->cancel($b->fresh()), 'Part of the first payment is in');
        MembershipSettings::save(['pending_hours' => 0], null);
        $c = $this->joined($plan);
        $this->assertNull($c->expires_at);
    }

    public function test_a_trial_turns_active_when_it_ends_and_a_paid_renewal_keeps_it(): void
    {
        $m = $this->joined($this->plan(['price' => 1000, 'trial_days' => 14]));
        $this->sweep('2026-10-19 08:00');   // 7 days before the trial ends: the first period is invoiced
        $this->assertSame('trial', $m->fresh()->status);
        $p = Period::where('membership_id', $m->id)->where('kind', 'period')->sole();
        $this->assertSame('2026-10-26', $p->period_from->toDateString());
        $this->pay($p);
        $this->assertSame('trial', $m->fresh()->status);
        $this->assertSame('2026-11-26', $m->fresh()->paid_until->toDateString());
        $this->sweep('2026-10-26 08:00');
        $this->assertSame('active', $m->fresh()->status);
    }

    // ── pause ────────────────────────────────────────────────────────────

    public function test_pausing_moves_the_paid_time_out_by_the_days_paused(): void
    {
        $m = $this->running();
        $this->log = [];
        $this->fails(fn () => $this->svc()->pause($m, 0), '1 to 365');
        $this->fails(fn () => $this->svc()->pause($m, 366, null, true), '1 to 365');
        $this->fails(fn () => $this->svc()->pause($m, 61), 'up to 60 days a year; 60 are left');
        $m = $this->svc()->pause($m, 20);
        $this->assertSame('paused', $m->status);
        $this->assertSame('2026-11-01', $m->paused_until->toDateString());
        $this->assertSame(20, $m->pause_days_used);
        $this->assertSame(2026, $m->pause_year);
        $this->assertSame(["revoke:probe:{$m->id}"], $this->log);
        $this->assertContains('membership_paused', $this->sentTo($m->member_user_id));
        $this->fails(fn () => $this->svc()->pause($m, 1), 'Only a running membership');
        $this->at('2026-10-22 09:00');   // back after 10 of the 20 days
        $m = $this->svc()->resume($m);
        $this->assertSame('active', $m->status);
        $this->assertSame('2026-11-22', $m->paid_until->toDateString());
        $this->assertSame(10, $m->pause_days_used);
        $this->assertNull($m->paused_from);
        $this->assertSame(["revoke:probe:{$m->id}", "grant:probe:{$m->id}"], $this->log);
        $this->fails(fn () => $this->svc()->resume($m), 'not paused');
        $this->fails(fn () => $this->svc()->pause($m, 51), '50 are left');
        $this->assertSame('paused', $this->svc()->pause($m, 51, null, true)->status);   // staff may go over
    }

    public function test_a_pause_ends_by_itself_and_the_allowance_starts_again_each_year(): void
    {
        $m = $this->running();
        $m = $this->svc()->pause($m, 60);   // until 11 Dec
        $this->assertSame(0, $this->sweep('2026-12-10 08:00')['resumed']);
        $this->assertSame('paused', $m->fresh()->status);
        $this->assertSame(1, $this->sweep('2026-12-11 08:00')['resumed']);
        $m = $m->fresh();
        $this->assertSame('active', $m->status);
        $this->assertSame('2027-01-11', $m->paid_until->toDateString());
        $this->sweep('2027-01-04 10:00');   // a week before 11 Jan: the next period is invoiced
        $this->pay(Period::where('membership_id', $m->id)->where('kind', 'period')->sole());
        $this->assertSame('paused', $this->svc()->pause($m->fresh(), 30)->status);   // a new year: 60 days again
        $this->assertSame(2027, $m->fresh()->pause_year);
        $this->assertSame(30, $m->fresh()->pause_days_used);
    }

    public function test_members_may_not_pause_when_the_setting_says_so_or_with_an_invoice_open(): void
    {
        $m = $this->running();
        $this->sweep('2026-11-05 08:00');
        $this->fails(fn () => $this->svc()->pause($m->fresh(), 5), 'Pay the open invoice first');
        $n = $this->running();
        MembershipSettings::save(['pause_days_per_year' => 0], null);
        $this->fails(fn () => $this->svc()->pause($n, 5), 'cannot pause');
        $this->assertSame('paused', $this->svc()->pause($n, 5, null, true)->status);
    }

    // ── ending ───────────────────────────────────────────────────────────

    public function test_cancelling_a_new_unpaid_membership_cancels_its_invoice(): void
    {
        $m = $this->joined($this->plan());
        $p = Period::where('membership_id', $m->id)->sole();
        $m = $this->svc()->cancel($m, 'changed my mind');
        $this->assertSame('cancelled', $m->status);
        $this->assertNull($m->paid_until);
        $this->assertSame('void', $p->fresh()->status);
        $this->assertSame([(int) $p->invoice_id, (int) $p->voucher_id], $this->cancelled);
        $this->assertContains('membership_ended', $this->sentTo($m->member_user_id));
    }

    public function test_staff_can_end_a_membership_today(): void
    {
        $m = $this->running();
        $this->log = [];
        $m = $this->svc()->cancel($m, 'rules', true);
        $this->assertSame('cancelled', $m->status);
        $this->assertSame('2026-10-12', $m->paid_until->toDateString());
        $this->assertFalse($m->cancel_at_end);
        $this->assertSame(["revoke:probe:{$m->id}"], $this->log);
        $this->assertSame('paid', Period::where('membership_id', $m->id)->sole()->status);   // money paid is left for a refund
    }

    // ── changing plan ────────────────────────────────────────────────────

    public function test_a_downgrade_waits_for_the_renewal_which_is_invoiced_at_the_new_price(): void
    {
        $this->log = [];
        $m = $this->running();
        $cheap = $this->plan(['price' => 500], [['probe', []]]);
        $m = $this->svc()->changePlan($m, $cheap);
        $this->assertSame($cheap->id, (int) $m->change_to_plan_id);
        $this->assertNotSame($cheap->id, (int) $m->plan_id);
        $this->fails(fn () => $this->svc()->changePlan($m, $this->plan(['price' => 400])), 'change already waiting');
        $this->log = [];
        $this->sweep('2026-11-05 08:00');
        $m = $m->fresh();
        $this->assertSame($cheap->id, (int) $m->plan_id);
        $this->assertNull($m->change_to_plan_id);
        $this->assertEquals(580, Period::where('membership_id', $m->id)->where('kind', 'period')->value('amount'));
        $this->assertSame(["revoke:probe:{$m->id}", "grant:probe:{$m->id}"], array_slice($this->log, 0, 2));   // the old plan's benefits go, the new one's come
        $this->assertContains('plan_changed', $this->events($m));
    }

    public function test_an_upgrade_is_invoiced_for_the_rest_of_the_period_and_switches_when_paid(): void
    {
        $m = $this->running(['price' => 1000]);   // 12 Oct to 12 Nov: 31 days
        $gold = $this->plan(['name' => 'Platinum', 'price' => 3100]);   // from 22 Oct: 31 days to 22 Nov
        $this->at('2026-10-22 10:00');
        $m = $this->svc()->changePlan($m, $gold);
        $p = Period::where('membership_id', $m->id)->where('kind', 'upgrade')->sole();
        $expected = round((3100 / 31 - 1000 / 31) * 21, 2);   // 21 days left
        $this->assertSame([['type' => 'custom', 'description' => 'Platinum — upgrade for 21 days', 'quantity' => 1, 'rate' => $expected, 'ledger_id' => $this->serviceLedger]], end($this->placed)['lines']);
        $this->assertSame('Upgrade to Platinum', $p->label);
        $this->assertSame('2026-11-12', $p->period_to->toDateString());
        $this->assertSame($gold->id, (int) $m->change_to_plan_id);
        $this->assertNotSame($gold->id, (int) $m->plan_id);
        $this->fails(fn () => $this->svc()->pause($m, 3), 'Pay the open invoice first');
        $this->log = [];
        $this->pay($p);
        $m = $m->fresh();
        $this->assertSame($gold->id, (int) $m->plan_id);
        $this->assertNull($m->change_to_plan_id);
        $this->assertSame('2026-11-12', $m->paid_until->toDateString());   // the paid time does not move
        $this->assertContains('upgraded', $this->events($m));
    }

    public function test_a_tiny_upgrade_switches_at_once_and_bad_changes_are_refused(): void
    {
        $m = $this->running(['price' => 1000]);
        $this->at('2026-11-11 10:00');   // one day left
        $near = $this->plan(['price' => 990], [['probe', []]]);   // a day of it costs 33.00 against 32.26: under one shilling more
        $this->log = [];
        $m = $this->svc()->changePlan($m, $near);
        $this->assertSame($near->id, (int) $m->plan_id);
        $this->assertSame(["revoke:probe:{$m->id}", "grant:probe:{$m->id}"], $this->log);
        $this->fails(fn () => $this->svc()->changePlan($m, $near), 'on this plan already');
        $this->fails(fn () => $this->svc()->changePlan($m, $this->plan(['status' => 'draft'])), 'not open');
        $full = $this->plan(['capacity' => 1]);
        $this->joined($full);
        $this->fails(fn () => $this->svc()->changePlan($m, $full), 'full');
        $this->svc()->cancel($m);
        $this->fails(fn () => $this->svc()->changePlan($m->fresh(), $this->plan()), 'set to end');
        $given = $this->svc()->give($this->plan(), $this->person('G'), null, 'Staff');
        $this->fails(fn () => $this->svc()->changePlan($given, $this->plan()), 'billed');
        $pending = $this->joined($this->plan());
        $this->fails(fn () => $this->svc()->changePlan($pending, $this->plan()), 'running');
    }

    // ── given by staff, and refunds ──────────────────────────────────────

    public function test_staff_can_give_a_membership_without_billing(): void
    {
        $plan = $this->plan([], [['probe', []]]);
        $u = $this->person('Gift');
        $this->fails(fn () => $this->svc()->give($plan, $u, null, '  '), 'Say why');
        $this->fails(fn () => $this->svc()->give($plan, $u, Carbon::parse('2026-10-12'), 'Prize'), 'after today');
        $m = $this->svc()->give($plan, $u, null, 'Competition prize', $u);
        $this->assertSame('active', $m->status);
        $this->assertSame('none', $m->billing);
        $this->assertSame('counter', $m->channel);
        $this->assertSame('2026-11-12', $m->paid_until->toDateString());
        $this->assertSame('Competition prize', $m->notes);
        $this->assertSame(["grant:probe:{$m->id}"], $this->log);
        $this->assertSame([], $this->placed);
        $this->assertSame('2027-01-31', $this->svc()->give($plan, $this->person('Long'), Carbon::parse('2027-01-31 15:00'), 'VIP')->paid_until->toDateString());
        $this->fails(fn () => $this->svc()->give($plan, $u, null, 'Again'), 'holds a membership already');
        $this->assertSame(0, $this->sweep('2026-11-05 08:00')['renewed']);   // never invoiced
    }

    public function test_a_refund_credits_the_invoice_and_ends_the_membership_today(): void
    {
        $m = $this->running();
        $this->sweep('2026-11-05 08:00');
        $first = Period::where('membership_id', $m->id)->where('kind', 'first')->sole();
        $open = Period::where('membership_id', $m->id)->where('kind', 'period')->sole();
        $this->fails(fn () => $this->svc()->refund($open), 'Only a paid joining or renewal invoice');
        $this->log = [];
        $this->at('2026-11-06 10:00');
        $m = $this->svc()->refund($first, null, '  Moving abroad ');
        $this->assertSame('cancelled', $m->status);
        $this->assertSame('Moving abroad', $m->cancel_reason);
        $this->assertSame('2026-11-06', $m->paid_until->toDateString());
        $this->assertSame('refunded', $first->fresh()->status);
        $this->assertNotNull($first->fresh()->credit_note_id);
        $this->assertSame('void', $open->fresh()->status);
        $this->assertCount(1, $this->credited);
        $this->assertSame([['item_id' => $first->invoice_id * 100, 'mode' => 'return', 'quantity' => 1]], $this->credited[0]['lines']);
        $this->assertSame('Moving abroad', $this->credited[0]['reason']);
        $this->assertSame(["revoke:probe:{$m->id}"], $this->log);
        $this->assertContains('refunded', $this->events($m));
        $this->assertStringContainsString('refunded', collect($this->sent)->where('type', 'membership_ended')->last()['message']);
        $first->update(['status' => 'paid']);
        $this->fails(fn () => $this->svc()->refund($first->fresh()), 'credited already');
    }

    // ── showing ──────────────────────────────────────────────────────────

    public function test_the_row_and_the_list(): void
    {
        $m = $this->running();
        $this->sweep('2026-11-05 08:00');
        $row = $this->svc()->row($m->fresh(), true, true);
        $this->assertSame('Active', $row['status_label']);
        $this->assertSame('2026-11-11', $row['last_day']);
        $this->assertSame('monthly', $row['period_label']);
        $this->assertTrue($row['has_benefits']);
        $this->assertTrue($row['can_pause']);
        $this->assertTrue($row['can_cancel']);
        $this->assertSame('period', $row['open']['kind']);
        $this->assertEquals(1160, $row['open']['owing']);
        $this->assertCount(2, $row['periods']);
        $this->assertTrue($row['periods'][0]['can_refund']);
        $this->assertFalse($row['periods'][1]['can_refund']);
        $this->assertArrayHasKey('events', $row);
        $this->assertArrayNotHasKey('events', $this->svc()->row($m->fresh(), false, true));
        $this->assertFalse($this->svc()->row($m->fresh(), false, true)['periods'][0]['can_refund']);
        $this->assertArrayNotHasKey('periods', $this->svc()->row($m->fresh()));
        $other = $this->joined($this->plan(), ['user' => $this->person('Zed Banda')]);
        $this->assertSame(2, $this->svc()->list()['total']);
        $this->assertSame([$other->id], array_column($this->svc()->list(['q' => 'Banda'])['memberships'], 'id'));
        $this->assertSame([$other->id], array_column($this->svc()->list(['q' => $other->number])['memberships'], 'id'));
        $this->assertSame([$m->id], array_column($this->svc()->list(['status' => 'active'])['memberships'], 'id'));
        $this->assertSame([$other->id], array_column($this->svc()->list(['plan_id' => $other->plan_id])['memberships'], 'id'));
        MembershipSettings::save(['allow_member_cancel' => false, 'pause_days_per_year' => 0], null);
        $row = $this->svc()->row($m->fresh());
        $this->assertFalse($row['can_cancel']);
        $this->assertFalse($row['can_pause']);
    }
    // ── edges the mutation run asked about ───────────────────────────────

    public function test_a_renewal_paid_on_the_day_its_period_ends_runs_from_that_day(): void
    {
        $m = $this->running();
        $this->sweep('2026-11-05 08:00');
        $p = Period::where('membership_id', $m->id)->where('kind', 'period')->sole();   // 12 Nov to 12 Dec
        $this->at('2026-12-12 09:00');
        $this->pay($p);
        $this->assertSame(['2026-12-12', '2027-01-12'], [$m->fresh()->period_from->toDateString(), $m->fresh()->paid_until->toDateString()]);
    }

    public function test_on_the_day_a_trial_ends_a_renewal_or_a_resume_makes_it_active(): void
    {
        $m = $this->joined($this->plan(['price' => 1000, 'trial_days' => 14]));   // trial to 26 Oct
        $this->sweep('2026-10-19 08:00');
        $this->at('2026-10-26 09:00');
        $this->pay(Period::where('membership_id', $m->id)->where('kind', 'period')->sole());
        $this->assertSame('active', $m->fresh()->status);
        $this->at('2026-10-12 12:00');
        $n = $this->joined($this->plan(['price' => 1000, 'trial_days' => 14]), ['user' => $this->person('B')]);
        $n = $this->svc()->pause($n, 7, null, true);
        $this->at('2026-10-26 09:00');
        $this->assertSame('active', $this->svc()->resume($n)->status);
    }

    public function test_a_pause_is_from_one_day_to_a_year_and_a_one_day_allowance_works(): void
    {
        $this->assertSame('2027-10-12', $this->svc()->pause($this->running(), 365, null, true)->paused_until->toDateString());
        MembershipSettings::save(['pause_days_per_year' => 1], null);
        $m = $this->running();
        $this->fails(fn () => $this->svc()->pause($m, 2), 'up to 1 days a year');
        $this->assertSame('2026-10-13', $this->svc()->pause($m, 1)->paused_until->toDateString());
    }

    public function test_a_renewal_that_cannot_be_invoiced_still_runs_out(): void
    {
        $u = $this->person('NoAccount', false);
        $plan = $this->plan(['price' => 0, 'grace_days' => 3]);
        $m = $this->svc()->join($plan, ['member_user_id' => $u->id]);   // free: no customer account needed
        $this->assertSame('active', $m->status);
        $plan->update(['price' => 1000]);
        $this->assertSame(0, $this->sweep('2026-11-05 08:00')['renewed']);   // no account to invoice
        $this->assertSame(0, Period::where('membership_id', $m->id)->count());
        $this->assertSame('active', $m->fresh()->status);
        $this->sweep('2026-11-12 08:00');
        $this->assertSame('past_due', $m->fresh()->status);
        $this->sweep('2026-11-16 08:00');
        $this->assertSame('lapsed', $m->fresh()->status);
    }

    public function test_a_membership_first_seen_late_on_its_last_grace_day_is_past_due(): void
    {
        $m = $this->running();   // paid to 12 Nov, 3 days' grace: lapses after 15 Nov
        $this->assertSame(1, $this->sweep('2026-11-15 08:00')['past_due']);
        $this->assertSame('past_due', $m->fresh()->status);
    }

    public function test_the_first_reminder_still_goes_on_the_due_date_and_the_late_one_not_before_the_day_after(): void
    {
        $m = $this->running();
        $n = $this->running(['name' => 'Other'], []);
        $this->sweep('2026-11-05 08:00');   // both invoiced, due 12 Nov
        Period::where('membership_id', $n->id)->where('kind', 'period')->update(['reminded_before_at' => now()]);
        MembershipSettings::save(['remind_after_days' => 0], null);
        $this->assertSame(1, $this->sweep('2026-11-12 08:00')['reminded']);   // the first sweep since: the one due today is still told
        $this->assertSame([$m->member_user_id], collect($this->sent)->where('type', 'membership_reminder')->pluck('to')->values()->all());
        $this->assertNull(Period::where('membership_id', $n->id)->where('kind', 'period')->value('reminded_after_at'));   // not late on the day it is due
        $this->sweep('2026-11-13 08:00');
        $this->assertNotNull(Period::where('membership_id', $n->id)->where('kind', 'period')->value('reminded_after_at'));
    }

    public function test_a_part_paid_upgrade_survives_a_cancel_and_paying_the_rest_changes_nothing(): void
    {
        $m = $this->running(['price' => 1000]);
        $this->at('2026-10-22 10:00');
        $m = $this->svc()->changePlan($m, $this->plan(['name' => 'Platinum', 'price' => 3100]));
        $up = Period::where('membership_id', $m->id)->where('kind', 'upgrade')->sole();
        $this->pay($up, 100);
        $this->svc()->cancel($m->fresh());   // at the end of the paid time
        $this->assertSame('open', $up->fresh()->status);   // money is in: not voided
        $this->assertNotContains((int) $up->invoice_id, $this->cancelled);
        $this->assertNull($m->fresh()->change_to_plan_id);
        $plan = $m->fresh()->plan_id;
        $this->pay($up);
        $this->assertSame(['paid', $plan], [$up->fresh()->status, $m->fresh()->plan_id]);
    }

    public function test_a_plan_at_the_same_price_a_day_waits_and_an_upgrade_of_exactly_one_shilling_is_invoiced(): void
    {
        $m = $this->running(['price' => 1000]);
        $n = $this->running(['price' => 1000]);
        $this->at('2026-10-22 10:00');
        $same = $this->plan(['name' => 'Same', 'price' => 1000]);
        $m = $this->svc()->changePlan($m, $same);
        $this->assertSame($same->id, (int) $m->change_to_plan_id);
        $this->assertNotSame($same->id, (int) $m->plan_id);
        $this->at('2026-11-11 10:00');   // one day left; a day of 997.74 a month (30 days) is 33.258 against 32.258
        $n = $this->svc()->changePlan($n, $this->plan(['price' => 997.74]));
        $this->assertSame(1, Period::where('membership_id', $n->id)->where('kind', 'upgrade')->count());
        $this->assertSame(1.0, end($this->placed)['lines'][0]['rate']);
    }

    public function test_a_membership_that_is_over_can_not_be_cancelled_again(): void
    {
        $m = $this->svc()->cancel($this->running(), null, true);
        $this->fails(fn () => $this->svc()->cancel($m), 'over already');
    }

    public function test_a_free_plan_with_a_joining_fee_charges_only_the_fee(): void
    {
        $m = $this->joined($this->plan(['price' => 0, 'joining_fee' => 500]));
        $p = Period::where('membership_id', $m->id)->sole();
        $this->assertSame(['joining', 'Joining fee'], [$p->kind, $p->label]);
    }

    public function test_a_refund_of_an_invoice_paid_at_once_says_where_the_money_goes_back_from(): void
    {
        $this->paidAtOnce = true;
        $m = $this->running();
        $this->svc()->refund(Period::where('membership_id', $m->id)->sole());
        $this->assertSame(9, $this->credited[0]['refund_ledger_id']);   // the books' default
        $n = $this->running();
        $this->svc()->refund(Period::where('membership_id', $n->id)->sole(), null, null, 12);
        $this->assertSame(12, $this->credited[1]['refund_ledger_id']);
    }

    public function test_the_detail_row_shows_credits_to_both_and_check_ins_to_staff_only(): void
    {
        $m = $this->running();
        $this->assertArrayHasKey('credits', $this->svc()->row($m, false, true));
        $this->assertArrayNotHasKey('checkins', $this->svc()->row($m, false, true));
        $this->assertArrayHasKey('checkins', $this->svc()->row($m, true, true));
    }

    public function test_a_plan_with_one_place_left_is_not_full(): void
    {
        $plan = $this->plan(['capacity' => 2]);
        $this->joined($plan);
        $row = collect($this->svc()->publicPlans())->firstWhere('id', $plan->id);
        $this->assertSame([1, false], [$row['places_left'], $row['full']]);
        $this->joined($plan, ['user' => $this->person('B')]);
        $row = collect($this->svc()->publicPlans())->firstWhere('id', $plan->id);
        $this->assertSame([0, true], [$row['places_left'], $row['full']]);
    }
}
