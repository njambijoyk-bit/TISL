<?php

namespace Tests\Feature;

use App\Models\Memberships\Membership;
use App\Models\Memberships\Period;
use App\Services\Memberships\MembershipService;
use App\Services\Memberships\MembershipSettings;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Memberships step 3: the plans anyone can read, a signed-in person joining, paying and managing their own membership, and the doors every Memberships route keeps. */
class MembershipsMemberSideTest extends TestCase
{
    use Concerns\CreatesMembershipWorld;
    use Concerns\StandsInForAccess;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createMembershipWorld();
        $this->standInAccess();
    }

    private function as($u): void
    {
        Sanctum::actingAs($u, ['*']);
    }

    // ── the plans page ───────────────────────────────────────────────────

    public function test_anyone_can_read_the_published_plans_in_words(): void
    {
        $gold = $this->plan(['name' => 'Gold', 'price' => 2500, 'joining_fee' => 500, 'trial_days' => 7, 'capacity' => 2, 'sort_order' => 2, 'summary' => 'Everything'], [['meals', ['discount_pct' => 10]], ['courses', ['mode' => 'all', 'waive_tuition' => false]]]);
        $this->plan(['name' => 'Draft', 'status' => 'draft']);
        $this->plan(['name' => 'Basic', 'price' => 900, 'sort_order' => 1, 'all_branches' => false, 'branch_ids' => [2]]);
        $r = $this->getJson('/api/memberships/plans')->assertOk()->json('plans');
        $this->assertSame(['Basic', 'Gold'], array_column($r, 'name'));
        $g = $r[1];
        $this->assertSame(2500, (int) $g['price']);
        $this->assertSame('monthly', $g['period_label']);
        $this->assertSame(500, (int) $g['joining_fee']);
        $this->assertSame(7, $g['trial_days']);
        $this->assertSame(2, $g['places_left']);
        $this->assertFalse($g['full']);
        $this->assertSame(['10% off meal plans', 'Access to every course'], $g['benefits']);
        $this->assertFalse($g['current']);
        $this->assertFalse($r[0]['all_branches']);
        $this->assertArrayNotHasKey('ledger_id', $g);   // nothing about the books leaves
        // a module that is off gives nothing in words; Memberships off hides the page
        $this->licensed = false;
        $this->getJson('/api/memberships/plans')->assertNotFound();
    }

    public function test_a_signed_in_person_sees_their_own_plan_and_the_fee_they_would_pay(): void
    {
        $gold = $this->plan(['price' => 1000, 'joining_fee' => 500, 'capacity' => 1]);
        $u = $this->person();
        $m = app(MembershipService::class)->join($gold, ['member_user_id' => $u->id]);
        app(MembershipService::class)->takePayment(Period::where('membership_id', $m->id)->sole(), [['payment_method_id' => 1, 'amount' => 1740]]);
        $this->as($u);
        $p = $this->getJson('/api/memberships/plans')->json('plans.0');
        $this->assertTrue($p['current']);
        $this->assertSame(0, (int) $p['joining_fee']);   // paid already
        $this->assertSame(0, $p['places_left']);
        $this->assertTrue($p['full']);
    }

    // ── joining ──────────────────────────────────────────────────────────

    public function test_joining_needs_a_signed_in_person(): void
    {
        $plan = $this->plan();
        $this->postJson("/api/memberships/plans/{$plan->id}/join")->assertUnauthorized();
        $this->getJson('/api/memberships/my')->assertUnauthorized();
        $this->postJson("/api/memberships/plans/{$plan->id}/quote")->assertUnauthorized();
    }

    public function test_the_quote_offers_only_payments_that_can_be_started_online(): void
    {
        $plan = $this->plan(['price' => 1000, 'joining_fee' => 200]);
        $this->as($this->person());
        $q = $this->postJson("/api/memberships/plans/{$plan->id}/quote")->assertOk()->json();
        $this->assertEquals(1392, $q['total']);
        $this->assertSame([4], array_column($q['payment_methods'], 'id'));
        $draft = $this->plan(['status' => 'draft']);
        $this->postJson("/api/memberships/plans/{$draft->id}/quote")->assertNotFound();
    }

    public function test_joining_starts_the_first_payment_at_once(): void
    {
        $plan = $this->plan(['price' => 1000]);
        $u = $this->person();
        $this->as($u);
        $r = $this->postJson("/api/memberships/plans/{$plan->id}/join", ['payment_method_id' => 4, 'phone' => '0700111222'])->assertOk()->json();
        $this->assertSame('pending', $r['membership']['status']);
        $this->assertSame(701, $r['attempt']['id']);
        $this->assertStringContainsString('M-Pesa PIN', $r['message']);
        $this->assertSame('0700111222', $this->started[0]['phone']);
        $this->assertSame('online', Membership::sole()->channel);
        $this->assertSame($u->id, (int) Membership::sole()->member_user_id);
        $this->postJson("/api/memberships/plans/{$plan->id}/join")->assertStatus(422)->assertJsonFragment(['message' => 'Amina holds a membership already: change the plan or end it first.']);
    }

    public function test_joining_a_free_plan_says_welcome_and_errors_come_back_as_messages(): void
    {
        $free = $this->plan(['price' => 0, 'ledger_id' => null]);
        $this->as($this->person());
        $this->assertSame('Welcome! Your membership has started.', $this->postJson("/api/memberships/plans/{$free->id}/join")->json('message'));
        $this->as($this->person('Nocustomer', false));
        $paid = $this->plan(['price' => 1000]);
        $this->postJson("/api/memberships/plans/{$paid->id}/join")->assertStatus(422)->assertJsonFragment(['message' => 'Nocustomer needs a customer account to be invoiced: create it under Customers first.']);
        $this->as($this->person('Waits'));
        $r = $this->postJson("/api/memberships/plans/{$paid->id}/join")->json();
        $this->assertSame('Your membership is waiting for payment.', $r['message']);
        $this->assertNull($r['attempt']);
    }

    // ── my membership ────────────────────────────────────────────────────

    private function member(?\App\Models\User $u = null): Membership
    {
        $u ??= $this->person();
        $m = app(MembershipService::class)->join($this->plan(['price' => 1000]), ['member_user_id' => $u->id]);
        app(MembershipService::class)->takePayment(Period::where('membership_id', $m->id)->sole(), [['payment_method_id' => 1, 'amount' => 1160]]);

        return $m->fresh();
    }

    public function test_my_membership_shows_what_i_hold_and_what_i_pay_for_and_nothing_else(): void
    {
        $kid = $this->person('Kid', false);
        $parent = $this->person('Parent');
        $stranger = $this->member($this->person('Stranger'));
        $m = app(MembershipService::class)->join($this->plan(['price' => 1000]), ['member_user_id' => $kid->id, 'payer_user_id' => $parent->id]);
        $this->as($parent);
        $r = $this->getJson('/api/memberships/my')->assertOk()->json();
        $this->assertSame([$m->id], array_column($r['memberships'], 'id'));
        $this->assertTrue($r['memberships'][0]['as_payer']);
        $this->assertSame([4], array_column($r['payment_methods'], 'id'));
        $this->assertSame(['allow_member_cancel' => true, 'pause_days_per_year' => 60], $r['settings']);
        $this->assertArrayNotHasKey('events', $r['memberships'][0]);   // staff notes stay with staff
        $this->as($kid);
        $this->assertFalse($this->getJson('/api/memberships/my')->json('memberships.0.as_payer'));
        // someone else's membership can not be reached at all
        $this->as($parent);
        foreach (['pay' => ['payment_method_id' => 4], 'pause' => ['days' => 3], 'resume' => [], 'cancel' => [], 'keep' => [], 'change-plan' => ['plan_id' => 1]] as $what => $body) {
            $this->postJson("/api/memberships/my/{$stranger->id}/{$what}", $body)->assertNotFound();
        }
        $this->assertSame('active', $stranger->fresh()->status);
    }

    public function test_the_payer_pays_the_open_invoice(): void
    {
        $kid = $this->person('Kid', false);
        $parent = $this->person('Parent');
        $m = app(MembershipService::class)->join($this->plan(['price' => 1000]), ['member_user_id' => $kid->id, 'payer_user_id' => $parent->id]);
        $this->as($parent);
        $r = $this->postJson("/api/memberships/my/{$m->id}/pay", ['payment_method_id' => 4])->assertOk()->json();
        $this->assertSame(1160.0, $this->started[0]['amount']);
        $this->assertSame('0712000000', $this->started[0]['phone']);   // the payer's own number
        $this->assertNotNull($r['attempt']);
        $this->postJson("/api/memberships/my/{$m->id}/pay", [])->assertStatus(422);
        app(MembershipService::class)->takePayment(Period::where('membership_id', $m->id)->sole(), [['payment_method_id' => 1, 'amount' => 1160]]);
        $this->postJson("/api/memberships/my/{$m->id}/pay", ['payment_method_id' => 4])->assertStatus(422)->assertJsonFragment(['message' => 'There is nothing to pay.']);
    }

    public function test_a_member_pauses_within_the_allowance_comes_back_ends_and_keeps(): void
    {
        $u = $this->person();
        $m = $this->member($u);
        $this->as($u);
        $this->postJson("/api/memberships/my/{$m->id}/pause", ['days' => 61])->assertStatus(422)->assertJsonFragment(['message' => 'You can pause up to 60 days a year; 60 are left.']);
        $this->assertSame('paused', $this->postJson("/api/memberships/my/{$m->id}/pause", ['days' => 10])->assertOk()->json('membership.status'));
        $this->assertSame('active', $this->postJson("/api/memberships/my/{$m->id}/resume")->assertOk()->json('membership.status'));
        $r = $this->postJson("/api/memberships/my/{$m->id}/cancel", ['reason' => 'Moving'])->assertOk()->json();
        $this->assertTrue($r['membership']['cancel_at_end']);
        $this->assertSame('Your membership will end when the time you paid for runs out.', $r['message']);
        $this->assertFalse($this->postJson("/api/memberships/my/{$m->id}/keep")->assertOk()->json('membership.cancel_at_end'));
        MembershipSettings::save(['allow_member_cancel' => false], null);
        $this->postJson("/api/memberships/my/{$m->id}/cancel")->assertForbidden();
        $this->assertFalse($m->fresh()->cancel_at_end);
    }

    public function test_a_member_changes_plan(): void
    {
        $u = $this->person();
        $m = $this->member($u);
        $this->as($u);
        $cheap = $this->plan(['price' => 500]);
        $this->assertSame('Your plan will change at your next renewal.', $this->postJson("/api/memberships/my/{$m->id}/change-plan", ['plan_id' => $cheap->id])->json('message'));
        $n = $this->member($this->person('Up'));
        $this->as(\App\Models\User::find($n->member_user_id));
        $big = $this->plan(['price' => 5000]);
        $this->assertSame('To finish the upgrade, pay the invoice.', $this->postJson("/api/memberships/my/{$n->id}/change-plan", ['plan_id' => $big->id])->json('message'));
        $draft = $this->plan(['status' => 'draft']);
        $this->postJson("/api/memberships/my/{$n->id}/change-plan", ['plan_id' => $draft->id])->assertNotFound();
    }

    // ── the doors ────────────────────────────────────────────────────────

    public function test_every_memberships_route_needs_the_module_and_the_right_permission_or_sign_in(): void
    {
        $seen = 0;
        foreach (Route::getRoutes() as $r) {
            $uri = $r->uri();
            if (! str_contains($uri, 'memberships')) {
                continue;
            }
            $seen++;
            $mw = $r->gatherMiddleware();
            $this->assertContains('module:memberships', $mw, "{$uri} must be switched off with the module");
            $perms = array_values(array_filter($mw, fn ($x) => is_string($x) && str_starts_with($x, 'permission:')));
            if (str_starts_with($uri, 'api/admin/memberships/checkin')) {
                $this->assertSame(['permission:memberships.checkin'], $perms, $uri);
            } elseif (str_starts_with($uri, 'api/admin/memberships')) {
                $this->assertSame('permission:memberships.view,memberships.manage', $perms[0] ?? null, "{$uri} needs to see memberships");
            } elseif ($uri !== 'api/memberships/plans') {
                $this->assertContains('auth:sanctum', $mw, "{$uri} is for a signed-in person");
            }
        }
        $this->assertGreaterThan(35, $seen);
        $need = fn (string $method, string $uri) => collect(Route::getRoutes()->getRoutes())->first(fn ($r) => $r->uri() === $uri && in_array($method, $r->methods(), true))?->gatherMiddleware();
        $this->assertContains('permission:memberships.manage', $need('POST', 'api/admin/memberships/plans'));
        $this->assertContains('permission:memberships.manage', $need('PUT', 'api/admin/memberships/settings'));
        $this->assertContains('permission:memberships.enrol,memberships.manage', $need('POST', 'api/admin/memberships/members'));
        $this->assertContains('permission:memberships.refund', $need('POST', 'api/admin/memberships/periods/{period}/refund'));
        $this->assertContains('permission:memberships.grant', $need('POST', 'api/admin/memberships/members/give'));
        $this->assertContains('permission:memberships.grant', $need('POST', 'api/admin/memberships/members/{id}/credits'));
    }

    public function test_staff_screens_answer_only_to_the_permission(): void
    {
        $m = $this->member();
        $clerk = $this->person('Clerk');
        $this->as($clerk);
        $this->getJson('/api/admin/memberships/members')->assertForbidden();
        $this->grant($clerk, ['memberships.view']);
        $this->assertSame(1, $this->getJson('/api/admin/memberships/members')->assertOk()->json('total'));
        $this->postJson("/api/admin/memberships/members/{$m->id}/pause", ['days' => 3])->assertForbidden();
        $this->postJson("/api/admin/memberships/members/{$m->id}/cancel", ['immediate' => true])->assertForbidden();
        $this->grant($clerk, ['memberships.view', 'memberships.enrol']);
        $this->postJson("/api/admin/memberships/members/{$m->id}/cancel", ['immediate' => true])->assertForbidden()->assertJsonFragment(['message' => 'Ending a membership today needs the permission to give and end memberships.']);
        $this->assertSame('paused', $this->postJson("/api/admin/memberships/members/{$m->id}/pause", ['days' => 90])->assertOk()->json('membership.status'));   // staff may go past the member allowance
        $this->grant($clerk, ['memberships.view', 'memberships.enrol', 'memberships.grant']);
        $this->assertSame('cancelled', $this->postJson("/api/admin/memberships/members/{$m->id}/cancel", ['immediate' => true, 'reason' => 'Rules'])->assertOk()->json('membership.status'));
    }
}
