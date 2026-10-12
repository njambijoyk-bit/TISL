<?php

namespace Tests\Feature;

use App\Models\Menus\Holiday;
use App\Models\Menus\OvertimeEntry;
use App\Models\Menus\Premium;
use App\Models\User;
use App\Services\Access\Authorizer;
use App\Services\Books\BooksException;
use App\Services\Menus\HolidayCalendar;
use App\Services\Menus\MenusSettings;
use App\Services\Menus\RotaClock;
use App\Services\Menus\RotaDoor;
use App\Services\Menus\RotaOvertime;
use App\Services\Menus\RotaPay;
use App\Services\Menus\RotaPremium;
use App\Services\Menus\RotaSites;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Menus steps 15-16: shift premiums, overtime approval, pay from the rota and per shift, public holidays, and clocking in by place, Wi-Fi and the door code. "Now" is Monday 12 Oct 2026, 12:00. */
class MenusRotaPayTest extends TestCase
{
    use Concerns\CreatesRotaWorld;

    /** @var array<int, string[]> permissions by user id */
    private array $perms = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->createRotaWorld();
        Schema::create('payroll_settings', function ($t) { $t->id(); $t->decimal('overtime_multiplier', 5, 2)->default(1.5); $t->boolean('deduct_absence')->default(true); $t->unsignedBigInteger('salaries_expense_ledger_id')->nullable(); $t->unsignedBigInteger('salaries_payable_ledger_id')->nullable(); $t->unsignedBigInteger('updated_by')->nullable();
            $t->decimal('gratuity_days_per_year', 6, 2)->default(0); $t->integer('gratuity_min_years')->default(0); $t->integer('gratuity_divisor')->default(30); $t->boolean('gratuity_prorate')->default(false); $t->timestamps(); });
        $auth = $this->createMock(Authorizer::class);
        $auth->method('allows')->willReturnCallback(fn ($u, $p) => in_array($p, $this->perms[$u->id] ?? [], true));
        $this->app->instance(Authorizer::class, $auth);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function fails(callable $fn, string $part): void
    {
        try {
            $fn();
        } catch (BooksException $e) {
            $this->assertStringContainsString($part, $e->getMessage());

            return;
        }
        $this->fail("Expected a refusal containing: {$part}");
    }

    private function prem(): RotaPremium
    {
        return app(RotaPremium::class);
    }

    private function pay(): RotaPay
    {
        return app(RotaPay::class);
    }

    private function ot(): RotaOvertime
    {
        return app(RotaOvertime::class);
    }

    private function sites(): RotaSites
    {
        return app(RotaSites::class);
    }

    private function d(string $s): Carbon
    {
        return Carbon::parse($s, 'Africa/Nairobi');
    }

    // ── premium rules ─────────────────────────────────────────────────────

    public function test_premium_rule_validation(): void
    {
        $this->fails(fn () => $this->prem()->saveRule(['kind' => 'sunday', 'name' => 'x', 'extra_pct' => 10]), 'Choose night hours');
        $this->fails(fn () => $this->prem()->saveRule(['kind' => 'holiday', 'name' => ' ', 'extra_pct' => 10]), 'name');
        $this->fails(fn () => $this->prem()->saveRule(['kind' => 'holiday', 'name' => str_repeat('a', 81), 'extra_pct' => 10]), 'name');
        $this->fails(fn () => $this->prem()->saveRule(['kind' => 'holiday', 'name' => 'x', 'extra_pct' => 501]), 'between 0 and 500');
        $this->fails(fn () => $this->prem()->saveRule(['kind' => 'holiday', 'name' => 'x', 'extra_pct' => -1, 'flat_per_hour' => 5]), 'between 0 and 500');
        $this->fails(fn () => $this->prem()->saveRule(['kind' => 'holiday', 'name' => 'x', 'flat_per_hour' => -5, 'extra_pct' => 5]), 'between 0 and 500');
        $this->fails(fn () => $this->prem()->saveRule(['kind' => 'holiday', 'name' => 'x', 'flat_per_hour' => 100001]), 'between 0 and 500');
        $this->fails(fn () => $this->prem()->saveRule(['kind' => 'holiday', 'name' => 'x']), 'extra percentage or an amount');
        $this->fails(fn () => $this->prem()->saveRule(['kind' => 'night', 'name' => 'x', 'extra_pct' => 10, 'starts_at' => '22:00']), 'night hours like');
        $this->fails(fn () => $this->prem()->saveRule(['kind' => 'night', 'name' => 'x', 'extra_pct' => 10, 'starts_at' => '22:00', 'ends_at' => '22:00']), 'different times');
        $this->fails(fn () => $this->prem()->saveRule(['kind' => 'weekend', 'name' => 'x', 'extra_pct' => 10, 'weekdays' => []]), 'days of the week');
        $this->fails(fn () => $this->prem()->saveRule(['kind' => 'weekend', 'name' => 'x', 'extra_pct' => 10, 'weekdays' => [0]]), 'days of the week');
        $this->fails(fn () => $this->prem()->saveRule(['kind' => 'weekend', 'name' => 'x', 'extra_pct' => 10, 'weekdays' => [8]]), 'days of the week');
        $this->assertSame(0, Premium::count());
        $this->prem()->saveRule(['kind' => 'holiday', 'name' => str_repeat('a', 80), 'extra_pct' => 500]);
        $this->prem()->saveRule(['kind' => 'holiday', 'name' => 'Flat only', 'flat_per_hour' => 100000]);
        $this->assertSame(2, Premium::count());
    }

    public function test_premium_rules_keep_only_what_their_kind_needs_and_can_be_edited(): void
    {
        $night = $this->prem()->saveRule(['kind' => 'night', 'name' => 'Night', 'extra_pct' => 25, 'starts_at' => '22:00', 'ends_at' => '06:00:30', 'weekdays' => [1]]);
        $this->assertSame('22:00', substr((string) $night->starts_at, 0, 5));
        $this->assertNull($night->weekdays);
        $wk = $this->prem()->saveRule(['kind' => 'weekend', 'name' => 'Weekend', 'extra_pct' => 50, 'weekdays' => [7, 6, 6], 'starts_at' => '10:00']);
        $this->assertSame('6,7', $wk->weekdays);
        $this->assertNull($wk->starts_at);
        $e = $this->prem()->saveRule(['extra_pct' => 60, 'is_active' => false], $wk);
        $this->assertSame(60.0, (float) $e->extra_pct);
        $this->assertFalse($e->is_active);
        $this->assertSame('6,7', $e->weekdays);
        $this->assertSame('weekend', $e->kind);
    }

    public function test_holidays(): void
    {
        $h = $this->prem()->saveHoliday(['date' => '2026-12-25', 'name' => 'Christmas']);
        $this->assertSame('2026-12-25', $h->holiday_date->toDateString());
        $this->fails(fn () => $this->prem()->saveHoliday(['date' => '2026-12-25', 'name' => 'Again']), 'already a holiday');
        $this->prem()->saveHoliday(['date' => '2026-12-25', 'name' => 'Branch only', 'location_id' => 1]);   // a different scope
        $this->fails(fn () => $this->prem()->saveHoliday(['date' => '', 'name' => 'x']), 'Choose the day');
        $this->fails(fn () => $this->prem()->saveHoliday(['date' => '2026-12-26', 'name' => '']), 'name');
        $this->fails(fn () => $this->prem()->saveHoliday(['date' => '2026-12-26', 'name' => str_repeat('a', 81)]), 'name');
        $this->prem()->saveHoliday(['date' => '2026-12-26', 'name' => str_repeat('a', 80)]);
        $this->assertSame(3, Holiday::count());
    }

    public function test_holidays_for_a_branch_include_those_for_every_branch(): void
    {
        Holiday::create(['holiday_date' => '2026-10-20', 'name' => 'Mashujaa']);
        Holiday::create(['holiday_date' => '2026-10-21', 'name' => 'Branch one', 'location_id' => 1]);
        Holiday::create(['holiday_date' => '2026-10-22', 'name' => 'Branch two', 'location_id' => 2]);
        Holiday::create(['holiday_date' => '2026-11-30', 'name' => 'Far']);
        $got = $this->prem()->holidaysFor($this->d('2026-10-19'), $this->d('2026-10-25'), 1);
        $this->assertSame(['2026-10-20', '2026-10-21'], array_keys($got));
        $this->assertSame(['2026-10-20'], array_keys($this->prem()->holidaysFor($this->d('2026-10-19'), $this->d('2026-10-25'), null)));
        $this->assertSame(['2026-10-20'], array_keys($this->prem()->holidaysFor($this->d('2026-10-20'), $this->d('2026-10-20'), null)));
    }

