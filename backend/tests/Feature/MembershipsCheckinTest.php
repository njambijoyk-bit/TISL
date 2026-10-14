<?php

namespace Tests\Feature;

use App\Models\Memberships\Checkin;
use App\Models\Memberships\CreditEntry;
use App\Models\Memberships\Membership;
use App\Services\Books\BooksException;
use App\Services\Codes\CodeResolvers;
use App\Services\Codes\Signed;
use App\Services\Memberships\MemberCheckIn;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Memberships step 6: the member card and checking members in at a branch. */
class MembershipsCheckinTest extends TestCase
{
    use Concerns\CreatesMembershipWorld;
    use Concerns\StandsInForAccess;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createMembershipWorld();
        $this->standInAccess();
    }

    private function ck(): MemberCheckIn
    {
        return app(MemberCheckIn::class);
    }

    private function m(string $status = 'active', array $plan = [], ?\App\Models\User $u = null): Membership
    {
        $p = $this->plan($plan + ['name' => 'Gym']);

        return Membership::forceCreate(['number' => 'MB-'.uniqid(), 'plan_id' => $p->id, 'member_user_id' => ($u ?? $this->person())->id, 'status' => $status, 'period_from' => '2026-10-01', 'paid_until' => '2026-11-01', 'paused_until' => $status === 'paused' ? '2026-10-20' : null]);
    }

    public function test_the_card_is_a_signed_code_that_belongs_to_the_person(): void
    {
        $code = MemberCheckIn::code(42);
        $this->assertStringStartsWith('mem.42.', $code);
        $this->assertSame(42, MemberCheckIn::find($code));
        $this->assertSame(42, MemberCheckIn::find(Signed::url('mem', 42)));   // the whole address from the QR
        $this->assertNull(MemberCheckIn::find('mem.43.'.explode('.', $code)[2]));   // another person with this signature
        $this->assertNull(MemberCheckIn::find(Signed::make('tk', 42)));   // a ticket is not a member card
        $this->assertNull(MemberCheckIn::find(Signed::make('mem', 'AB12')));   // genuine, but not a person
        $this->assertNull(MemberCheckIn::find('nonsense'));
    }

    public function test_a_member_in_good_standing_is_let_in_and_a_second_scan_is_the_same_visit(): void
    {
        $m = $this->m();
        $staff = $this->person('Door');
        $r = $this->ck()->check($m->member_user_id, 1, $staff);
        $this->assertTrue($r['ok']);
        $this->assertFalse($r['repeat']);
        $this->assertNull($r['reason']);
        $this->assertNull($r['warning']);
        $this->assertSame('Gym', $r['plan']);
        $this->assertSame('Active', $r['status_label']);
        $this->assertSame('2026-10-31', $r['last_day']);
        $this->assertSame(0, $r['credits']);
        $this->assertSame(1, $r['visits_30_days']);
        $row = Checkin::sole();
        $this->assertSame(['ok', 'card', 1, $staff->id, $m->id], [$row->result, $row->method, (int) $row->location_id, (int) $row->by_user_id, (int) $row->membership_id]);
        $this->at('2026-10-12 12:09');
        $again = $this->ck()->check($m->member_user_id, 1, $staff, 'manual');
        $this->assertTrue($again['repeat']);
        $this->assertSame($row->id, $again['checkin_id']);
        $this->assertSame(1, Checkin::count());
        $this->assertFalse($this->ck()->check($m->member_user_id, 2, $staff)['repeat']);   // another branch is another visit
        $this->at('2026-10-12 12:21');
        $this->assertFalse($this->ck()->check($m->member_user_id, 1, $staff, 'manual')['repeat']);
        $this->assertSame('manual', Checkin::orderByDesc('id')->first()->method);
        $this->assertSame(3, $this->ck()->check($m->member_user_id, 1)['visits_30_days']);
    }

    public function test_who_is_turned_away_and_why(): void
    {
        $this->assertSame('No membership.', $this->ck()->check($this->person('Nobody')->id, 1)['reason']);
        $this->assertSame('The membership has not been paid yet.', $this->ck()->check($this->m('pending')->member_user_id, 1)['reason']);
        $this->assertSame('The membership is paused until 20 Oct.', $this->ck()->check($this->m('paused')->member_user_id, 1)['reason']);
        $this->assertSame('The membership has lapsed: a payment is missing.', $this->ck()->check($this->m('lapsed')->member_user_id, 1)['reason']);
        $this->assertSame('The membership has ended.', $this->ck()->check($this->m('cancelled')->member_user_id, 1)['reason']);
        $this->assertSame('The membership has ended.', $this->ck()->check($this->m('ended')->member_user_id, 1)['reason']);
        $karen = $this->m('active', ['all_branches' => false, 'branch_ids' => [2]]);
        $r = $this->ck()->check($karen->member_user_id, 1);
        $this->assertFalse($r['ok']);
        $this->assertSame('This plan is not valid at this branch.', $r['reason']);
        $this->assertNull($r['credits']);
        $this->assertTrue($this->ck()->check($karen->member_user_id, 2)['ok']);
        $this->assertTrue($this->ck()->check($karen->member_user_id, null)['ok']);   // no branch chosen: not checked
        $late = $this->ck()->check($this->m('past_due')->member_user_id, 1);
        $this->assertTrue($late['ok']);
        $this->assertSame('Their payment is late: remind them to pay.', $late['warning']);
        $this->assertTrue($this->ck()->check($this->m('trial')->member_user_id, 1)['ok']);
        $this->assertSame(7, Checkin::where('result', 'denied')->count());   // every turned-away scan is kept
        $this->assertSame(0, Checkin::where('result', 'denied')->where('created_at', '>', now())->count());
    }

    public function test_the_membership_in_good_standing_wins_over_an_older_one(): void
    {
        $u = $this->person();
        $this->m('active', [], $u);
        $this->m('ended', [], $u);   // newer, but over
        $this->assertTrue($this->ck()->check($u->id, 1)['ok']);
    }

    public function test_bad_input_and_credits_shown(): void
    {
        $m = $this->m();
        CreditEntry::create(['membership_id' => $m->id, 'user_id' => $m->member_user_id, 'kind' => 'grant', 'delta' => 4, 'remaining' => 4, 'created_at' => now()]);
        $this->assertSame(4, $this->ck()->check($m->member_user_id, 1)['credits']);
        try { $this->ck()->check(999, 1); $this->fail(); } catch (BooksException $e) { $this->assertStringContainsString('belongs to nobody', $e->getMessage()); }
        try { $this->ck()->check($m->member_user_id, 77); $this->fail(); } catch (BooksException $e) { $this->assertStringContainsString('Choose the branch', $e->getMessage()); }
        Schema::drop('membership_checkins');
        try { $this->ck()->check($m->member_user_id, 1); $this->fail(); } catch (BooksException $e) { $this->assertStringContainsString('167_memberships_checkins.sql', $e->getMessage()); }
        $this->assertSame([], $this->ck()->recent());
    }

    public function test_the_card_and_the_recent_list(): void
    {
        $u = $this->person();
        $this->assertNull($this->ck()->card($u));
        $m = $this->m('active', ['all_branches' => false, 'branch_ids' => [2, 1]], $u);
        $c = $this->ck()->card($u);
        $this->assertSame($u->name, $c['name']);
        $this->assertSame($m->number, $c['number']);
        $this->assertSame(MemberCheckIn::code($u->id), $c['code']);
        $this->assertStringStartsWith('<svg', ltrim($c['svg']));
        $this->assertSame(['Karen', 'Westlands'], $c['branches']);
        $this->assertSame('2026-10-31', $c['last_day']);
        $this->ck()->check($u->id, 1);
        $this->ck()->check($u->id, 2);
        $other = $this->m();
        $this->ck()->check($other->member_user_id, 1);
        $this->assertCount(3, $this->ck()->recent());
        $this->assertSame(['Karen'], array_column($this->ck()->recent(2), 'branch'));
        $this->assertCount(2, $this->ck()->recent(null, $u->id));
        $this->assertSame($other->member_user_id, $this->ck()->recent()[0]['user_id']);   // newest first
        $this->assertNull($this->ck()->card(\App\Models\User::find($other->member_user_id))['branches']);   // every branch: no list
        $this->assertCount(1, $this->ck()->recent(null, null, 1));
    }

    public function test_the_shared_scanner_checks_members_in_with_the_permission(): void
    {
        $m = $this->m();
        $door = $this->person('Door');
        $r = app(CodeResolvers::class);
        $this->assertSame('/membership/my', $r->publicPath(MemberCheckIn::code($m->member_user_id)));
        try { $r->scan(MemberCheckIn::code($m->member_user_id), $door); $this->fail(); } catch (\Throwable $e) { $this->assertStringContainsString('not allowed', $e->getMessage()); }
        $this->grant($door, ['memberships.checkin']);
        $out = app(CodeResolvers::class)->scan(MemberCheckIn::code($m->member_user_id), $door, ['location_id' => 2]);
        $this->assertTrue($out['result']['ok']);
        $this->assertSame(2, (int) Checkin::sole()->location_id);
    }

    public function test_the_check_in_screen_keeps_to_the_branches_a_person_is_cleared_for(): void
    {
        $m = $this->m();
        $door = $this->person('Door');
        Sanctum::actingAs($door, ['*']);
        $this->postJson('/api/admin/memberships/checkin/scan', ['code' => MemberCheckIn::code($m->member_user_id), 'location_id' => 1])->assertForbidden();
        $this->grant($door, ['memberships.checkin']);
        $this->branches($door, [2]);
        config(['access.scope_mode' => 'on']);   // branch clearance enforced
        \App\Services\Access\AccessSettings::reset();
        \App\Models\Memberships\Checkin::create(['user_id' => $m->member_user_id, 'location_id' => 1, 'result' => 'ok', 'method' => 'card', 'created_at' => now()->subHour()]);   // a visit at a branch this person is not cleared for
        $this->assertSame([2], array_column($this->getJson('/api/admin/memberships/checkin/meta')->assertOk()->json('locations'), 'id'));
        $this->postJson('/api/admin/memberships/checkin/scan', ['code' => MemberCheckIn::code($m->member_user_id), 'location_id' => 1])->assertNotFound();
        $this->assertTrue($this->postJson('/api/admin/memberships/checkin/scan', ['code' => MemberCheckIn::code($m->member_user_id), 'location_id' => 2])->assertOk()->json('ok'));
        $this->postJson('/api/admin/memberships/checkin/scan', ['code' => 'tk.1.AAAA', 'location_id' => 2])->assertStatus(422)->assertJsonFragment(['message' => 'This is not a member card.']);
        $this->assertTrue($this->postJson('/api/admin/memberships/checkin/manual', ['user_id' => $m->member_user_id, 'location_id' => 2])->assertOk()->json('repeat'));
        $this->assertCount(1, $this->getJson('/api/admin/memberships/checkin/recent?location_id=2')->assertOk()->json('checkins'));
        $this->getJson('/api/admin/memberships/checkin/recent?location_id=1')->assertNotFound();
        $this->assertSame([2], array_values(array_unique(array_map(fn ($c) => $c['branch'] === 'Karen' ? 2 : 1, $this->getJson('/api/admin/memberships/checkin/recent')->json('checkins')))));   // no branch chosen: only theirs
        $this->assertSame([], $this->getJson('/api/admin/memberships/checkin/people?q=a')->json('users'));
        $this->assertSame([$m->member_user_id], array_column($this->getJson('/api/admin/memberships/checkin/people?q=Amina')->json('users'), 'id'));
        $this->person('Amina Two');   // not a member: not offered
        $this->assertCount(1, $this->getJson('/api/admin/memberships/checkin/people?q=Amina')->json('users'));
    }

    public function test_the_member_opens_their_own_card(): void
    {
        $u = $this->person();
        Sanctum::actingAs($u, ['*']);
        $this->assertNull($this->getJson('/api/memberships/my/card')->assertOk()->json('card'));
        $this->m('active', [], $u);
        $this->assertSame(MemberCheckIn::code($u->id), $this->getJson('/api/memberships/my/card')->json('card.code'));
    }
    public function test_a_stale_pause_date_does_not_change_the_reason_for_another_state(): void
    {
        $m = $this->m('lapsed');
        $m->update(['paused_until' => '2026-10-20']);   // left over from an earlier pause
        $r = $this->ck()->check($m->member_user_id, 1);
        $this->assertFalse($r['ok']);
        $this->assertStringNotContainsString('paused', $r['reason']);
        $p = $this->m('paused');
        $this->assertSame('The membership is paused until 20 Oct.', $this->ck()->check($p->member_user_id, 1)['reason']);
    }
}
