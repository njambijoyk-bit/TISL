<?php

namespace Tests\Feature;

use App\Models\Memberships\Membership;
use App\Models\Memberships\Plan;
use App\Services\Books\BooksException;
use App\Services\Courses\MembershipBenefit as CourseBenefit;
use App\Services\Memberships\Credits;
use App\Services\Memberships\MembershipBenefits;
use App\Services\Memberships\MembershipSettings;
use App\Services\Memberships\PlanService;
use App\Services\Menus\MembershipBenefit as MealBenefit;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Memberships step 1: plans, their benefits, the benefit registry and the settings. */
class MembershipsPlansTest extends TestCase
{
    use Concerns\CreatesMembershipWorld;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createMembershipWorld();
        Schema::create('course_offerings', function ($t) { $t->id(); $t->string('title'); $t->string('kind')->default('course'); $t->string('category')->nullable(); $t->string('status')->default('published'); $t->timestamps(); });
    }

    private function plans(): PlanService
    {
        return app(PlanService::class);
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

    private function base(array $o = []): array
    {
        return $o + ['name' => 'Gold', 'price' => 2500, 'ledger_id' => $this->serviceLedger];
    }

    // ── saving a plan ────────────────────────────────────────────────────

    public function test_a_plan_is_saved_as_a_draft_with_its_details_and_a_slug(): void
    {
        $p = $this->plans()->save($this->base(['summary' => '  Train any day  ', 'description' => '', 'joining_fee' => 500, 'trial_days' => 7, 'grace_days' => 3, 'capacity' => 50, 'period_unit' => 'month', 'period_count' => 3, 'auto_renew' => false, 'sort_order' => 4]), null, 9);
        $this->assertSame('draft', $p->status);
        $this->assertSame('gold', $p->slug);
        $this->assertSame('Train any day', $p->summary);
        $this->assertNull($p->description);
        $this->assertEquals(2500, $p->price);
        $this->assertEquals(500, $p->joining_fee);
        $this->assertSame(7, $p->trial_days);
        $this->assertSame(3, $p->grace_days);
        $this->assertSame(50, $p->capacity);
        $this->assertSame(3, $p->period_count);
        $this->assertFalse($p->auto_renew);
        $this->assertSame(4, $p->sort_order);
        $this->assertSame(9, (int) $p->created_by);
        $this->assertTrue($p->all_branches);
        $this->assertSame('quarterly', $this->plans()->row($p)['period_label']);
    }

    public function test_slugs_are_unique_and_never_a_reserved_word(): void
    {
        $this->assertSame('gold', $this->plans()->save($this->base())->slug);
        $this->assertSame('gold-2', $this->plans()->save($this->base())->slug);
        $this->assertSame('join-2', $this->plans()->save($this->base(['name' => 'Join']))->slug);
        $this->assertSame('my-2', $this->plans()->save($this->base(['name' => 'My']))->slug);
        $this->assertSame('plans-2', $this->plans()->save($this->base(['name' => 'Plans']))->slug);
        $this->assertSame('plan', $this->plans()->save($this->base(['name' => '!!!']))->slug);
    }

    public function test_editing_keeps_what_was_not_sent_and_the_slug(): void
    {
        $p = $this->plans()->save($this->base(['summary' => 'Keep me', 'trial_days' => 5, 'capacity' => 10]));
        $p = $this->plans()->save(['name' => 'Platinum', 'price' => 3000], $p);
        $this->assertSame('gold', $p->slug);
        $this->assertSame('Platinum', $p->name);
        $this->assertSame('Keep me', $p->summary);
        $this->assertSame(5, $p->trial_days);
        $this->assertSame(10, $p->capacity);
        $this->assertSame($this->serviceLedger, (int) $p->ledger_id);
        $p = $this->plans()->save(['summary' => '', 'capacity' => ''], $p);
        $this->assertNull($p->summary);
        $this->assertNull($p->capacity);
    }

    public function test_the_plan_needs_a_name_a_period_and_sensible_money(): void
    {
        $this->fails(fn () => $this->plans()->save($this->base(['name' => '  '])), 'name');
        $this->fails(fn () => $this->plans()->save($this->base(['name' => str_repeat('x', 121)])), 'name');
        $this->plans()->save($this->base(['name' => str_repeat('x', 120)]));
        $this->fails(fn () => $this->plans()->save($this->base(['period_unit' => 'decade'])), 'day, week, month or year');
        $this->fails(fn () => $this->plans()->save($this->base(['period_count' => 0])), 'A period is 1 to 60 months');
        $this->fails(fn () => $this->plans()->save($this->base(['period_count' => 61])), 'A period is 1 to 60 months');
        $this->plans()->save($this->base(['period_count' => 60]));
        $this->fails(fn () => $this->plans()->save($this->base(['period_unit' => 'year', 'period_count' => 11])), '1 to 10 years');
        $this->plans()->save($this->base(['period_unit' => 'year', 'period_count' => 10]));
        $this->fails(fn () => $this->plans()->save($this->base(['period_unit' => 'week', 'period_count' => 105])), '1 to 104 weeks');
        $this->fails(fn () => $this->plans()->save($this->base(['period_unit' => 'day', 'period_count' => 731])), '1 to 730 days');
        $this->plans()->save($this->base(['period_unit' => 'day', 'period_count' => 730]));
        $this->fails(fn () => $this->plans()->save($this->base(['price' => -1])), 'price between 0');
        $this->fails(fn () => $this->plans()->save($this->base(['price' => 10000001])), 'price between 0');
        $this->plans()->save($this->base(['price' => 10000000]));
        $this->fails(fn () => $this->plans()->save($this->base(['joining_fee' => -5])), 'joining fee between 0');
        $this->fails(fn () => $this->plans()->save($this->base(['trial_days' => 366])), 'trial');
        $this->fails(fn () => $this->plans()->save($this->base(['trial_days' => -1])), 'trial');
        $this->plans()->save($this->base(['trial_days' => 365, 'grace_days' => 90]));
        $this->fails(fn () => $this->plans()->save($this->base(['grace_days' => 91])), 'grace');
        $this->fails(fn () => $this->plans()->save($this->base(['capacity' => 0])), 'most members');
    }

    public function test_money_needs_a_sales_account_that_carries_the_tax(): void
    {
        $this->fails(fn () => $this->plans()->save(['name' => 'Gold', 'price' => 100]), 'sales account');
        $this->fails(fn () => $this->plans()->save(['name' => 'Gold', 'price' => 0, 'joining_fee' => 100]), 'sales account');
        $free = $this->plans()->save(['name' => 'Friends', 'price' => 0]);
        $this->assertNull($free->ledger_id);
        // a joining fee with its own account needs no main account while the period is free
        $fee = $this->plans()->save(['name' => 'Fee only', 'price' => 0, 'joining_fee' => 100, 'joining_ledger_id' => $this->serviceLedger]);
        $this->assertSame($this->serviceLedger, (int) $fee->joining_ledger_id);
        // a product sales account is accepted too
        $this->plans()->save($this->base(['ledger_id' => $this->productLedger]));
        $notSales = DB::table('ledgers')->insertGetId(['name' => 'Bank', 'group_id' => DB::table('ledger_groups')->insertGetId(['name' => 'Bank accounts', 'behaviour' => 'bank'])]);
        $this->fails(fn () => $this->plans()->save($this->base(['ledger_id' => $notSales])), 'not a sales account');
        $this->fails(fn () => $this->plans()->save($this->base(['joining_ledger_id' => $notSales, 'joining_fee' => 10])), 'not a sales account');
        $noTax = DB::table('ledgers')->insertGetId(['name' => 'Untaxed', 'group_id' => DB::table('ledger_groups')->where('name', 'Service Income')->value('id'), 'tax_nature' => null]);
        $this->fails(fn () => $this->plans()->save($this->base(['ledger_id' => $noTax])), 'no tax set');
    }

    public function test_branches_are_every_branch_or_chosen_ones_that_exist(): void
    {
        $p = $this->plans()->save($this->base(['all_branches' => false, 'branch_ids' => [2, 2]]));
        $this->assertFalse($p->all_branches);
        $this->assertSame([2], $p->branch_ids);
        $this->fails(fn () => $this->plans()->save($this->base(['all_branches' => false, 'branch_ids' => []])), 'branches');
        $this->fails(fn () => $this->plans()->save($this->base(['all_branches' => false, 'branch_ids' => [2, 99]])), 'branches');
        $p = $this->plans()->save(['all_branches' => true, 'branch_ids' => [2]], $p);
        $this->assertTrue($p->all_branches);
        $this->assertNull($p->branch_ids);
    }

    public function test_the_most_members_can_not_go_below_the_members_there_are(): void
    {
        $p = $this->plans()->save($this->base(['capacity' => 5]));
        foreach (['active', 'trial', 'cancelled', 'lapsed', 'ended'] as $i => $s) {
            Membership::forceCreate(['number' => "MB-{$i}", 'plan_id' => $p->id, 'member_user_id' => $i + 1, 'status' => $s]);
        }
        $this->fails(fn () => $this->plans()->save(['capacity' => 1], $p), 'more members');
        $this->assertSame(2, $this->plans()->save(['capacity' => 2], $p)->capacity);
        $this->assertSame(2, $this->plans()->row($p)['members']);   // cancelled, lapsed and ended ones do not count
    }

    // ── benefits ─────────────────────────────────────────────────────────

    public function test_benefits_are_checked_by_their_module_and_replace_the_old_ones(): void
    {
        DB::table('course_offerings')->insert([['id' => 3, 'title' => 'Bread'], ['id' => 4, 'title' => 'Cakes']]);
        $p = $this->plans()->save($this->base(['benefits' => [['type' => 'meals', 'config' => ['discount_pct' => '12.5']], ['type' => 'courses', 'config' => ['mode' => 'selected', 'offering_ids' => [3, 4, 4], 'waive_tuition' => 1]]]]));
        $b = $p->benefits;
        $this->assertCount(2, $b);
        $this->assertSame(['discount_pct' => 12.5], $b[0]->config);
        $this->assertSame([3, 4], $b[1]->config['offering_ids']);
        $this->assertTrue($b[1]->config['waive_tuition']);
        $row = $this->plans()->row($p);
        $this->assertSame('12.5% off meal plans', $row['benefits'][0]['description']);
        $this->assertSame('Access to 2 chosen courses, tuition free', $row['benefits'][1]['description']);
        $this->assertTrue($row['benefits'][0]['available']);
        $p = $this->plans()->setBenefits($p, [['type' => 'credits', 'config' => ['amount' => 4]]]);
        $this->assertSame(['credits'], $p->benefits->pluck('type')->all());
        $this->assertSame(['amount' => 4, 'rollover' => false], $p->benefits[0]->config);
        $this->assertSame(0, DB::table('membership_plan_benefits')->where('type', 'meals')->count());
        $this->assertCount(0, $this->plans()->setBenefits($p, [])->benefits);
    }

    public function test_bad_benefits_are_refused(): void
    {
        $p = $this->plans()->save($this->base());
        $this->fails(fn () => $this->plans()->setBenefits($p, [['type' => 'meals'], ['type' => 'meals']]), 'one benefit of each kind');
        $this->fails(fn () => $this->plans()->setBenefits($p, [['type' => 'spa']]), 'not available');
        $this->fails(fn () => $this->plans()->setBenefits($p, array_fill(0, 13, ['type' => 'meals'])), 'up to 12');
        $this->fails(fn () => $this->plans()->setBenefits($p, array_fill(0, 12, ['type' => 'meals'])), 'one benefit of each kind');   // twelve is allowed, so the next rule speaks
        $this->fails(fn () => $this->plans()->setBenefits($p, [['type' => 'meals', 'config' => ['discount_pct' => 101]]]), 'between 0 and 100');
        $this->fails(fn () => $this->plans()->setBenefits($p, [['type' => 'meals', 'config' => ['discount_pct' => -1]]]), 'between 0 and 100');
        $this->fails(fn () => $this->plans()->setBenefits($p, [['type' => 'courses', 'config' => ['mode' => 'everything']]]), 'which courses');
        $this->fails(fn () => $this->plans()->setBenefits($p, [['type' => 'courses', 'config' => ['mode' => 'kind', 'kinds' => []]]]), 'kinds');
        $this->fails(fn () => $this->plans()->setBenefits($p, [['type' => 'courses', 'config' => ['mode' => 'kind', 'kinds' => ['course', 'yoga']]]]), 'kinds');
        $this->fails(fn () => $this->plans()->setBenefits($p, [['type' => 'courses', 'config' => ['mode' => 'category', 'categories' => [' ', '']]]]), 'categories');
        $this->fails(fn () => $this->plans()->setBenefits($p, [['type' => 'courses', 'config' => ['mode' => 'selected', 'offering_ids' => [77]]]]), 'exist');
        $this->fails(fn () => $this->plans()->setBenefits($p, [['type' => 'credits', 'config' => ['amount' => 0]]]), '1 to 1000');
        $this->fails(fn () => $this->plans()->setBenefits($p, [['type' => 'credits', 'config' => ['amount' => 1001]]]), '1 to 1000');
        $this->assertCount(0, $p->fresh('benefits')->benefits);   // nothing was half-saved
    }

    public function test_a_benefit_whose_module_is_off_is_not_offered_and_shows_as_unavailable(): void
    {
        $p = $this->plans()->save($this->base(['benefits' => [['type' => 'meals', 'config' => ['discount_pct' => 5]]]]));
        $reg = app(MembershipBenefits::class);
        $this->assertSame(['courses' => 'Courses', 'meals' => 'Meal plans', 'credits' => 'Credits (class passes)'], $reg->types());
        $this->licensed = false;
        $this->assertSame([], $reg->types());
        $this->assertFalse($reg->has('meals'));
        $this->assertNull($reg->granter('credits'));
        $this->assertNull($reg->revoker('credits'));
        $this->assertFalse($this->plans()->row($p->fresh('benefits'))['benefits'][0]['available']);
        $this->fails(fn () => $this->plans()->setBenefits($p, [['type' => 'meals']]), 'not available');
        $this->assertSame('Meal plans', $reg->label('meals'));
        $this->assertSame('mystery', $reg->label('mystery'));
        $this->assertSame('mystery', $reg->describe('mystery', []));
    }

    public function test_benefit_words(): void
    {
        $this->assertSame('Access to every course', CourseBenefit::describe(['mode' => 'all']));
        $this->assertSame('Access to every course, tuition free', CourseBenefit::describe(['mode' => 'all', 'waive_tuition' => true]));
        $this->assertSame('Access to all recipe, live class', CourseBenefit::describe(['mode' => 'kind', 'kinds' => ['recipe', 'live']]));
        $this->assertSame('Access to all courses in Baking, Pastry', CourseBenefit::describe(['mode' => 'category', 'categories' => ['Baking', 'Pastry']]));
        $this->assertSame('Access to 1 chosen course', CourseBenefit::describe(['mode' => 'selected', 'offering_ids' => [1]]));
        $this->assertSame('Can subscribe to meal plans', MealBenefit::describe(['discount_pct' => 0]));
        $this->assertSame('10% off meal plans', MealBenefit::describe(['discount_pct' => 10]));
        $this->assertSame(['discount_pct' => 100.0], MealBenefit::validate(['discount_pct' => 100]));
        $this->assertSame(['discount_pct' => 0.0], MealBenefit::validate([]));
        $this->assertSame('1 credit each period, use them within the period', Credits::describe(['amount' => 1]));
        $this->assertSame('8 credits each period, unused ones roll over', Credits::describe(['amount' => 8, 'rollover' => true]));
        $this->assertSame(['mode' => 'category', 'waive_tuition' => false, 'kinds' => [], 'categories' => ['Baking'], 'offering_ids' => []], CourseBenefit::validate(['mode' => 'category', 'categories' => [' Baking ', 'Baking', ''], 'kinds' => ['course']]));
    }

    // ── showing ──────────────────────────────────────────────────────────

    public function test_period_words(): void
    {
        $label = fn ($u, $n) => $this->plans()->periodLabel(new Plan(['period_unit' => $u, 'period_count' => $n]));
        $this->assertSame('daily', $label('day', 1));
        $this->assertSame('weekly', $label('week', 1));
        $this->assertSame('monthly', $label('month', 1));
        $this->assertSame('yearly', $label('year', 1));
        $this->assertSame('quarterly', $label('month', 3));
        $this->assertSame('every 2 weeks', $label('week', 2));
        $this->assertSame('every 6 months', $label('month', 6));
        $this->assertSame('every 3 years', $label('year', 3));
    }

    public function test_the_list_filters_and_sorts(): void
    {
        $a = $this->plans()->save($this->base(['name' => 'Zinc', 'sort_order' => 1]));
        $b = $this->plans()->save($this->base(['name' => 'Bronze', 'sort_order' => 2]));
        $c = $this->plans()->save($this->base(['name' => 'Amber', 'sort_order' => 2]));
        $this->plans()->publish($b);
        $this->assertSame(['Zinc', 'Amber', 'Bronze'], array_column($this->plans()->list(), 'name'));
        $this->assertSame(['Bronze'], array_column($this->plans()->list('published'), 'name'));
        $this->assertSame(['Zinc'], array_column($this->plans()->list(null, 'zin'), 'name'));
        $this->assertSame([], $this->plans()->list(null, '%'));   // a wildcard is a letter, not "anything"
    }

    // ── status ───────────────────────────────────────────────────────────

    public function test_publishing_unpublishing_archiving_restoring_and_removing(): void
    {
        $p = $this->plans()->save($this->base());
        $p = $this->plans()->publish($p);
        $this->assertSame('published', $p->status);
        $this->fails(fn () => $this->plans()->publish($p), 'published already');
        $p = $this->plans()->unpublish($p);
        $this->assertSame('draft', $p->status);
        $this->fails(fn () => $this->plans()->unpublish($p), 'Only a published plan');
        $this->fails(fn () => $this->plans()->restore($p), 'Only an archived plan');
        $p = $this->plans()->archive($p);
        $this->assertSame('archived', $p->status);
        $p = $this->plans()->restore($p);
        $this->assertSame('draft', $p->status);
        // a paid plan that lost its account can not be published
        DB::table('membership_plans')->where('id', $p->id)->update(['ledger_id' => null]);
        $this->fails(fn () => $this->plans()->publish($p->fresh()), 'sales account');
        DB::table('membership_plans')->where('id', $p->id)->update(['price' => 0]);
        $this->assertSame('published', $this->plans()->publish($p->fresh())->status);
    }

    public function test_a_plan_with_members_is_archived_not_unpublished_or_removed(): void
    {
        $p = $this->plans()->publish($this->plans()->save($this->base(['benefits' => [['type' => 'meals', 'config' => []]]])));
        Membership::forceCreate(['number' => 'MB-1', 'plan_id' => $p->id, 'member_user_id' => 1, 'status' => 'active']);
        $this->fails(fn () => $this->plans()->unpublish($p), 'archive it instead');
        $this->fails(fn () => $this->plans()->delete($p), 'archive it instead');
        Membership::query()->update(['status' => 'ended']);
        $this->assertSame('draft', $this->plans()->unpublish($p)->status);
        $this->fails(fn () => $this->plans()->delete($p), 'archive it instead');   // it has had members
        $q = $this->plans()->save($this->base(['name' => 'Spare', 'benefits' => [['type' => 'meals', 'config' => []]]]));
        $this->plans()->delete($q);
        $this->assertNull(Plan::find($q->id));
        $this->assertSame(0, DB::table('membership_plan_benefits')->where('plan_id', $q->id)->count());
        $this->assertSame(1, DB::table('membership_plan_benefits')->where('plan_id', $p->id)->count());
    }

    public function test_nothing_is_saved_before_the_script_is_run(): void
    {
        $this->plans()->save($this->base());
        Schema::drop('membership_plan_benefits');
        $this->assertFalse(PlanService::installed());
        $this->assertSame([], $this->plans()->list());
        $this->fails(fn () => $this->plans()->save($this->base()), '162_memberships.sql');
    }

    // ── settings ─────────────────────────────────────────────────────────

    public function test_settings_have_defaults_and_keep_to_their_limits(): void
    {
        $this->assertSame(MembershipSettings::DEFAULTS, MembershipSettings::all());
        $s = MembershipSettings::save(['pending_hours' => '0', 'renewal_lead_days' => 90, 'remind_before_days' => 30, 'remind_after_days' => 0, 'pause_days_per_year' => 365, 'allow_member_cancel' => 0, 'stranger' => 5], 3);
        $this->assertSame(0, $s['pending_hours']);
        $this->assertSame(90, $s['renewal_lead_days']);
        $this->assertFalse($s['allow_member_cancel']);
        $this->assertArrayNotHasKey('stranger', MembershipSettings::all());
        $this->assertSame($s, MembershipSettings::all());
        $this->assertSame(3, (int) DB::table('membership_settings')->value('updated_by'));
        MembershipSettings::save(['remind_before_days' => 2], 4);   // the second save updates the one row
        $this->assertSame(1, DB::table('membership_settings')->count());
        $this->assertSame(90, MembershipSettings::all()['renewal_lead_days']);
        foreach ([['pending_hours', 721], ['pending_hours', -1], ['renewal_lead_days', 91], ['remind_before_days', 31], ['remind_after_days', 31], ['pause_days_per_year', 366]] as [$k, $v]) {
            $this->fails(fn () => MembershipSettings::save([$k => $v], null), 'between');
        }
        Schema::drop('membership_settings');
        $this->assertSame(MembershipSettings::DEFAULTS, MembershipSettings::all());
        $this->fails(fn () => MembershipSettings::save([], null), '162_memberships.sql');
    }
}