    // ── minutes under the best rule ───────────────────────────────────────

    private function rules(): \Illuminate\Support\Collection
    {
        $n = $this->prem()->saveRule(['kind' => 'night', 'name' => 'Night', 'extra_pct' => 25, 'starts_at' => '22:00', 'ends_at' => '06:00']);
        $w = $this->prem()->saveRule(['kind' => 'weekend', 'name' => 'Weekend', 'extra_pct' => 50, 'weekdays' => [6, 7]]);
        $h = $this->prem()->saveRule(['kind' => 'holiday', 'name' => 'Holiday', 'extra_pct' => 100]);

        return collect([$n, $w, $h]);
    }

    public function test_every_minute_is_paid_under_the_best_rule_only(): void
    {
        [$n, $w, $h] = $this->rules();
        // Sat 17 Oct 2026, 20:00 to 02:00 next day: 20:00-22:00 weekend; 22:00-24:00 weekend (50 beats night 25); 00:00-02:00 Sunday is weekend too
        $m = $this->prem()->minutes($this->d('2026-10-17 20:00'), $this->d('2026-10-18 02:00'), collect([$n, $w, $h]), []);
        $this->assertSame([$w->id => 360], $m);
        // Mon 12 Oct 21:00 to 23:00: an hour outside the night, an hour in it
        $m = $this->prem()->minutes($this->d('2026-10-12 21:00'), $this->d('2026-10-12 23:00'), collect([$n, $w, $h]), []);
        $this->assertSame([$n->id => 60], $m);
        // a holiday (100) beats a night (25) on the same minutes
        $m = $this->prem()->minutes($this->d('2026-10-20 22:00'), $this->d('2026-10-20 23:00'), collect([$n, $w, $h]), ['2026-10-20' => true]);
        $this->assertSame([$h->id => 60], $m);
    }

    public function test_the_night_runs_past_midnight_and_includes_its_start_but_not_its_end(): void
    {
        [$n] = $this->rules();
        $one = collect([$n]);
        $this->assertSame([$n->id => 1], $this->prem()->minutes($this->d('2026-10-12 21:59'), $this->d('2026-10-12 22:01'), $one, []));
        $this->assertSame([$n->id => 1], $this->prem()->minutes($this->d('2026-10-13 05:59'), $this->d('2026-10-13 06:01'), $one, []));
        $this->assertSame([], $this->prem()->minutes($this->d('2026-10-13 06:00'), $this->d('2026-10-13 06:00'), $one, []));
        $same = $this->prem()->saveRule(['kind' => 'night', 'name' => 'Lunch', 'extra_pct' => 10, 'starts_at' => '12:00', 'ends_at' => '14:00']);
        $this->assertSame([$same->id => 120], $this->prem()->minutes($this->d('2026-10-12 11:00'), $this->d('2026-10-12 15:00'), collect([$same]), []));
    }

    public function test_the_better_percentage_wins_then_the_better_amount(): void
    {
        $a = $this->prem()->saveRule(['kind' => 'holiday', 'name' => 'A', 'extra_pct' => 50, 'flat_per_hour' => 0]);
        $b = $this->prem()->saveRule(['kind' => 'holiday', 'name' => 'B', 'extra_pct' => 50, 'flat_per_hour' => 20]);
        $c = $this->prem()->saveRule(['kind' => 'holiday', 'name' => 'C', 'extra_pct' => 0, 'flat_per_hour' => 500]);
        $m = $this->prem()->minutes($this->d('2026-10-20 10:00'), $this->d('2026-10-20 11:00'), collect([$c, $a, $b]), ['2026-10-20' => true]);
        $this->assertSame([$b->id => 60], $m);
    }

    // ── premium pay ───────────────────────────────────────────────────────

    public function test_premium_pay_from_verified_days(): void
    {
        $this->rules();
        $chef = $this->chefOf('Wanjiru Kamau');
        $uid = $chef->user_id;
        $this->attended($uid, '2026-10-17', '08:00', '12:00');   // Saturday: 4 h at 50%
        $this->attended($uid, '2026-10-20', '08:00', '10:00');   // Tuesday: nothing
        Holiday::create(['holiday_date' => '2026-10-21', 'name' => 'Holiday']);
        $this->attended($uid, '2026-10-21', '08:00', '09:30');   // a holiday: 1.5 h at 100%
        $this->attended($uid, '2026-10-18', '08:00', '09:00', ['verify_status' => 'marked']);   // not verified yet
        $r = $this->prem()->pay($uid, $this->d('2026-10-12'), $this->d('2026-10-25'), 100.0);
        $this->assertSame(5.5, $r['hours']);
        $this->assertSame(4 * 50.0 + 1.5 * 100.0, $r['amount']);
        $this->assertCount(2, $r['lines']);
        $all = $this->prem()->pay($uid, $this->d('2026-10-12'), $this->d('2026-10-25'), 100.0, false);
        $this->assertSame(6.5, $all['hours']);   // the Sunday counts when verification is not asked for
        $other = $this->prem()->pay($uid + 99, $this->d('2026-10-12'), $this->d('2026-10-25'), 100.0);
        $this->assertSame(0.0, $other['amount']);
    }

    public function test_premium_pay_adds_a_flat_amount_per_hour_and_ignores_inactive_rules(): void
    {
        $r = $this->prem()->saveRule(['kind' => 'weekend', 'name' => 'Weekend', 'extra_pct' => 10, 'flat_per_hour' => 20, 'weekdays' => [6]]);
        $chef = $this->chefOf('Wanjiru Kamau');
        $this->attended($chef->user_id, '2026-10-17', '08:00', '10:00');
        $p = $this->prem()->pay($chef->user_id, $this->d('2026-10-12'), $this->d('2026-10-25'), 100.0);
        $this->assertSame(2 * (100 * 0.10 + 20), $p['amount']);
        $this->prem()->saveRule(['is_active' => false], $r);
        $this->assertSame(0.0, $this->prem()->pay($chef->user_id, $this->d('2026-10-12'), $this->d('2026-10-25'), 100.0)['amount']);
    }

    public function test_a_branch_holiday_counts_only_for_the_branch_the_chef_works_at(): void
    {
        $this->prem()->saveRule(['kind' => 'holiday', 'name' => 'Holiday', 'extra_pct' => 100]);
        Holiday::create(['holiday_date' => '2026-10-20', 'name' => 'Branch two only', 'location_id' => 2]);
        $chef = $this->chefOf('Wanjiru Kamau');
        $this->shiftRow($chef->id, '2026-10-20', '08:00', '10:00');   // at branch 1
        $this->attended($chef->user_id, '2026-10-20', '08:00', '10:00');
        $this->assertSame(0.0, $this->prem()->pay($chef->user_id, $this->d('2026-10-12'), $this->d('2026-10-25'), 100.0)['amount']);
        DB::table('menus_shifts')->update(['location_id' => 2]);
        $this->assertSame(200.0, $this->prem()->pay($chef->user_id, $this->d('2026-10-12'), $this->d('2026-10-25'), 100.0)['amount']);
    }

    public function test_the_overview_lists_rules_and_recent_holidays(): void
    {
        $this->rules();
        Holiday::create(['holiday_date' => '2026-09-01', 'name' => 'Too old']);
        Holiday::create(['holiday_date' => '2026-09-20', 'name' => 'Recent']);
        $o = $this->prem()->overview();
        $this->assertCount(3, $o['rules']);
        $this->assertSame(['Recent'], array_column($o['holidays'], 'name'));
        $this->assertSame([6, 7], collect($o['rules'])->firstWhere('kind', 'weekend')['weekdays']);
    }

    // ── the holiday calendar ──────────────────────────────────────────────

    public function test_easter_dates(): void
    {
        foreach (['2024-03-31', '2025-04-20', '2026-04-05', '2027-03-28', '2038-04-25'] as $d) {
            $this->assertSame($d, HolidayCalendar::easter((int) substr($d, 0, 4))->toDateString());
        }
    }

