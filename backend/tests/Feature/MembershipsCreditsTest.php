<?php

namespace Tests\Feature;

use App\Models\Memberships\CreditEntry;
use App\Models\Memberships\Membership;
use App\Services\Books\BooksException;
use App\Services\Memberships\Credits;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Memberships step 5: the credit ledger (class passes). "Now" is Monday 12 Oct 2026. */
class MembershipsCreditsTest extends TestCase
{
    use Concerns\CreatesMembershipWorld;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createMembershipWorld();
    }

    private function c(): Credits
    {
        return app(Credits::class);
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

    private function m(string $status = 'active', ?int $user = null, string $from = '2026-10-12', string $until = '2026-11-12'): Membership
    {
        $plan = $this->plan();

        return Membership::forceCreate(['number' => 'MB-'.uniqid(), 'plan_id' => $plan->id, 'member_user_id' => $user ?? $this->person()->id, 'status' => $status, 'period_from' => $from, 'paid_until' => $until]);
    }

    private function grant(Membership $m, int $n, ?string $expires = null): CreditEntry
    {
        return CreditEntry::create(['membership_id' => $m->id, 'user_id' => $m->member_user_id, 'kind' => 'grant', 'delta' => $n, 'remaining' => $n, 'expires_at' => $expires, 'created_at' => now()]);
    }

    public function test_a_period_grants_its_credits_once_expiring_with_the_period_or_rolling_over(): void
    {
        $m = $this->m();
        $this->c()->grantPeriod($m, ['amount' => 4]);
        $this->c()->grantPeriod($m, ['amount' => 4]);
        $g = CreditEntry::sole();
        $this->assertSame(4, $g->remaining);
        $this->assertSame("{$m->id}:2026-10-12", $g->period_key);
        $this->assertSame('2026-11-12 00:00', $g->expires_at->format('Y-m-d H:i'));
        $this->assertSame('Credits for the period from 12 Oct 2026', $g->note);
        $this->assertSame(4, $this->c()->balance($m->member_user_id));
        $m->update(['period_from' => '2026-11-12', 'paid_until' => '2026-12-12']);
        $this->c()->grantPeriod($m->fresh(), ['amount' => 2, 'rollover' => true]);
        $this->assertNull(CreditEntry::orderByDesc('id')->first()->expires_at);
        $this->assertSame(6, $this->c()->balance($m->member_user_id));
        $this->c()->grantPeriod($m->fresh(), ['amount' => 0]);
        $n = $this->m();
        $n->period_from = null;
        $this->c()->grantPeriod($n, ['amount' => 3]);
        $this->assertSame(2, CreditEntry::count());
    }

    public function test_credits_are_only_spendable_in_good_standing(): void
    {
        $m = $this->m();
        $this->grant($m, 5);
        foreach (['trial' => 5, 'past_due' => 5, 'paused' => 0, 'lapsed' => 0, 'pending' => 0, 'cancelled' => 0] as $status => $want) {
            $m->update(['status' => $status]);
            $this->assertSame($want, $this->c()->balance($m->member_user_id), $status);
            $this->assertSame(5 - $want, $this->c()->held($m->member_user_id), $status);
        }
        $this->fails(fn () => $this->c()->spend($m->member_user_id, 1, 'x', 1), 'good standing');
        $m->update(['status' => 'active']);
        $this->licensed = false;   // Memberships switched off: nothing to spend
        $this->assertSame(0, $this->c()->balance($m->member_user_id));
    }

    public function test_a_spend_takes_from_the_grant_that_expires_first(): void
    {
        $m = $this->m();
        $never = $this->grant($m, 3);
        $late = $this->grant($m, 2, '2026-12-01 00:00');
        $soon = $this->grant($m, 2, '2026-10-20 00:00');
        $gone = $this->grant($m, 9, '2026-10-01 00:00');   // already expired
        $this->assertSame(7, $this->c()->balance($m->member_user_id));
        $s = $this->c()->spend($m->member_user_id, 5, 'course_enrolment', 77, str_repeat('n', 250), 4);
        $this->assertSame([['grant_id' => $soon->id, 'n' => 2], ['grant_id' => $late->id, 'n' => 2], ['grant_id' => $never->id, 'n' => 1]], $s->allocations);
        $this->assertSame(-5, $s->delta);
        $this->assertSame('spend', $s->kind);
        $this->assertSame('course_enrolment', $s->source_type);
        $this->assertSame(77, (int) $s->source_id);
        $this->assertSame(200, mb_strlen($s->note));
        $this->assertSame(4, (int) $s->by_user_id);
        $this->assertSame($m->id, (int) $s->membership_id);
        $this->assertSame(2, $never->fresh()->remaining);
        $this->assertSame(9, $gone->fresh()->remaining);
        $this->assertSame(2, $this->c()->balance($m->member_user_id));
        $this->fails(fn () => $this->c()->spend($m->member_user_id, 3, 'x', 1), 'You need 3 credits and have 2.');
        $this->fails(fn () => $this->c()->spend($m->member_user_id, 0, 'x', 1), 'at least one');
        $this->c()->spend($m->member_user_id, 2, 'x', 2);
        $this->assertSame(0, $this->c()->balance($m->member_user_id));
        $this->fails(fn () => $this->c()->spend($m->member_user_id, 1, 'x', 3), 'You need 1 credit and have 0.');
    }

    public function test_giving_back_restores_the_grants_once_and_late_ones_come_back_for_thirty_days(): void
    {
        $m = $this->m();
        $soon = $this->grant($m, 2, '2026-10-15 00:00');
        $never = $this->grant($m, 3);
        $this->c()->spend($m->member_user_id, 4, 'course_enrolment', 9);
        $this->assertSame(0, $this->c()->giveBack('course_enrolment', 8));   // nothing was spent on that
        $this->at('2026-10-16 10:00');   // the soon one has expired meanwhile
        $this->assertSame(4, $this->c()->giveBack('course_enrolment', 9, 'Cancelled'));
        $this->assertSame(0, $this->c()->giveBack('course_enrolment', 9));
        $this->assertSame(3, $never->fresh()->remaining);
        $this->assertSame(0, $soon->fresh()->remaining);
        $back = CreditEntry::where('kind', 'grant')->orderByDesc('id')->first();
        $this->assertSame(2, $back->remaining);
        $this->assertSame(0, $back->delta);
        $this->assertSame('2026-11-15', $back->expires_at->toDateString());
        $refund = CreditEntry::where('kind', 'refund')->sole();
        $this->assertSame(4, $refund->delta);
        $this->assertSame('Cancelled', $refund->note);
        $this->assertSame(5, $this->c()->balance($m->member_user_id));
        // spent again after the give-back: it can be given back again
        $this->at('2026-10-17 10:00');
        $this->c()->spend($m->member_user_id, 1, 'course_enrolment', 9);
        $this->assertSame(1, $this->c()->giveBack('course_enrolment', 9));
    }

    public function test_staff_add_and_take_away_credits_with_a_reason(): void
    {
        $m = $this->m();
        $this->fails(fn () => $this->c()->adjust($m, 0, 'x'), 'between 1 and 1000');
        $this->fails(fn () => $this->c()->adjust($m, 1001, 'x'), 'between 1 and 1000');
        $this->fails(fn () => $this->c()->adjust($m, -1001, 'x'), 'between 1 and 1000');
        $this->fails(fn () => $this->c()->adjust($m, 2, '  '), 'Say why');
        $a = $this->c()->adjust($m, 3, '  Birthday ', 6);
        $this->assertSame(['adjust', 3, 3, 'Birthday', 6], [$a->kind, $a->delta, $a->remaining, $a->note, (int) $a->by_user_id]);
        $this->assertNull($a->expires_at);
        $this->fails(fn () => $this->c()->adjust($m, -4, 'Too many'), 'fewer credits');
        $t = $this->c()->adjust($m, -2, 'Correction');
        $this->assertSame(-2, $t->delta);
        $this->assertNull($t->remaining);
        $this->assertSame(1, $this->c()->balance($m->member_user_id));
        $this->assertSame(1000, $this->c()->adjust($m, 1000, 'Max')->delta);
    }

    public function test_expiry_writes_off_what_ran_out_and_what_an_ended_membership_held(): void
    {
        $m = $this->m();
        $a = $this->grant($m, 2, '2026-10-14 00:00');
        $b = $this->grant($m, 3);
        $ended = $this->m('ended');
        $c = $this->grant($ended, 4);
        $added = $this->c()->adjust($ended, 1, 'Goodwill');
        $this->assertSame(5, $this->c()->expire());   // the ended membership's, now, added ones too
        $this->assertSame(0, $added->fresh()->remaining);
        $this->assertSame(0, $c->fresh()->remaining);
        $this->at('2026-10-14 00:00');
        $this->assertSame(2, $this->c()->expire());   // exactly at its time
        $this->assertSame(0, $a->fresh()->remaining);
        $this->assertSame(3, $b->fresh()->remaining);
        $this->assertSame(0, $this->c()->expire());
        $e = CreditEntry::where('kind', 'expire')->where('membership_id', $m->id)->sole();
        $this->assertSame(-2, $e->delta);
        $this->assertSame('Credits expired', $e->note);
    }

    public function test_the_ledger_and_summary_newest_first(): void
    {
        $m = $this->m();
        $this->grant($m, 4, '2026-11-12 00:00');
        $this->c()->spend($m->member_user_id, 1, 'x', 1, 'Pasta class');
        $s = $this->c()->summary($m->member_user_id);
        $this->assertSame(3, $s['balance']);
        $this->assertSame(0, $s['held']);
        $this->assertSame(['spend', 'grant'], array_column($s['ledger'], 'kind'));
        $this->assertSame(-1, $s['ledger'][0]['delta']);
        $this->assertNull($s['ledger'][0]['expires_at']);
        $this->assertNotNull($s['ledger'][1]['expires_at']);   // a grant with some left shows when it runs out
        $this->assertSame([], $this->c()->ledger(999));
        Schema::drop('membership_credits');
        $this->assertFalse(Credits::installed());
        $this->assertSame([], $this->c()->ledger($m->member_user_id));
        $this->assertSame(0, $this->c()->expire());
        $this->assertSame(0, $this->c()->giveBack('x', 1));
        $this->assertSame(0, $this->c()->balance($m->member_user_id));
        $this->c()->grantPeriod($m, ['amount' => 1]);   // nothing, quietly
    }
    public function test_edges_of_the_credit_rules(): void
    {
        $this->assertSame(['amount' => 1, 'rollover' => false], Credits::validate(['amount' => 1]));
        $this->assertSame(['amount' => 1000, 'rollover' => true], Credits::validate(['amount' => 1000, 'rollover' => 1]));
        $this->fails(fn () => Credits::validate(['amount' => 1001]), '1 to 1000');
        $m = $this->m();
        $this->grant($m, 3, '2026-11-12 00:00:00');
        $this->grant($m, 2);
        $this->c()->adjust($m, -5, 'Taken back in full');   // exactly all of it
        $this->assertSame(0, $this->c()->balance($m->member_user_id));
        $this->assertSame([null, null], array_column(array_filter($this->c()->ledger($m->member_user_id), fn ($r) => $r['kind'] === 'grant'), 'expires_at'));   // used up: no expiry to show
        $g = $this->grant($m, 4, '2026-11-12 00:00:00');
        $row = collect($this->c()->ledger($m->member_user_id))->firstWhere('id', $g->id);
        $this->assertNotNull($row['expires_at']);
        $this->assertNull(collect($this->c()->ledger($m->member_user_id))->firstWhere('kind', 'adjust')['expires_at']);   // taking away has no expiry
    }
}