    public function test_kenya_2026_has_easter_and_the_fixed_days(): void
    {
        $l = collect((new HolidayCalendar())->forYear('ke', 2026));
        $this->assertSame('Good Friday', $l->firstWhere('date', '2026-04-03')['name']);
        $this->assertSame('Easter Monday', $l->firstWhere('date', '2026-04-06')['name']);
        $this->assertSame('Madaraka Day', $l->firstWhere('date', '2026-06-01')['name']);
        $this->assertSame('Mashujaa Day', $l->firstWhere('date', '2026-10-20')['name']);
        $this->assertCount(10, $l);
        $this->assertSame($l->pluck('date')->sort()->values()->all(), $l->pluck('date')->all());
    }

    public function test_a_sunday_holiday_is_also_kept_on_the_monday_in_kenya_and_south_africa_but_not_uganda(): void
    {
        $ke = collect((new HolidayCalendar())->forYear('KE', 2027));   // 12 Dec and 26 Dec and 10 Oct 2027 are Sundays
        $this->assertSame('Jamhuri Day (observed)', $ke->firstWhere('date', '2027-12-13')['name']);
        $this->assertSame('Mazingira Day (observed)', $ke->firstWhere('date', '2027-10-11')['name']);
        $this->assertSame('Boxing Day (observed)', $ke->firstWhere('date', '2027-12-27')['name']);   // 27th: Christmas was Saturday, so the Monday is free
        $this->assertNotNull($ke->firstWhere('date', '2027-12-12'));   // the Sunday itself stays
        $ug = collect((new HolidayCalendar())->forYear('UG', 2027));
        $this->assertNull($ug->first(fn ($h) => str_contains($h['name'], 'observed')));
        $za = collect((new HolidayCalendar())->forYear('za', 2026));
        $this->assertNotNull($za->first(fn ($h) => str_contains($h['name'], 'observed')) ?: null) ?: null;
    }

    public function test_an_observed_holiday_moves_on_when_the_monday_is_taken(): void
    {
        // South Africa 2027: Christmas Dec 25 is a Saturday, Boxing Day Dec 26 a Sunday -> observed Monday Dec 27; 16 Dec is a Thursday.
        $za = collect((new HolidayCalendar())->forYear('ZA', 2027));
        $this->assertSame("Day of Goodwill (observed)", $za->firstWhere('date', '2027-12-27')['name']);
        // Rwanda 2023: Jan 1 is a Sunday: Rwanda does not move it
        $rw = collect((new HolidayCalendar())->forYear('RW', 2023));
        $this->assertNull($rw->firstWhere('date', '2023-01-03'));
        // Rwanda has no Easter
        $this->assertNull(collect((new HolidayCalendar())->forYear('RW', 2026))->firstWhere('name', 'Good Friday'));
        $this->assertNotNull(collect((new HolidayCalendar())->forYear('TZ', 2026))->firstWhere('name', 'Good Friday'));
    }

    public function test_the_calendar_refuses_what_it_does_not_know(): void
    {
        $this->fails(fn () => (new HolidayCalendar())->forYear('XX', 2026), 'not in the list');
        $this->fails(fn () => (new HolidayCalendar())->forYear('KE', 1999), 'between 2000 and 2100');
        $this->fails(fn () => (new HolidayCalendar())->forYear('KE', 2101), 'between 2000 and 2100');
        (new HolidayCalendar())->forYear('KE', 2000);
        (new HolidayCalendar())->forYear('KE', 2100);
        $this->assertSame(['KE', 'UG', 'TZ', 'RW', 'ZA'], array_column((new HolidayCalendar())->countries(), 'code'));
    }

    public function test_importing_adds_each_day_once_and_leaves_existing_holidays_as_they_are(): void
    {
        Holiday::create(['holiday_date' => '2026-12-25', 'name' => 'Our own name']);
        $r = (new HolidayCalendar())->import('KE', 2026);
        $this->assertSame(1, $r['skipped']);
        $this->assertSame(9, $r['added']);
        $this->assertSame('Our own name', Holiday::whereDate('holiday_date', '2026-12-25')->value('name'));
        $again = (new HolidayCalendar())->import('KE', 2026);
        $this->assertSame(['added' => 0, 'skipped' => 10], $again);
        $branch = (new HolidayCalendar())->import('KE', 2026, 1);   // a branch's own list does not clash with the all-branch one
        $this->assertSame(10, $branch['added']);
    }

    // ── overtime approval ─────────────────────────────────────────────────

    private function needApproval(bool $staff = false): void
    {
        MenusSettings::save(['rota_overtime_needs_approval' => true, 'rota_overtime_staff' => $staff], null);
    }

    public function test_overtime_is_paid_in_full_when_no_approval_is_asked_for(): void
    {
        $chef = $this->chefOf('Wanjiru Kamau');
        $row = \App\Models\AttendanceDay::find($this->attended($chef->user_id, '2026-10-05', '08:00', '19:00'));
        $this->assertFalse($this->ot()->required());
        $this->assertSame(120, $this->ot()->payable($chef->user_id, '2026-10-05', $row));
        $this->assertSame(0, $this->ot()->pendingCount($this->d('2026-10-01'), $this->d('2026-10-31')));
    }

    public function test_sync_makes_pending_entries_for_days_that_are_over(): void
    {
        $this->needApproval();
        $chef = $this->chefOf('Wanjiru Kamau');
        $this->attended($chef->user_id, '2026-10-05', '08:00', '19:00');   // 11 h = 120 min over
        $this->attended($chef->user_id, '2026-10-06', '08:00', '16:00');   // no overtime
        $this->attended($chef->user_id, '2026-10-12', '06:00', '20:00', ['sign_out_at' => null]);   // today, not signed out
        $this->assertSame(1, $this->ot()->sync($this->d('2026-10-01'), $this->d('2026-10-31'), true));
        $e = OvertimeEntry::first();
        $this->assertSame(120, (int) $e->minutes);
        $this->assertSame('pending', $e->status);
        $this->assertSame($chef->user_id, (int) $e->user_id);
        $this->assertSame($chef->id, (int) $e->chef_id);
        $this->assertSame(1, $this->toldCount('overtimeWaiting'));
        $this->assertSame(0, $this->ot()->sync($this->d('2026-10-01'), $this->d('2026-10-31'), true));   // safe to repeat
        $this->assertSame(1, $this->toldCount('overtimeWaiting'));
        $this->assertSame(1, $this->ot()->pendingCount($this->d('2026-10-01'), $this->d('2026-10-31')));
        $this->assertSame(0, $this->ot()->pendingCount($this->d('2026-11-01'), $this->d('2026-11-30')));
    }

    public function test_a_day_that_is_not_over_yet_is_not_synced(): void
    {
        $this->needApproval();
        $chef = $this->chefOf('Wanjiru Kamau');
        $this->attended($chef->user_id, '2026-10-12', '06:00', '11:59', ['overtime_minutes' => 90]);
        $this->assertSame(0, $this->ot()->sync($this->d('2026-10-12'), $this->d('2026-10-12')));
        Carbon::setTestNow($this->d('2026-10-13 00:00'));
        $this->assertSame(1, $this->ot()->sync($this->d('2026-10-12'), $this->d('2026-10-12')));
    }

    public function test_nothing_is_paid_until_approved_and_never_more_than_was_worked(): void
    {
        $this->needApproval();
        $chef = $this->chefOf('Wanjiru Kamau');
        $id = $this->attended($chef->user_id, '2026-10-05', '08:00', '19:00');
        $row = \App\Models\AttendanceDay::find($id);
        $this->ot()->sync($this->d('2026-10-01'), $this->d('2026-10-31'));
        $this->assertSame(0, $this->ot()->payable($chef->user_id, '2026-10-05', $row));
        $e = OvertimeEntry::first();
        $boss = $this->person('Boss');
        $this->ot()->decide($e, true, ' fine ', $boss, true);
        $this->assertSame(120, $this->ot()->payable($chef->user_id, '2026-10-05', $row));
        $this->assertSame('fine', $e->fresh()->note);
        $this->assertSame(0, $this->ot()->pendingCount($this->d('2026-10-01'), $this->d('2026-10-31')));
        // hours shrink after approval: paid at the smaller figure
        $row->update(['overtime_minutes' => 30]);
        $this->assertSame(30, $this->ot()->payable($chef->user_id, '2026-10-05', $row->fresh()));
        $this->ot()->sync($this->d('2026-10-01'), $this->d('2026-10-31'));
        $this->assertSame('approved', $e->fresh()->status);
        $this->assertSame(30, (int) $e->fresh()->minutes);
    }

    public function test_rejecting_pays_nothing_and_a_grown_approval_goes_back_to_waiting(): void
    {
        $this->needApproval();
        $chef = $this->chefOf('Wanjiru Kamau');
        $id = $this->attended($chef->user_id, '2026-10-05', '08:00', '19:00');
        $this->ot()->sync($this->d('2026-10-01'), $this->d('2026-10-31'));
        $e = OvertimeEntry::first();
        $this->ot()->decide($e, false, null, $this->person('Boss'), true);
        $row = \App\Models\AttendanceDay::find($id);
        $this->assertSame(0, $this->ot()->payable($chef->user_id, '2026-10-05', $row));
        $this->ot()->decide($e->fresh(), true, null, $this->person('Boss2'), true);
        \App\Models\AttendanceDay::whereKey($id)->update(['overtime_minutes' => 200]);
        $this->assertSame(1, $this->ot()->sync($this->d('2026-10-01'), $this->d('2026-10-31')));
        $fresh = $e->fresh();
        $this->assertSame('pending', $fresh->status);
        $this->assertSame(200, (int) $fresh->minutes);
        $this->assertNull($fresh->decided_by);
        $this->assertSame('Hours changed after approval', $fresh->note);
        // the hours vanish: a waiting entry is dropped, an approved one is zeroed
        \App\Models\AttendanceDay::whereKey($id)->update(['overtime_minutes' => 0]);
        $this->ot()->sync($this->d('2026-10-01'), $this->d('2026-10-31'));
        $this->assertSame(0, OvertimeEntry::count());
        \App\Models\AttendanceDay::whereKey($id)->update(['overtime_minutes' => 60]);
        $this->ot()->sync($this->d('2026-10-01'), $this->d('2026-10-31'));
        $this->ot()->decide(OvertimeEntry::first(), true, null, $this->person('Boss3'), true);
        \App\Models\AttendanceDay::whereKey($id)->update(['overtime_minutes' => 0]);
        $this->ot()->sync($this->d('2026-10-01'), $this->d('2026-10-31'));
        $this->assertSame(0, (int) OvertimeEntry::first()->minutes);
        $this->fails(fn () => $this->ot()->decide(OvertimeEntry::first(), true, null, $this->person('Boss4'), true), 'no overtime on that day');
    }

    public function test_nobody_decides_their_own_overtime_while_another_manager_exists(): void
    {
        $this->needApproval();
        $chef = $this->chefOf('Wanjiru Kamau');
        $this->attended($chef->user_id, '2026-10-05', '08:00', '19:00');
        $this->ot()->sync($this->d('2026-10-01'), $this->d('2026-10-31'));
        $e = OvertimeEntry::first();
        $me = User::find($chef->user_id);
        $this->fails(fn () => $this->ot()->decide($e, true, null, $me, true), 'Someone else has to decide');
        $this->assertSame('pending', $e->fresh()->status);
        $this->assertSame('approved', $this->ot()->decide($e, true, null, $me, false)->status);   // the only manager there is
    }

    public function test_the_rota_can_be_where_overtime_comes_from(): void
    {
        MenusSettings::save(['rota_overtime_source' => 'rota', 'rota_overtime_grace' => 15], null);
        $chef = $this->chefOf('Wanjiru Kamau');
        $this->shiftRow($chef->id, '2026-10-05', '08:00', '16:00');
        $a = \App\Models\AttendanceDay::find($this->attended($chef->user_id, '2026-10-05', '08:00', '16:30'));   // 30 min beyond: over the 15 grace
        $this->assertSame(30, $this->ot()->raw($chef->user_id, '2026-10-05', $a));
        $b = \App\Models\AttendanceDay::find($this->attended($chef->user_id, '2026-10-06', '08:00', '16:10'));
        $this->shiftRow($chef->id, '2026-10-06', '08:00', '16:00', 'published');
        $this->assertSame(0, $this->ot()->raw($chef->user_id, '2026-10-06', $b));   // within the grace
        $c = \App\Models\AttendanceDay::find($this->attended($chef->user_id, '2026-10-07', '08:00', '16:15'));
        $this->shiftRow($chef->id, '2026-10-07', '08:00', '16:00', 'published');
        $this->assertSame(0, $this->ot()->raw($chef->user_id, '2026-10-07', $c));   // exactly the grace is not over it
        $d = \App\Models\AttendanceDay::find($this->attended($chef->user_id, '2026-10-08', '08:00', '12:00'));   // a day nothing was rostered
        $this->assertSame(240, $this->ot()->raw($chef->user_id, '2026-10-08', $d));   // all of it counts when nothing was rostered
        $this->shiftRow($chef->id, '2026-10-08', '08:00', '09:00', 'draft');   // a draft is no promise
        $this->assertSame(240, $this->ot()->raw($chef->user_id, '2026-10-08', $d));
        MenusSettings::save(['rota_overtime_source' => 'attendance'], null);
        $this->assertSame(0, $this->ot()->raw($chef->user_id, '2026-10-05', $a));   // attendance recorded none
    }

    public function test_other_staff_are_covered_only_when_the_setting_says_so(): void
    {
        $this->needApproval(false);
        $staff = $this->person('Waiter Joe');
        DB::table('employees')->insert(['user_id' => $staff->id, 'base_salary' => 0, 'leave_balance' => 0, 'created_at' => now(), 'updated_at' => now()]);
        $this->attended($staff->id, '2026-10-05', '08:00', '19:00');
        $this->assertFalse($this->ot()->covers($staff->id));
        $this->assertSame(0, $this->ot()->sync($this->d('2026-10-01'), $this->d('2026-10-31')));
        $row = \App\Models\AttendanceDay::first();
        $this->assertSame(120, $this->ot()->payable($staff->id, '2026-10-05', $row));
        $this->needApproval(true);
        $this->assertTrue($this->ot()->coversStaff());
        $this->assertTrue($this->ot()->covers($staff->id));
        $this->assertFalse($this->ot()->covers($this->person('Not staff')->id));
        $this->assertSame(1, $this->ot()->sync($this->d('2026-10-01'), $this->d('2026-10-31')));
        $this->assertNull(OvertimeEntry::first()->chef_id);
        $this->assertSame(0, $this->ot()->payable($staff->id, '2026-10-05', $row));
        // a staff member who has left is not covered
        DB::table('employees')->update(['termination_date' => '2026-09-01']);
        OvertimeEntry::query()->delete();
        $this->assertSame(0, $this->ot()->sync($this->d('2026-10-01'), $this->d('2026-10-31')));
    }

    public function test_only_someone_who_may_mark_a_staff_members_attendance_decides_their_overtime(): void
    {
        $this->needApproval(true);
        $staff = $this->person('Waiter Joe');
        DB::table('employees')->insert(['user_id' => $staff->id, 'base_salary' => 0, 'leave_balance' => 0, 'created_at' => now(), 'updated_at' => now()]);
        $this->attended($staff->id, '2026-10-05', '08:00', '19:00');
        $this->ot()->sync($this->d('2026-10-01'), $this->d('2026-10-31'));
        $e = OvertimeEntry::first();
        $stranger = $this->person('Menus Manager');
        $this->perms[$stranger->id] = ['menus.manage'];
        $this->fails(fn () => $this->ot()->decide($e, true, null, $stranger, true), 'manager or the person marking their attendance');
        $this->assertSame('pending', $e->fresh()->status);
        $this->perms[$stranger->id][] = 'attendance.manage';
        $this->assertSame('approved', $this->ot()->decide($e, true, null, $stranger, true)->status);
    }

    public function test_the_overtime_rows_hide_other_staff_from_a_viewer_who_may_not_mark_them(): void
    {
        $this->needApproval(true);
        $chef = $this->chefOf('Wanjiru Kamau');
        $this->attended($chef->user_id, '2026-10-05', '08:00', '19:00');
        $staff = $this->person('Waiter Joe');
        DB::table('employees')->insert(['user_id' => $staff->id, 'base_salary' => 0, 'leave_balance' => 0, 'created_at' => now(), 'updated_at' => now()]);
        $this->attended($staff->id, '2026-10-06', '08:00', '19:00');
        $this->ot()->sync($this->d('2026-10-01'), $this->d('2026-10-31'));
        $viewer = $this->person('Menus Manager');
        $rows = $this->ot()->rows($this->d('2026-10-01'), $this->d('2026-10-31'), null, $viewer);
        $this->assertSame(['chef'], array_column($rows, 'kind'));
        $this->assertSame('Wanjiru Kamau', $rows[0]['chef']);
        $this->assertSame(2.0, $rows[0]['hours']);
        $this->perms[$viewer->id] = ['attendance.manage'];
        $this->assertSame(['chef', 'staff'], array_column($this->ot()->rows($this->d('2026-10-01'), $this->d('2026-10-31'), null, $viewer), 'kind'));
        $this->assertSame(['staff'], array_column($this->ot()->rows($this->d('2026-10-01'), $this->d('2026-10-31'), $staff->id), 'kind'));
        $this->assertCount(2, $this->ot()->rows($this->d('2026-10-01'), $this->d('2026-10-31')));
        $this->assertCount(0, $this->ot()->rows($this->d('2026-11-01'), $this->d('2026-11-30')));
    }

    public function test_pending_entries_come_first_in_the_rows(): void
    {
        $this->needApproval();
        $chef = $this->chefOf('Wanjiru Kamau');
        $this->attended($chef->user_id, '2026-10-05', '08:00', '19:00');
        $this->attended($chef->user_id, '2026-10-06', '08:00', '19:00');
        $this->ot()->sync($this->d('2026-10-01'), $this->d('2026-10-31'));
        $this->ot()->decide(OvertimeEntry::orderBy('id')->first(), true, null, $this->person('Boss'), true);
        $this->assertSame(['pending', 'approved'], array_column($this->ot()->rows($this->d('2026-10-01'), $this->d('2026-10-31')), 'status'));
    }

    // ── the pay report and contract pay ───────────────────────────────────

    public function test_the_day_figures(): void
    {
        $chef = $this->chefOf('Wanjiru Kamau');
        $this->shiftRow($chef->id, '2026-10-05', '08:00', '16:00');
        $this->shiftRow($chef->id, '2026-10-05', '17:00', '19:00');   // 10 h rostered
        $this->shiftRow($chef->id, '2026-10-05', '20:00', '21:00', 'draft');
        $row = \App\Models\AttendanceDay::find($this->attended($chef->user_id, '2026-10-05', '08:00', '16:00'));   // 8 h worked
        $d = $this->pay()->day($chef->id, '2026-10-05', $row, $this->now);
        $this->assertSame(['scheduled' => 600, 'worked' => 480, 'overtime' => 0, 'short' => 120], $d);
        $row->update(['minutes_worked' => 660]);
        $d = $this->pay()->day($chef->id, '2026-10-05', $row->fresh(), $this->now);
        $this->assertSame(60, $d['overtime']);
        $this->assertSame(0, $d['short']);
        // today is not over: no short time yet
        $this->shiftRow($chef->id, '2026-10-12', '08:00', '16:00');
        $this->assertSame(0, $this->pay()->day($chef->id, '2026-10-12', null, $this->now)['short']);
        $this->assertSame(480, $this->pay()->day($chef->id, '2026-10-12', null, $this->d('2026-10-13 00:01'))['short']);
        // a sign-in with no sign-out is nothing worked
        $half = \App\Models\AttendanceDay::find($this->attended($chef->user_id, '2026-10-06', '08:00', '12:00', ['sign_out_at' => null]));
        $this->assertSame(0, $this->pay()->day($chef->id, '2026-10-06', $half, $this->now)['worked']);
    }

    public function test_the_report_counts_hours_late_days_no_shows_and_unverified_days(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $b = $this->chefOf('Otieno Odhiambo');
        $this->chefOf('Idle Person');
        $this->shiftRow($a->id, '2026-10-05', '08:00', '16:00');
        $this->shiftRow($a->id, '2026-10-06', '08:00', '16:00');
        $this->shiftRow($a->id, '2026-10-07', '08:00', '16:00');
        $this->attended($a->user_id, '2026-10-05', '08:00', '17:00', ['status' => 'late']);   // an hour over: overtime past the grace
        $this->attended($a->user_id, '2026-10-06', '08:00', '16:00', ['verify_status' => 'marked']);   // not verified
        // the 7th: no sign-in at all
        $this->shiftRow($a->id, '2026-10-08', '08:00', '16:00');
        $this->attended($a->user_id, '2026-10-08', '08:00', '16:00');   // verified, present, on time
        $this->shiftRow($b->id, '2026-10-05', '08:00', '12:00');
        $rows = collect($this->pay()->report($this->d('2026-10-05'), $this->d('2026-10-11')));
        $this->assertSame(['Otieno Odhiambo', 'Wanjiru Kamau'], $rows->pluck('name')->all());
        $r = $rows->firstWhere('name', 'Wanjiru Kamau');
        $this->assertSame(32.0, $r['scheduled_h']);
        $this->assertSame(25.0, $r['worked_h']);
        $this->assertSame(1.0, $r['overtime_h']);
        $this->assertSame(8.0, $r['short_h']);   // only the 7th, not worked at all
        $this->assertSame(2, $r['unverified_days']);
        $this->assertSame(1, $r['no_shows']);
        $this->assertSame(1, $r['late_days']);
        $this->assertCount(4, $r['days']);
        $this->assertSame('08:00', $r['days'][0]['in']);
        $this->assertSame('17:00', $r['days'][0]['out']);
        $this->assertTrue($r['days'][0]['verified']);
        $this->assertFalse($r['days'][1]['verified']);
        $this->assertArrayNotHasKey('hourly_rate', $r);   // no money without the right
        $this->assertCount(1, $this->pay()->report($this->d('2026-10-05'), $this->d('2026-10-11'), false, null, $a->id));
        $this->assertCount(1, $this->pay()->report($this->d('2026-10-05'), $this->d('2026-10-11'), false, fn ($q) => $q->where('chef_id', $b->id)));
        $this->assertCount(0, $this->pay()->report($this->d('2026-10-19'), $this->d('2026-10-25')));
    }

    public function test_the_report_gives_money_figures_only_when_asked(): void
    {
        $chef = $this->chefOf('Wanjiru Kamau', [], ['base_salary' => 26000]);
        $this->shiftRow($chef->id, '2026-10-05', '08:00', '16:00');
        $this->attended($chef->user_id, '2026-10-05', '08:00', '18:00');   // two hours over
        $this->prem()->saveRule(['kind' => 'night', 'name' => 'Evening', 'extra_pct' => 50, 'starts_at' => '17:00', 'ends_at' => '23:00']);
        $r = $this->pay()->report($this->d('2026-10-05'), $this->d('2026-10-11'), true)[0];
        // October 2026 has 22 working days (Mon-Fri); a day is 9 hours (08:00-17:00) => 26000 / 22 / 9
        $rate = 26000 / 22 / 9;
        $this->assertEqualsWithDelta($rate, $r['hourly_rate'], 0.01);
        $this->assertEqualsWithDelta(round(2 * $rate * 1.5, 2), $r['overtime_pay'], 0.01);
        $this->assertSame(1.0, $r['premium_hours']);
        $this->assertEqualsWithDelta(round($rate * 0.5, 2), $r['premium_pay'], 0.01);
        $none = $this->chefOf('No Employee Record');
        $this->shiftRow($none->id, '2026-10-05', '08:00', '16:00');
        $x = collect($this->pay()->report($this->d('2026-10-05'), $this->d('2026-10-11'), true))->firstWhere('name', 'No Employee Record');
        $this->assertNull($x['hourly_rate']);
        $this->assertNull($x['overtime_pay']);
    }

    public function test_the_hourly_rate_counts_the_last_day_of_the_month_and_a_chef_with_no_counted_shift_has_a_default_shift_length(): void
    {
        $chef = $this->chefOf('Wanjiru Kamau', [], ['base_salary' => 21000]);
        $this->shiftRow($chef->id, '2026-11-30', '08:00', '16:00');
        // November 2026 has 21 working days (Mon-Fri), ending on a Monday: 21000 / 21 / 9
        $r = $this->pay()->report($this->d('2026-11-30'), $this->d('2026-11-30'), true)[0];
        $this->assertEqualsWithDelta(21000 / 21 / 9, $r['hourly_rate'], 0.01);
        $c = $this->chefOf('Otieno Odhiambo', ['pay_mode' => 'per_shift', 'shift_rate' => 800]);
        $x = $this->pay()->contractPay(User::find($c->user_id), $this->d('2026-10-01'), $this->d('2026-10-31'));
        $this->assertSame(0, $x['shifts']);
        $this->assertSame(100.0, $x['hourly']);   // 800 over a default 8-hour shift
    }

    public function test_the_report_shows_overtime_waiting_for_approval(): void
    {
        $this->needApproval();
        $chef = $this->chefOf('Wanjiru Kamau');
        $this->shiftRow($chef->id, '2026-10-05', '08:00', '16:00');
        $this->attended($chef->user_id, '2026-10-05', '08:00', '19:00');
        $this->ot()->sync($this->d('2026-10-01'), $this->d('2026-10-31'));
        $this->assertSame(2.0, $this->pay()->report($this->d('2026-10-05'), $this->d('2026-10-11'))[0]['overtime_pending_h']);
        $this->ot()->decide(OvertimeEntry::first(), true, null, $this->person('Boss'), true);
        $this->assertSame(0.0, $this->pay()->report($this->d('2026-10-05'), $this->d('2026-10-11'))[0]['overtime_pending_h']);
    }

    public function test_a_waiting_entry_that_shrinks_is_not_news_and_nothing_waits_when_approval_is_off(): void
    {
        $this->needApproval();
        $chef = $this->chefOf('Wanjiru Kamau');
        $id = $this->attended($chef->user_id, '2026-10-05', '08:00', '19:00');
        $this->assertSame(1, $this->ot()->sync($this->d('2026-10-01'), $this->d('2026-10-31')));
        \App\Models\AttendanceDay::whereKey($id)->update(['overtime_minutes' => 30]);
        $this->assertSame(0, $this->ot()->sync($this->d('2026-10-01'), $this->d('2026-10-31')));
        $this->assertSame(30, (int) OvertimeEntry::first()->minutes);
        MenusSettings::save(['rota_overtime_needs_approval' => false], null);
        $this->assertSame(0, $this->ot()->pendingCount($this->d('2026-10-01'), $this->d('2026-10-31')));
    }

    public function test_the_csv_is_safe_to_open_in_a_spreadsheet(): void
    {
        $rows = [['name' => '=cmd|calc', 'scheduled_h' => 8, 'worked_h' => 8, 'overtime_h' => 0, 'short_h' => 0, 'unverified_days' => 0, 'no_shows' => 0, 'late_days' => 0, 'hourly_rate' => 0, 'overtime_pay' => 0],
            ['name' => 'Wanjiru', 'scheduled_h' => 8, 'worked_h' => 9, 'overtime_h' => 1, 'overtime_pending_h' => 1, 'short_h' => 0, 'unverified_days' => 1, 'no_shows' => 0, 'late_days' => 2, 'hourly_rate' => 100, 'overtime_pay' => 150, 'premium_hours' => 2, 'premium_pay' => 40]];
        $csv = $this->pay()->csv($rows, false);
        $lines = array_filter(explode("\n", $csv));
        $this->assertCount(3, $lines);
        $this->assertStringContainsString("'=cmd|calc", $lines[1]);
        $this->assertStringNotContainsString('Hourly rate', $lines[0]);
        $this->assertSame('Wanjiru,8,9,1,1,0,1,0,2', trim($lines[2]));
        $money = array_filter(explode("\n", $this->pay()->csv($rows, true)));
        $this->assertStringEndsWith('"Hourly rate","Overtime pay","Premium hours","Premium pay"', trim(reset($money)));
        $this->assertStringEndsWith('100,150,2,40', trim(array_values($money)[2]));
        foreach (['+1', '-1', '@x'] as $bad) {
            $this->assertStringContainsString("'".$bad, $this->pay()->csv([['name' => $bad] + $rows[0]], false));
        }
    }

    private function contract(array $chefOpts, string $mode): array
    {
        $chef = $this->chefOf('Wanjiru Kamau', ['pay_mode' => $mode] + $chefOpts);
        $u = User::find($chef->user_id);
        $this->shiftRow($chef->id, '2026-10-05', '08:00', '16:00');
        $this->shiftRow($chef->id, '2026-10-06', '08:00', '16:00');
        $this->shiftRow($chef->id, '2026-10-07', '08:00', '16:00');
        $this->shiftRow($chef->id, '2026-10-08', '08:00', '16:00');
        $this->shiftRow($chef->id, '2026-10-09', '08:00', '16:00');
        $this->attended($chef->user_id, '2026-10-05', '08:00', '16:00');        // full
        $this->attended($chef->user_id, '2026-10-06', '08:00', '12:00');        // exactly half: counts (50%)
        $this->attended($chef->user_id, '2026-10-07', '08:00', '11:59');        // just under half: does not count
        $this->attended($chef->user_id, '2026-10-08', '08:00', '18:00');        // ten hours, eight rostered
        $this->attended($chef->user_id, '2026-10-09', '08:00', '16:00', ['verify_status' => 'marked']);   // not verified
        $this->attended($chef->user_id, '2026-10-10', '08:00', '16:00');        // nothing rostered
        $this->told = [$chef];

        return [$u, $chef];
    }

    public function test_pay_per_shift(): void
    {
        [$u] = $this->contract(['shift_rate' => 2000], 'per_shift');
        $r = $this->pay()->contractPay($u, $this->d('2026-10-01'), $this->d('2026-10-31'));
        $this->assertSame('per_shift', $r['mode']);
        $this->assertSame(3, $r['shifts']);   // the 5th, the 6th (half) and the 8th
        $this->assertSame(6000.0, $r['basic']);
        $this->assertSame(24.0, $r['hours']);
        $this->assertSame(250.0, $r['hourly']);   // 2000 over an 8-hour shift
        $all = $this->pay()->contractPay($u, $this->d('2026-10-01'), $this->d('2026-10-31'), false);
        $this->assertSame(4, $all['shifts']);   // the unverified day counts when verification is not asked for
        MenusSettings::save(['rota_shift_min_share' => 51], null);
        $this->assertSame(2, $this->pay()->contractPay($u, $this->d('2026-10-01'), $this->d('2026-10-31'))['shifts']);
    }

    public function test_pay_per_hour_is_capped_at_the_rostered_hours(): void
    {
        [$u] = $this->contract(['hour_rate' => 300], 'per_hour');
        $r = $this->pay()->contractPay($u, $this->d('2026-10-01'), $this->d('2026-10-31'));
        // the 5th: 8 h, the 6th: 4 h, the 7th: 3h59 (counts for hours), the 8th: 8 h (capped)
        $this->assertSame(round((480 + 240 + 239 + 480) / 60, 2), $r['hours']);
        $this->assertSame(round((480 + 240 + 239 + 480) / 60 * 300, 2), $r['basic']);
        $this->assertSame(300.0, $r['hourly']);
    }

    public function test_salaried_chefs_and_other_people_have_no_contract_pay(): void
    {
        [$u] = $this->contract([], 'salary');
        $this->assertNull($this->pay()->contractPay($u, $this->d('2026-10-01'), $this->d('2026-10-31')));
        $this->assertNull($this->pay()->contractPay($this->person('Nobody'), $this->d('2026-10-01'), $this->d('2026-10-31')));
    }

    public function test_the_report_shows_contract_pay_when_money_is_allowed(): void
    {
        $this->contract(['shift_rate' => 2000], 'per_shift');
        $r = $this->pay()->report($this->d('2026-10-05'), $this->d('2026-10-11'), true)[0];
        $this->assertSame('per_shift', $r['pay_mode']);
        $this->assertSame(4, $r['contract_shifts']);   // the report is not limited to verified days
        $this->assertSame(8000.0, $r['contract_basic']);
        $this->assertSame(250.0, $r['hourly_rate']);
    }

    // ── clocking in by place ──────────────────────────────────────────────

    private function atBranch(array $o = []): void
    {
        DB::table('locations')->where('id', 1)->update(['latitude' => -1.2864, 'longitude' => 36.8172] + $o);
    }

    private function modes(string $mode, array $more = []): void
    {
        MenusSettings::save(['rota_clock_location' => $mode] + $more, null);
    }

    public function test_distance_between_points(): void
    {
        $this->assertEqualsWithDelta(0, RotaSites::distance(-1.2864, 36.8172, -1.2864, 36.8172), 0.001);
        $this->assertEqualsWithDelta(111195, RotaSites::distance(0, 0, 1, 0), 100);   // a degree of latitude
        $this->assertEqualsWithDelta(111195, RotaSites::distance(0, 0, 0, 1), 100);
        $this->assertEqualsWithDelta(RotaSites::distance(-1.28, 36.8, -1.3, 36.9), RotaSites::distance(-1.3, 36.9, -1.28, 36.8), 0.001);
    }

    public function test_with_the_check_off_everyone_is_let_in(): void
    {
        $r = $this->sites()->check(1, []);
        $this->assertSame('ok', $r['result']);
        $this->assertFalse($r['blocked']);
    }

    public function test_a_branch_without_a_point_is_never_checked_and_its_own_point_is_used_otherwise(): void
    {
        $this->modes('require');
        $this->assertSame('no_site', $this->sites()->check(1, [])['result']);
        $this->atBranch();
        $this->assertSame('branch', $this->sites()->site(1)['source']);
        $this->assertSame(150, $this->sites()->site(1)['radius']);
        $this->sites()->save(1, ['latitude' => -1.3, 'longitude' => 36.9, 'radius_m' => 300]);
        $s = $this->sites()->site(1);
        $this->assertSame('site', $s['source']);
        $this->assertSame(300, $s['radius']);
        $this->assertSame(-1.3, $s['lat']);
        $this->sites()->save(1, ['radius_m' => 80, 'is_active' => false]);
        $this->assertNull($this->sites()->site(1));   // switched off for this branch
    }

    public function test_require_turns_away_the_chef_who_is_far_gives_no_position_or_a_poor_one(): void
    {
        $this->modes('require');
        $this->atBranch();
        $near = $this->sites()->check(1, ['lat' => -1.2865, 'lng' => 36.8173, 'accuracy' => 20]);
        $this->assertSame('ok', $near['result']);
        $this->assertSame('gps', $near['method']);
        $this->assertFalse($near['blocked']);
        $far = $this->sites()->check(1, ['lat' => -1.30, 'lng' => 36.9, 'accuracy' => 20]);
        $this->assertSame('outside', $far['result']);
        $this->assertTrue($far['blocked']);
        $this->assertGreaterThan(5000, $far['distance']);
        $this->assertStringContainsString('m from the branch', $far['message']);
        $none = $this->sites()->check(1, []);
        $this->assertSame('no_position', $none['result']);
        $this->assertTrue($none['blocked']);
        $this->assertSame('no_position', $this->sites()->check(1, ['lat' => 'x', 'lng' => 36.8])['result']);
        $this->assertSame('no_position', $this->sites()->check(1, ['lat' => 95, 'lng' => 36.8])['result']);
        $this->assertSame('no_position', $this->sites()->check(1, ['lat' => -1.28, 'lng' => 181])['result']);
        $poor = $this->sites()->check(1, ['lat' => -1.2865, 'lng' => 36.8173, 'accuracy' => 250]);
        $this->assertSame('poor_signal', $poor['result']);
        $this->assertTrue($poor['blocked']);
        $this->assertSame('poor_signal', $this->sites()->check(1, ['lat' => -1.2865, 'lng' => 36.8173])['result']);   // unknown accuracy
        $this->assertSame('ok', $this->sites()->check(1, ['lat' => -1.2865, 'lng' => 36.8173, 'accuracy' => 200])['result']);   // exactly the limit
    }

    public function test_the_accuracy_circle_may_reach_the_branch(): void
    {
        $this->modes('require');
        $this->atBranch();
        // about 222 m north of the branch: outside a 150 m radius, but inside it with 100 m of doubt
        $lat = -1.2864 + 0.002;
        $this->assertSame('outside', $this->sites()->check(1, ['lat' => $lat, 'lng' => 36.8172, 'accuracy' => 10])['result']);
        $this->assertSame('ok', $this->sites()->check(1, ['lat' => $lat, 'lng' => 36.8172, 'accuracy' => 100])['result']);
    }

    public function test_warn_lets_the_chef_in_but_says_so(): void
    {
        $this->modes('warn');
        $this->atBranch();
        $r = $this->sites()->check(1, ['lat' => -1.30, 'lng' => 36.9, 'accuracy' => 20]);
        $this->assertSame('warned', $r['result']);
        $this->assertFalse($r['blocked']);
        $this->assertNotNull($r['message']);
        $this->assertFalse($this->sites()->check(1, [])['blocked']);
    }

    public function test_site_validation(): void
    {
        $this->fails(fn () => $this->sites()->save(9, ['radius_m' => 100]), 'does not exist');
        $this->fails(fn () => $this->sites()->save(1, ['latitude' => 1.2, 'radius_m' => 100]), 'both the latitude and the longitude');
        $this->fails(fn () => $this->sites()->save(1, ['longitude' => 1.2, 'radius_m' => 100]), 'both the latitude and the longitude');
        $this->fails(fn () => $this->sites()->save(1, ['latitude' => 91, 'longitude' => 1, 'radius_m' => 100]), 'between -90 and 90');
        $this->fails(fn () => $this->sites()->save(1, ['latitude' => 1, 'longitude' => -181, 'radius_m' => 100]), 'between -90 and 90');
        $this->fails(fn () => $this->sites()->save(1, ['latitude' => 'a', 'longitude' => 1, 'radius_m' => 100]), 'between -90 and 90');
        $this->fails(fn () => $this->sites()->save(1, ['radius_m' => 19]), 'between 20 and 5000');
        $this->fails(fn () => $this->sites()->save(1, ['radius_m' => 5001]), 'between 20 and 5000');
        $this->sites()->save(1, ['latitude' => 90, 'longitude' => -180, 'radius_m' => 20]);
        $this->sites()->save(1, ['latitude' => '', 'longitude' => '', 'radius_m' => 5000]);   // back to the branch's own point
        $this->assertSame(1, DB::table('menus_clock_sites')->count());
        $this->assertNull(DB::table('menus_clock_sites')->value('latitude'));
    }

    public function test_the_branch_wifi_is_proof_enough(): void
    {
        $this->modes('require', ['rota_clock_wifi' => true]);
        $this->atBranch();
        $this->sites()->save(1, ['radius_m' => 100, 'networks' => "41.90.12.34\n10.0.0.0/24, 2001:db8::/32"]);
        $this->assertSame('wifi', $this->sites()->check(1, [], ['ip' => '41.90.12.34'])['method']);
        $this->assertSame('wifi', $this->sites()->check(1, [], ['ip' => '10.0.0.77'])['method']);
        $this->assertSame('wifi', $this->sites()->check(1, [], ['ip' => '2001:db8::5'])['method']);
        $this->assertSame('no_position', $this->sites()->check(1, [], ['ip' => '10.0.1.1'])['result']);
        $this->assertSame('no_position', $this->sites()->check(1, [], ['ip' => 'garbage'])['result']);
        $this->assertSame('no_position', $this->sites()->check(2, [], ['ip' => '41.90.12.34'])['result'] === 'no_site' ? 'no_position' : 'x');
        MenusSettings::save(['rota_clock_wifi' => false], null);
        $this->assertSame('no_position', $this->sites()->check(1, [], ['ip' => '41.90.12.34'])['result']);
        MenusSettings::save(['rota_clock_wifi' => true], null);
        $this->sites()->save(1, ['radius_m' => 100, 'is_active' => false, 'networks' => '41.90.12.34']);
        $this->assertFalse($this->sites()->onBranchNetwork(1, '41.90.12.34'));   // a switched-off place trusts no address
    }

    public function test_network_list_validation(): void
    {
        $this->fails(fn () => $this->sites()->save(1, ['radius_m' => 100, 'networks' => 'wifi.example.com']), 'not an internet address');
        $this->fails(fn () => $this->sites()->save(1, ['radius_m' => 100, 'networks' => '10.0.0.0/x']), 'not an internet address');
        $this->fails(fn () => $this->sites()->save(1, ['radius_m' => 100, 'networks' => '10.0.0.999']), 'not an internet address');
        $this->fails(fn () => $this->sites()->save(1, ['radius_m' => 100, 'networks' => implode(' ', array_map(fn ($i) => "10.0.0.{$i}", range(1, 21)))]), 'at most 20');
        $this->sites()->save(1, ['radius_m' => 100, 'networks' => implode(' ', array_map(fn ($i) => "10.0.0.{$i}", range(1, 20)))]);
        $this->sites()->save(1, ['radius_m' => 100, 'networks' => '']);
        $this->assertNull(DB::table('menus_clock_sites')->value('networks'));
        $this->sites()->save(1, ['radius_m' => 100, 'networks' => '1.1.1.1 1.1.1.1']);
        $this->assertSame('1.1.1.1', DB::table('menus_clock_sites')->value('networks'));
        $this->sites()->save(1, ['radius_m' => 60]);   // networks left alone when not sent
        $this->assertSame('1.1.1.1', DB::table('menus_clock_sites')->value('networks'));
    }

    // ── the door code ─────────────────────────────────────────────────────

    private function door(): RotaDoor
    {
        return app(RotaDoor::class);
    }

    public function test_door_codes_are_off_by_default(): void
    {
        $this->assertNull($this->door()->verify($this->door()->code(1)));
    }

    public function test_a_rotating_code_names_its_branch_and_lasts_two_slots(): void
    {
        MenusSettings::save(['rota_clock_qr' => 'rotating', 'rota_clock_qr_minutes' => 2], null);
        $code = $this->door()->code(7);
        $this->assertSame(7, $this->door()->verify($code));
        $this->assertSame(7, $this->door()->verify($code, $this->now->copy()->addMinutes(2)));   // the next slot: still fine
        $this->assertNull($this->door()->verify($code, $this->now->copy()->addMinutes(5)));
        $this->assertNull($this->door()->verify($code, $this->now->copy()->subMinutes(10)));
        $this->assertNull($this->door()->verify('dr.7X1.ABCDEFGH'));
        $this->assertNull($this->door()->verify('tk.'.substr($code, 3)));
        $this->assertNull($this->door()->verify(substr($code, 0, -1).'0'));
        $this->assertNull($this->door()->verify('nonsense'));
        $this->assertNotSame($this->door()->code(7), $this->door()->code(8));
        $this->assertSame(120 - ($this->now->timestamp % 120), $this->door()->secondsLeft());
        $this->assertStringEndsWith('/clock/'.$code, $this->door()->url($code));
        $this->assertStringContainsString('<svg', $this->door()->svg(7));
    }

    public function test_a_fixed_code_never_changes_and_never_runs_out(): void
    {
        MenusSettings::save(['rota_clock_qr' => 'fixed'], null);
        $code = $this->door()->code(3);
        $this->assertSame($code, $this->door()->code(3));
        $this->assertSame(3, $this->door()->verify($code, $this->now->copy()->addYear()));
        $this->assertNull($this->door()->secondsLeft());
        // a code made while rotating is not good once the door is on fixed
        MenusSettings::save(['rota_clock_qr' => 'rotating'], null);
        $rot = $this->door()->code(3);
        MenusSettings::save(['rota_clock_qr' => 'fixed'], null);
        $this->assertNull($this->door()->verify($rot));
    }

    public function test_a_door_code_proves_presence_at_that_branch_only(): void
    {
        $this->modes('require', ['rota_clock_qr' => 'rotating']);
        $this->atBranch();
        $far = ['lat' => -1.30, 'lng' => 36.9, 'accuracy' => 20];
        $r = $this->sites()->check(1, $far, ['door' => $this->door()->code(1)]);
        $this->assertSame('qr', $r['method']);
        $this->assertFalse($r['blocked']);
        $this->assertTrue($this->sites()->check(1, $far, ['door' => $this->door()->code(2)])['blocked']);   // another branch's door
        $this->assertTrue($this->sites()->check(1, $far, ['door' => 'rubbish'])['blocked']);
    }

    // ── the clock log ─────────────────────────────────────────────────────

    public function test_every_clock_in_is_logged_with_how_it_was_proved_and_refusals_too(): void
    {
        $this->modes('require', ['rota_clock_qr' => 'rotating']);
        $this->atBranch();
        $chef = $this->chefOf('Wanjiru Kamau');
        $u = User::find($chef->user_id);
        $this->shiftRow($chef->id, '2026-10-12', '12:00', '17:00');
        $clock = app(RotaClock::class);
        $this->fails(fn () => $clock->clockIn($u, ['lat' => -1.30, 'lng' => 36.9, 'accuracy' => 20]), 'from the branch');
        $this->assertSame(0, DB::table('attendance_days')->count());
        $this->assertSame('outside', DB::table('menus_clock_events')->value('result'));
        $clock->clockIn($u, ['lat' => -1.30, 'lng' => 36.9, 'accuracy' => 20], ['door' => $this->door()->code(1)]);
        $this->assertSame(1, DB::table('attendance_days')->count());
        $last = DB::table('menus_clock_events')->orderByDesc('id')->first();
        $this->assertSame('ok', $last->result);
        $this->assertSame(-1.30, (float) $last->latitude);
        $this->assertSame(36.9, (float) $last->longitude);
        $this->assertSame(20, (int) $last->accuracy_m);
        $this->assertSame('qr', $last->method);
        $this->assertSame('in', $last->action);
        $this->assertSame($chef->id, (int) $last->chef_id);
        $this->assertNull($clock->notice);
        $this->assertCount(1, $this->sites()->events());   // only the refusal is a "problem"
        $this->assertSame('outside', $this->sites()->events()[0]['result']);
        $this->assertCount(2, $this->sites()->events(14, false));
        // clocking out is never refused for being away, but is kept
        Carbon::setTestNow($this->d('2026-10-12 17:00'));
        $clock->clockOut($u, ['lat' => -1.30, 'lng' => 36.9, 'accuracy' => 20]);
        $this->assertSame('out', DB::table('menus_clock_events')->orderByDesc('id')->value('action'));
        $this->assertSame('outside', DB::table('menus_clock_events')->orderByDesc('id')->value('result'));
    }

    public function test_warn_mode_lets_the_chef_in_and_gives_the_notice(): void
    {
        $this->modes('warn');
        $this->atBranch();
        $chef = $this->chefOf('Wanjiru Kamau');
        $this->shiftRow($chef->id, '2026-10-12', '12:00', '17:00');
        $clock = app(RotaClock::class);
        $clock->clockIn(User::find($chef->user_id), ['lat' => -1.30, 'lng' => 36.9, 'accuracy' => 20]);
        $this->assertStringContainsString('m from the branch', (string) $clock->notice);
        $this->assertSame('warned', DB::table('menus_clock_events')->value('result'));
        $this->assertSame(1, DB::table('attendance_days')->count());
    }

    public function test_with_the_check_off_nothing_is_logged(): void
    {
        $chef = $this->chefOf('Wanjiru Kamau');
        $this->shiftRow($chef->id, '2026-10-12', '12:00', '17:00');
        app(RotaClock::class)->clockIn(User::find($chef->user_id));
        $this->assertSame(0, DB::table('menus_clock_events')->count());
    }

    public function test_the_clock_card_says_which_proofs_are_available(): void
    {
        $chef = $this->chefOf('Wanjiru Kamau');
        $u = User::find($chef->user_id);
        $s = app(RotaClock::class)->status($u);
        $this->assertSame('off', $s['location_mode']);
        $this->assertFalse($s['door_codes']);
        $this->assertFalse($s['wifi']);
        $this->modes('warn', ['rota_clock_qr' => 'fixed', 'rota_clock_wifi' => true]);
        $s = app(RotaClock::class)->status($u);
        $this->assertSame('warn', $s['location_mode']);
        $this->assertTrue($s['door_codes']);
        $this->assertTrue($s['wifi']);
    }

    public function test_sites_rows_list_every_branch(): void
    {
        $this->atBranch();
        $this->sites()->save(1, ['latitude' => -1.3, 'longitude' => 36.9, 'radius_m' => 120, 'networks' => '1.2.3.4']);
        $rows = $this->sites()->rows();
        $this->assertSame('Kitchen', $rows[0]['name']);
        $this->assertSame(-1.2864, $rows[0]['branch_latitude']);
        $this->assertSame(-1.3, $rows[0]['latitude']);
        $this->assertSame(120, $rows[0]['radius_m']);
        $this->assertSame('1.2.3.4', $rows[0]['networks']);
        $this->assertTrue($rows[0]['checked']);
    }
}
