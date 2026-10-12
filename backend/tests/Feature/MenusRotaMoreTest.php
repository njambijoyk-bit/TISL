<?php

namespace Tests\Feature;

use App\Models\Menus\DayOff;
use App\Models\Menus\OpenClaim;
use App\Models\Menus\OpenShift;
use App\Models\Menus\RotaPattern;
use App\Models\Menus\Shift;
use App\Models\Menus\Swap;
use App\Services\Attendance\AttendanceService;
use App\Services\Books\BooksException;
use App\Services\Menus\MenusSettings;
use App\Services\Menus\RotaAttendance;
use App\Services\Menus\RotaBoard;
use App\Services\Menus\RotaClock;
use App\Services\Menus\RotaPatterns;
use App\Services\Menus\RotaService;
use App\Services\Menus\RotaSwaps;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Menus step 13-14: swaps, weekly patterns, the open shift board, the attendance check and clocking in from the rota. "Now" is Monday 12 Oct 2026, 12:00. */
class MenusRotaMoreTest extends TestCase
{
    use Concerns\CreatesRotaWorld;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createRotaWorld();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function rota(): RotaService
    {
        return app(RotaService::class);
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

    /** a published shift made through the rule book */
    private function shift(int $chefId, string $date = '2026-10-14', string $from = '08:00', string $to = '16:00'): Shift
    {
        $s = $this->rota()->saveShift(['chef_id' => $chefId, 'location_id' => 1, 'date' => $date, 'starts_at' => $from, 'ends_at' => $to])['shift'];
        $s->update(['status' => 'published', 'published_at' => now()]);

        return $s->fresh();
    }

    // ── swaps ─────────────────────────────────────────────────────────────

    private function swaps(): RotaSwaps
    {
        return app(RotaSwaps::class);
    }

    public function test_a_swap_is_asked_agreed_and_approved_and_the_shift_changes_hands(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $b = $this->chefOf('Otieno Odhiambo');
        $s = $this->shift($a->id);
        $sw = $this->swaps()->ask(['shift_id' => $s->id, 'to_chef_id' => $b->id, 'note' => ' please '], $this->person('Boss'));
        $this->assertSame('asked', $sw->status);
        $this->assertSame('please', $sw->note);
        $this->assertSame(1, $this->toldCount('swapAsked'));
        $sw = $this->swaps()->respond($sw, $b, true);
        $this->assertSame('agreed', $sw->status);
        $this->assertSame(1, $this->toldCount('swapNeedsApproval'));
        $this->assertSame($a->id, Shift::find($s->id)->chef_id);   // not yet
        $sw = $this->swaps()->decide($sw, true, 'ok', $this->person('Manager'));
        $this->assertSame('approved', $sw->status);
        $this->assertSame($b->id, Shift::find($s->id)->chef_id);
        $this->assertSame('published', Shift::find($s->id)->status);
        $this->assertSame(1, $this->toldCount('swapDecided'));
    }

    public function test_a_swap_in_return_trades_both_shifts(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $b = $this->chefOf('Otieno Odhiambo');
        $s1 = $this->shift($a->id, '2026-10-14', '08:00', '16:00');
        $s2 = $this->shift($b->id, '2026-10-14', '08:00', '16:00');   // same hours: each would clash without the trade
        $sw = $this->swaps()->ask(['shift_id' => $s1->id, 'to_chef_id' => $b->id, 'return_shift_id' => $s2->id]);
        $sw = $this->swaps()->respond($sw, $b, true);
        $this->swaps()->decide($sw, true);
        $this->assertSame($b->id, Shift::find($s1->id)->chef_id);
        $this->assertSame($a->id, Shift::find($s2->id)->chef_id);
    }

    public function test_a_swap_goes_straight_through_when_approval_is_switched_off(): void
    {
        MenusSettings::save(['rota_swaps_need_approval' => false], null);
        $a = $this->chefOf('Wanjiru Kamau');
        $b = $this->chefOf('Otieno Odhiambo');
        $s = $this->shift($a->id);
        $sw = $this->swaps()->respond($this->swaps()->ask(['shift_id' => $s->id, 'to_chef_id' => $b->id]), $b, true);
        $this->assertSame('approved', $sw->status);
        $this->assertSame($b->id, Shift::find($s->id)->chef_id);
        $this->assertSame(0, $this->toldCount('swapNeedsApproval'));
    }

    public function test_asking_for_a_swap_is_refused_for_the_wrong_shift_or_colleague(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $b = $this->chefOf('Otieno Odhiambo');
        $gone = $this->chefOf('Left Us', ['is_active' => false]);
        $draft = $this->rota()->saveShift(['chef_id' => $a->id, 'location_id' => 1, 'date' => '2026-10-15', 'starts_at' => '08:00', 'ends_at' => '16:00'])['shift'];
        $started = $this->shift($a->id, '2026-10-12', '08:00', '16:00');   // it is 12:00: running
        $c = $this->chefOf('Achieng Auma');
        $later = $this->shift($c->id, '2026-10-12', '13:00', '17:00');
        $ok = $this->shift($a->id, '2026-10-16');
        $this->fails(fn () => $this->swaps()->ask(['shift_id' => 999, 'to_chef_id' => $b->id]), 'published shift that has not started');
        $this->fails(fn () => $this->swaps()->ask(['shift_id' => $draft->id, 'to_chef_id' => $b->id]), 'published shift that has not started');
        $this->fails(fn () => $this->swaps()->ask(['shift_id' => $started->id, 'to_chef_id' => $b->id]), 'has not started');
        $this->swaps()->ask(['shift_id' => $later->id, 'to_chef_id' => $b->id]);   // starts in an hour: still fine
        $this->fails(fn () => $this->swaps()->ask(['shift_id' => $ok->id, 'to_chef_id' => 999]), 'Choose a colleague');
        $this->fails(fn () => $this->swaps()->ask(['shift_id' => $ok->id, 'to_chef_id' => $gone->id]), 'Choose a colleague');
        $this->fails(fn () => $this->swaps()->ask(['shift_id' => $ok->id, 'to_chef_id' => $a->id]), 'other than yourself');
        $other = $this->shift($a->id, '2026-10-17');
        $this->fails(fn () => $this->swaps()->ask(['shift_id' => $ok->id, 'to_chef_id' => $b->id, 'return_shift_id' => $other->id]), 'one of your colleague');
        $theirs = $this->shift($b->id, '2026-10-20');
        $this->fails(fn () => $this->swaps()->ask(['shift_id' => $ok->id, 'to_chef_id' => $b->id, 'return_shift_id' => 999]), 'one of your colleague');
        $this->swaps()->ask(['shift_id' => $ok->id, 'to_chef_id' => $b->id, 'return_shift_id' => $theirs->id]);
    }

    public function test_a_shift_can_be_in_only_one_open_swap(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $b = $this->chefOf('Otieno Odhiambo');
        $c = $this->chefOf('Achieng Auma');
        $s = $this->shift($a->id);
        $sw = $this->swaps()->ask(['shift_id' => $s->id, 'to_chef_id' => $b->id]);
        $this->fails(fn () => $this->swaps()->ask(['shift_id' => $s->id, 'to_chef_id' => $c->id]), 'already part of a swap');
        $theirs = $this->shift($c->id, '2026-10-20');
        $this->fails(fn () => $this->swaps()->ask(['shift_id' => $theirs->id, 'to_chef_id' => $a->id, 'return_shift_id' => $s->id]), 'already part of a swap');
        $this->swaps()->cancel($sw);
        $this->swaps()->ask(['shift_id' => $s->id, 'to_chef_id' => $c->id]);
    }

    public function test_the_colleague_must_be_able_to_work_it(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $b = $this->chefOf('Otieno Odhiambo');
        $s = $this->shift($a->id, '2026-10-14', '08:00', '16:00');
        $this->shift($b->id, '2026-10-14', '12:00', '18:00');
        $this->fails(fn () => $this->swaps()->ask(['shift_id' => $s->id, 'to_chef_id' => $b->id]), 'already works 12:00 to 18:00');
        $off = $this->shift($a->id, '2026-10-15');
        $this->rota()->requestDayOff($b, ['from' => '2026-10-15'], null, true);
        $this->fails(fn () => $this->swaps()->ask(['shift_id' => $off->id, 'to_chef_id' => $b->id]), 'is off');
    }

    public function test_only_the_asked_colleague_answers_and_only_once(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $b = $this->chefOf('Otieno Odhiambo');
        $c = $this->chefOf('Achieng Auma');
        $s = $this->shift($a->id);
        $sw = $this->swaps()->ask(['shift_id' => $s->id, 'to_chef_id' => $b->id]);
        $this->fails(fn () => $this->swaps()->respond($sw, $c, true), 'asked of someone else');
        $d = $this->swaps()->respond($sw, $b, false, ' no thanks ');
        $this->assertSame('declined', $d->status);
        $this->assertSame('no thanks', $d->decision_note);
        $this->assertSame(1, $this->toldCount('swapAnswered'));
        $this->fails(fn () => $this->swaps()->respond($d, $b, true), 'answered already');
        $this->assertSame($a->id, Shift::find($s->id)->chef_id);
    }

    public function test_a_manager_can_decline_and_only_an_agreed_swap_can_be_decided(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $b = $this->chefOf('Otieno Odhiambo');
        $s = $this->shift($a->id);
        $sw = $this->swaps()->ask(['shift_id' => $s->id, 'to_chef_id' => $b->id]);
        $this->fails(fn () => $this->swaps()->decide($sw, true), 'has not answered yet');
        $sw = $this->swaps()->respond($sw, $b, true);
        $d = $this->swaps()->decide($sw, false, 'no', $this->person('Manager'));
        $this->assertSame('declined', $d->status);
        $this->assertSame($a->id, Shift::find($s->id)->chef_id);
        $this->fails(fn () => $this->swaps()->decide($d, true), 'settled already');
    }

    public function test_a_swap_runs_out_when_the_shift_changes_or_starts(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $b = $this->chefOf('Otieno Odhiambo');
        $s = $this->shift($a->id, '2026-10-12', '13:00', '17:00');
        $sw = $this->swaps()->respond($this->swaps()->ask(['shift_id' => $s->id, 'to_chef_id' => $b->id]), $b, true);
        Carbon::setTestNow(Carbon::parse('2026-10-12 14:00', 'Africa/Nairobi'));
        $this->fails(fn () => $this->swaps()->decide($sw, true), 'has run out');
        $this->assertSame('expired', $sw->fresh()->status);
        // the shift moved to somebody else while the swap waited
        Carbon::setTestNow($this->now);
        $c = $this->chefOf('Achieng Auma');
        $s2 = $this->shift($a->id, '2026-10-15');
        $sw2 = $this->swaps()->respond($this->swaps()->ask(['shift_id' => $s2->id, 'to_chef_id' => $b->id]), $b, true);
        Shift::whereKey($s2->id)->update(['chef_id' => $c->id]);
        $this->fails(fn () => $this->swaps()->decide($sw2, true), 'has run out');
        // answering a swap whose shift has started
        $s3 = $this->shift($c->id, '2026-10-12', '12:30', '17:00');
        $sw3 = $this->swaps()->ask(['shift_id' => $s3->id, 'to_chef_id' => $b->id]);
        Carbon::setTestNow(Carbon::parse('2026-10-12 13:00', 'Africa/Nairobi'));
        $this->fails(fn () => $this->swaps()->respond($sw3, $b, true), 'has run out');
        $this->assertSame('expired', $sw3->fresh()->status);
    }

    public function test_an_approval_that_no_longer_fits_changes_nothing(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $b = $this->chefOf('Otieno Odhiambo');
        $s1 = $this->shift($a->id, '2026-10-14', '08:00', '16:00');
        $s2 = $this->shift($b->id, '2026-10-14', '18:00', '22:00');
        $sw = $this->swaps()->respond($this->swaps()->ask(['shift_id' => $s1->id, 'to_chef_id' => $b->id]), $b, true);
        Shift::whereKey($s2->id)->update(['starts_at' => '15:00:00']);   // now b would clash
        $this->fails(fn () => $this->swaps()->decide($sw, true), 'already works');
        $this->assertSame($a->id, Shift::find($s1->id)->chef_id);
        $this->assertSame('agreed', $sw->fresh()->status);
    }

    public function test_expire_sweeps_swaps_whose_shift_has_started(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $b = $this->chefOf('Otieno Odhiambo');
        $soon = $this->shift($a->id, '2026-10-12', '13:00', '17:00');
        $far = $this->shift($a->id, '2026-10-20');
        $this->swaps()->ask(['shift_id' => $soon->id, 'to_chef_id' => $b->id]);
        $this->swaps()->ask(['shift_id' => $far->id, 'to_chef_id' => $b->id]);
        $this->assertSame(0, $this->swaps()->expire());
        $this->assertSame(1, $this->swaps()->expire(Carbon::parse('2026-10-12 13:30', 'Africa/Nairobi')));
        $this->assertSame(['expired', 'asked'], Swap::orderBy('id')->pluck('status')->all());
    }

    public function test_cancel_and_the_rows_each_person_sees(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $b = $this->chefOf('Otieno Odhiambo');
        $c = $this->chefOf('Achieng Auma');
        $s = $this->shift($a->id);
        $sw = $this->swaps()->ask(['shift_id' => $s->id, 'to_chef_id' => $b->id]);
        $this->assertCount(1, $this->swaps()->rows($a, false));
        $this->assertCount(1, $this->swaps()->rows($b, false));
        $this->assertCount(0, $this->swaps()->rows($c, false));
        $this->assertCount(1, $this->swaps()->rows(null, true));
        $row = $this->swaps()->rows($b, false)[0];
        $this->assertTrue($row['can_respond']);
        $this->assertFalse($row['can_decide']);
        $this->assertFalse($this->swaps()->rows($a, false)[0]['can_respond']);
        $this->assertTrue($this->swaps()->rows($a, false)[0]['can_cancel']);
        $this->assertFalse($this->swaps()->rows($b, false)[0]['can_cancel']);
        $this->assertCount(0, $this->swaps()->rows(null, true, fn ($q) => $q->where('location_id', 99)));   // a branch the viewer may not see
        $this->swaps()->cancel($sw);
        $this->fails(fn () => $this->swaps()->cancel($sw->fresh()), 'settled already');
    }

    // ── patterns ──────────────────────────────────────────────────────────

    private function patterns(): RotaPatterns
    {
        return app(RotaPatterns::class);
    }

    private function pattern(int $chefId, array $o = []): array
    {
        return $this->patterns()->save($o + ['chef_id' => $chefId, 'location_id' => 1, 'weekdays' => [1, 3], 'starts_at' => '08:00', 'ends_at' => '16:00', 'valid_from' => '2026-10-12']);
    }

    public function test_a_pattern_is_made_for_each_weekday_chosen(): void
    {
        $c = $this->chefOf('Wanjiru Kamau');
        $made = $this->pattern($c->id, ['weekdays' => [3, 1, 3], 'note' => ' open ']);
        $this->assertCount(2, $made);
        $this->assertSame([3, 1], array_map(fn ($p) => $p->weekday, $made));
        $this->assertSame('open', $made[0]->note);
        $this->assertNull($made[0]->valid_to);
        $this->assertTrue($made[0]->is_active);
    }

    public function test_pattern_validation(): void
    {
        $c = $this->chefOf('Wanjiru Kamau');
        $gone = $this->chefOf('Left Us', ['is_active' => false]);
        $this->fails(fn () => $this->pattern($gone->id), 'Choose a chef');
        $this->fails(fn () => $this->pattern($c->id, ['location_id' => 9]), 'branch');
        $this->fails(fn () => $this->pattern($c->id, ['weekdays' => []]), 'days of the week');
        $this->fails(fn () => $this->pattern($c->id, ['weekdays' => [8]]), 'days of the week');
        $this->fails(fn () => $this->pattern($c->id, ['weekdays' => [0]]), 'days of the week');
        $this->fails(fn () => $this->pattern($c->id, ['starts_at' => '8am']), 'start time');
        $this->fails(fn () => $this->pattern($c->id, ['ends_at' => '24:30']), 'finish time');
        $this->fails(fn () => $this->pattern($c->id, ['starts_at' => '16:00', 'ends_at' => '08:00']), 'finish after it starts');
        $this->fails(fn () => $this->pattern($c->id, ['starts_at' => '08:00', 'ends_at' => '08:30']), 'between 1 and 16');
        $this->fails(fn () => $this->pattern($c->id, ['starts_at' => '04:00', 'ends_at' => '21:00']), 'between 1 and 16');
        $this->fails(fn () => $this->pattern($c->id, ['valid_from' => '2026-10-20', 'valid_to' => '2026-10-19']), 'before the first');
        $this->fails(fn () => $this->pattern($c->id, ['valid_from' => '']), 'first day');
        $this->assertSame(0, RotaPattern::count());
        $this->pattern($c->id, ['weekdays' => [7], 'starts_at' => '04:00', 'ends_at' => '20:00']);
        $this->assertSame(1, RotaPattern::count());
    }

    public function test_patterns_of_one_chef_may_not_overlap_while_both_run(): void
    {
        $c = $this->chefOf('Wanjiru Kamau');
        $this->pattern($c->id, ['weekdays' => [1], 'valid_to' => '2026-12-31']);
        $this->fails(fn () => $this->pattern($c->id, ['weekdays' => [1], 'starts_at' => '15:00', 'ends_at' => '20:00']), 'already has a pattern on Monday 08:00 to 16:00');
        $this->pattern($c->id, ['weekdays' => [1], 'starts_at' => '16:00', 'ends_at' => '20:00']);   // back to back
        $this->pattern($c->id, ['weekdays' => [1], 'valid_from' => '2027-01-01']);   // the first has ended
        $this->pattern($c->id, ['weekdays' => [2]]);   // another day
        $other = $this->chefOf('Otieno Odhiambo');
        $this->pattern($other->id, ['weekdays' => [1]]);
        $this->assertSame(5, RotaPattern::count());
    }

    public function test_editing_a_pattern_does_not_clash_with_itself_and_an_inactive_one_does_not_block(): void
    {
        $c = $this->chefOf('Wanjiru Kamau');
        $p = $this->pattern($c->id, ['weekdays' => [1]])[0];
        $e = $this->patterns()->save(['ends_at' => '17:00', 'weekday' => 1, 'valid_to' => null], $p)[0];
        $this->assertSame('17:00', substr((string) $e->ends_at, 0, 5));
        $this->patterns()->setActive($p, false);
        $this->pattern($c->id, ['weekdays' => [1], 'starts_at' => '09:00', 'ends_at' => '12:00']);
        $this->assertSame(2, RotaPattern::count());
    }

    public function test_apply_plans_a_week_of_drafts_and_leaves_what_is_there(): void
    {
        $c = $this->chefOf('Wanjiru Kamau');
        $this->pattern($c->id, ['weekdays' => [1, 3, 5]]);   // Mon, Wed, Fri
        $r = $this->patterns()->apply(Carbon::parse('2026-10-12'));
        $this->assertSame(3, $r['created']);   // Monday is today: still planned
        $this->assertSame(['2026-10-12', '2026-10-14', '2026-10-16'], Shift::orderBy('shift_date')->pluck('shift_date')->map(fn ($d) => $d->toDateString())->all());
        $this->assertSame('draft', Shift::first()->status);
        $this->assertNotNull(Shift::first()->pattern_id);
        $again = $this->patterns()->apply(Carbon::parse('2026-10-12'));
        $this->assertSame(0, $again['created']);
        $this->assertSame([], $again['skipped']);
        $this->assertSame(3, Shift::count());
    }

    public function test_apply_skips_the_past_days_before_start_after_end_and_inactive_or_other_branch(): void
    {
        $c = $this->chefOf('Wanjiru Kamau');
        $this->pattern($c->id, ['weekdays' => [1, 2], 'valid_from' => '2026-10-13', 'valid_to' => '2026-10-13']);   // only Tue 13
        $this->assertSame(1, $this->patterns()->apply(Carbon::parse('2026-10-12'))['created']);
        $this->assertSame(0, $this->patterns()->apply(Carbon::parse('2026-10-19'))['created']);
        $this->assertSame(0, $this->patterns()->apply(Carbon::parse('2026-10-05'))['created']);   // a week gone by
        $d = $this->chefOf('Otieno Odhiambo');
        $p = $this->pattern($d->id, ['weekdays' => [4]])[0];
        $this->patterns()->setActive($p, false);
        $this->assertSame(0, $this->patterns()->apply(Carbon::parse('2026-10-12'))['created']);
        $this->patterns()->setActive($p, true);
        $this->assertSame(0, $this->patterns()->apply(Carbon::parse('2026-10-12'), 9)['created']);
        $this->assertSame(1, $this->patterns()->apply(Carbon::parse('2026-10-12'), 1)['created']);
    }

    public function test_apply_says_why_a_day_was_left_out(): void
    {
        $c = $this->chefOf('Wanjiru Kamau');
        $this->rota()->requestDayOff($c, ['from' => '2026-10-14'], null, true);
        $this->pattern($c->id, ['weekdays' => [3, 4]]);
        $r = $this->patterns()->apply(Carbon::parse('2026-10-12'));
        $this->assertSame(1, $r['created']);
        $this->assertCount(1, $r['skipped']);
        $this->assertStringContainsString('Wanjiru Kamau Wed 14 Oct: Wanjiru Kamau is off', $r['skipped'][0]);
    }

    public function test_plan_ahead_covers_this_week_and_the_next_weeks_and_tells_once(): void
    {
        $c = $this->chefOf('Wanjiru Kamau');
        $this->pattern($c->id, ['weekdays' => [1]]);
        MenusSettings::save(['rota_ahead_weeks' => 2], null);
        $this->assertSame(3, $this->patterns()->planAhead());   // Mon 12, 19, 26
        $this->assertSame(1, $this->toldCount('planned'));
        $this->assertSame(0, $this->patterns()->planAhead());
        $this->assertSame(1, $this->toldCount('planned'));
        MenusSettings::save(['rota_ahead_weeks' => 0], null);
        Shift::query()->delete();
        $this->assertSame(0, $this->patterns()->planAhead());
    }

    public function test_deleting_a_pattern_removes_its_future_drafts_only(): void
    {
        $c = $this->chefOf('Wanjiru Kamau');
        $p = $this->pattern($c->id, ['weekdays' => [1]])[0];
        $this->patterns()->apply(Carbon::parse('2026-10-12'));
        $this->patterns()->apply(Carbon::parse('2026-10-19'));
        $this->patterns()->apply(Carbon::parse('2026-10-26'));
        Shift::where('shift_date', '2026-10-19')->update(['status' => 'published']);
        Shift::where('shift_date', '2026-10-12')->update(['shift_date' => '2026-10-05']);   // a past draft
        $this->assertSame(1, $this->patterns()->delete($p));   // the 26th
        $this->assertSame(2, Shift::count());
        $this->assertSame(0, RotaPattern::count());
    }

    public function test_pattern_rows_can_be_limited(): void
    {
        $c = $this->chefOf('Wanjiru Kamau');
        $this->pattern($c->id, ['weekdays' => [2, 1]]);
        $rows = $this->patterns()->rows();
        $this->assertSame(['Mon', 'Tue'], array_map(fn ($r) => substr($r['weekday_label'], 0, 3), $rows));
        $this->assertCount(0, $this->patterns()->rows(fn ($q) => $q->where('location_id', 9)));
    }

    // ── the open shift board ──────────────────────────────────────────────

    private function board(): RotaBoard
    {
        return app(RotaBoard::class);
    }

    private function openPost(array $o = []): OpenShift
    {
        return $this->board()->post($o + ['location_id' => 1, 'date' => '2026-10-14', 'starts_at' => '08:00', 'ends_at' => '16:00']);
    }

    public function test_posting_validation(): void
    {
        $this->fails(fn () => $this->openPost(['location_id' => 9]), 'branch');
        $this->fails(fn () => $this->openPost(['date' => '']), 'Choose the day');
        $this->fails(fn () => $this->openPost(['date' => '2026-10-11']), 'today or a day to come');
        $this->fails(fn () => $this->openPost(['starts_at' => '8']), 'like 08:30');
        $this->fails(fn () => $this->openPost(['ends_at' => '24:00']), 'like 08:30');
        $this->fails(fn () => $this->openPost(['starts_at' => '16:00', 'ends_at' => '08:00']), 'finish after it starts');
        $this->fails(fn () => $this->openPost(['starts_at' => '08:00', 'ends_at' => '08:59']), 'between 1 and 16');
        $this->fails(fn () => $this->openPost(['starts_at' => '03:00', 'ends_at' => '20:00']), 'between 1 and 16');
        $this->fails(fn () => $this->openPost(['date' => '2026-10-12', 'starts_at' => '08:00', 'ends_at' => '12:00']), 'started already');
        $this->assertSame(0, OpenShift::count());
        $this->openPost(['date' => '2026-10-12', 'starts_at' => '12:30', 'ends_at' => '14:00']);
        $this->openPost(['starts_at' => '04:00', 'ends_at' => '20:00']);
        $this->assertSame(2, OpenShift::count());
    }

    public function test_posting_tells_only_the_chefs_who_could_take_it(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $b = $this->chefOf('Otieno Odhiambo');
        $this->chefOf('Left Us', ['is_active' => false]);
        $this->shift($a->id, '2026-10-14', '10:00', '12:00');
        $o = $this->openPost();
        $this->assertSame(1, $this->toldCount('openPosted'));
        $this->assertNull($this->board()->problem($o, $b));
        $this->assertStringContainsString('already works', (string) $this->board()->problem($o, $a));
    }

    public function test_a_chef_claims_and_a_manager_awards_it(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $b = $this->chefOf('Otieno Odhiambo');
        $o = $this->openPost(['note' => 'Cover the grill']);
        $this->board()->claim($o, $a, ' me ');
        $this->board()->claim($o, $b);
        $this->assertSame(2, $this->toldCount('claimAsked'));
        $this->fails(fn () => $this->board()->claim($o, $a), 'claimed this one already');
        $done = $this->board()->award($o, $b, $this->person('Boss'));
        $this->assertSame('filled', $done->status);
        $this->assertSame($b->id, $done->filled_chef_id);
        $shift = Shift::find($done->filled_shift_id);
        $this->assertSame('published', $shift->status);
        $this->assertSame($b->id, $shift->chef_id);
        $this->assertSame('Cover the grill', $shift->note);
        $this->assertSame(['declined', 'awarded'], OpenClaim::orderBy('chef_id')->pluck('status')->all());
        $this->assertSame(1, $this->toldCount('openFilled'));
        $this->fails(fn () => $this->board()->claim($done, $a), 'not open any more');
        $this->fails(fn () => $this->board()->award($done, $a), 'not open any more');
    }

    public function test_with_approval_off_the_first_free_chef_gets_it(): void
    {
        MenusSettings::save(['rota_claims_need_approval' => false], null);
        $a = $this->chefOf('Wanjiru Kamau');
        $o = $this->openPost();
        $r = $this->board()->claim($o, $a);
        $this->assertSame('filled', $r->status);
        $this->assertSame(0, $this->toldCount('claimAsked'));
        $this->assertSame('awarded', OpenClaim::first()->status);
    }

    public function test_a_chef_who_can_not_work_it_can_not_claim_and_awarding_checks_again(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $b = $this->chefOf('Otieno Odhiambo', ['station_ids' => [5]]);
        $o = $this->openPost(['station_id' => null]);
        $this->rota()->requestDayOff($a, ['from' => '2026-10-14'], null, true);
        $this->fails(fn () => $this->board()->claim($o, $a), 'is off');
        $w = $this->chefOf('Achieng Auma');
        $this->board()->claim($o, $w);
        $this->shift($w->id, '2026-10-14', '09:00', '10:00');   // after claiming, a clash
        $this->fails(fn () => $this->board()->award($o, $w), 'already works');
        $this->assertSame('open', $o->fresh()->status);
        $this->assertSame(1, Shift::count());
        $this->fails(fn () => $this->board()->award($o, $b), 'has not claimed');
    }

    public function test_a_chef_who_is_not_set_up_for_the_station_is_told_so(): void
    {
        $b = $this->chefOf('Otieno Odhiambo', ['station_ids' => [5]]);
        $o = OpenShift::create(['location_id' => 1, 'station_id' => 2, 'shift_date' => '2026-10-14', 'starts_at' => '08:00', 'ends_at' => '12:00', 'status' => 'open']);
        $this->assertStringContainsString('not set up for that station', (string) $this->board()->problem($o, $b));
        $o->update(['station_id' => 5]);
        $this->assertNull($this->board()->problem($o, $b));
    }

    public function test_withdrawing_a_claim(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $o = $this->openPost();
        $this->fails(fn () => $this->board()->withdraw($o, $a), 'no claim');
        $this->board()->claim($o, $a);
        $this->board()->withdraw($o, $a);
        $this->assertSame('withdrawn', OpenClaim::first()->status);
        $this->fails(fn () => $this->board()->award($o, $a), 'has not claimed');
        $this->board()->claim($o, $a);   // can claim again
        $this->assertSame(1, OpenClaim::count());
        $this->assertSame('requested', OpenClaim::first()->status);
    }

    public function test_giving_a_shift_back_keeps_it_theirs_until_somebody_takes_it(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $b = $this->chefOf('Otieno Odhiambo');
        $s = $this->shift($a->id);
        $o = $this->board()->release($s);
        $this->assertSame($s->id, $o->release_shift_id);
        $this->assertSame($a->id, Shift::find($s->id)->chef_id);
        $this->fails(fn () => $this->board()->release($s), 'on the board already');
        $this->assertStringContainsString('your own shift', (string) $this->board()->problem($o, $a));
        $this->fails(fn () => $this->board()->claim($o, $a), 'your own shift');
        $this->told = [];
        $this->board()->claim($o, $b);
        $this->board()->award($o, $b);
        $this->assertNull(Shift::find($s->id));   // taken off the one who gave it back
        $this->assertSame(1, Shift::where('chef_id', $b->id)->count());
        $this->assertGreaterThanOrEqual(1, $this->toldCount('changed'));   // the old chef is told it is gone
    }

    public function test_only_a_published_shift_that_has_not_started_can_be_given_back(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $draft = $this->rota()->saveShift(['chef_id' => $a->id, 'location_id' => 1, 'date' => '2026-10-15', 'starts_at' => '08:00', 'ends_at' => '12:00'])['shift'];
        $this->fails(fn () => $this->board()->release($draft), 'Only a published shift');
        $running = $this->shift($a->id, '2026-10-12', '11:00', '13:00');
        $this->fails(fn () => $this->board()->release($running), 'Only a published shift');
    }

    public function test_cancel_and_expire(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $o = $this->openPost();
        $this->board()->claim($o, $a);
        $this->board()->cancel($o);
        $this->assertSame('cancelled', $o->fresh()->status);
        $this->assertSame('declined', OpenClaim::first()->status);
        $this->fails(fn () => $this->board()->cancel($o->fresh()), 'not open any more');
        $soon = $this->openPost(['date' => '2026-10-12', 'starts_at' => '13:00', 'ends_at' => '17:00']);
        $far = $this->openPost(['date' => '2026-10-20']);
        $this->board()->claim($soon, $a);
        $this->assertSame(0, $this->board()->expire());
        $this->assertSame(1, $this->board()->expire(Carbon::parse('2026-10-12 13:00', 'Africa/Nairobi')));
        $this->assertSame('expired', $soon->fresh()->status);
        $this->assertSame('open', $far->fresh()->status);
        $this->assertSame('declined', OpenClaim::where('open_id', $soon->id)->value('status'));
    }

    public function test_board_rows_for_a_chef_and_a_manager(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $b = $this->chefOf('Otieno Odhiambo');
        $o = $this->openPost();
        $this->rota()->requestDayOff($b, ['from' => '2026-10-14'], null, true);
        $this->board()->claim($o, $a);
        $mine = $this->board()->rows($a, false)[0];
        $this->assertTrue($mine['claimed']);
        $this->assertFalse($mine['can_claim']);
        $this->assertSame([], $mine['claims']);
        $this->assertFalse($mine['can_cancel']);
        $theirs = $this->board()->rows($b, false)[0];
        $this->assertFalse($theirs['can_claim']);
        $this->assertStringContainsString('is off', (string) $theirs['cannot_because']);
        $m = $this->board()->rows(null, true)[0];
        $this->assertTrue($m['can_cancel']);
        $this->assertSame('Wanjiru Kamau', $m['claims'][0]['chef']);
        $this->assertCount(0, $this->board()->rows(null, true, fn ($q) => $q->where('location_id', 9)));
        $c = $this->chefOf('Achieng Auma');
        $this->assertTrue($this->board()->rows($c, false)[0]['can_claim']);
        // a shift filled long ago is not shown
        $this->board()->award($o, $a);
        $this->assertCount(1, $this->board()->rows($a, false));
        OpenShift::whereKey($o->id)->update(['updated_at' => '2026-10-01 00:00:00']);
        $this->assertCount(0, $this->board()->rows($a, false));
    }

    // ── the attendance check ──────────────────────────────────────────────

    private function states(): array
    {
        return app(RotaAttendance::class)->states(Shift::all(), now());
    }

    public function test_a_shift_that_has_not_started_has_no_state(): void
    {
        $c = $this->chefOf('Wanjiru Kamau');
        $this->shift($c->id, '2026-10-12', '13:00', '17:00');
        $this->assertSame([], $this->states());
    }

    public function test_states_signed_in_late_not_in_and_no_show(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $b = $this->chefOf('Otieno Odhiambo');
        $c = $this->chefOf('Achieng Auma');
        $d = $this->chefOf('Mwangi Kariuki');
        $s1 = $this->shift($a->id, '2026-10-12', '08:00', '16:00');
        $s2 = $this->shift($b->id, '2026-10-12', '08:00', '16:00');
        $s3 = $this->shift($c->id, '2026-10-12', '08:00', '16:00');
        $s4 = $this->shift($d->id, '2026-10-12', '06:00', '11:00');
        $this->attended($a->user_id, '2026-10-12', '08:10', '12:00', ['sign_out_at' => null]);   // within the 15 minutes' grace
        $this->attended($b->user_id, '2026-10-12', '08:30', '12:00', ['sign_out_at' => null]);   // 30 minutes late
        $st = $this->states();
        $this->assertSame('on_time', $st[$s1->id]['state']);
        $this->assertSame('late', $st[$s2->id]['state']);
        $this->assertSame(30, $st[$s2->id]['late_minutes']);
        $this->assertSame('08:30', $st[$s2->id]['in']);
        $this->assertSame('not_in', $st[$s3->id]['state']);
        $this->assertSame('no_show', $st[$s4->id]['state']);
    }

    public function test_exactly_at_the_grace_line_is_on_time_and_just_inside_it_has_no_verdict(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $b = $this->chefOf('Otieno Odhiambo');
        $s1 = $this->shift($a->id, '2026-10-12', '08:00', '16:00');
        $this->attended($a->user_id, '2026-10-12', '08:15', '09:00', ['sign_out_at' => null]);
        $this->assertSame('on_time', $this->states()[$s1->id]['state']);
        $s2 = $this->shift($b->id, '2026-10-12', '11:50', '16:00');   // started 10 minutes ago, still inside the grace
        $this->assertArrayNotHasKey($s2->id, $this->states());
    }

    public function test_leaving_early_and_being_away_and_lateness_only_on_the_first_shift_of_the_day(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $b = $this->chefOf('Otieno Odhiambo');
        $s1 = $this->shift($a->id, '2026-10-12', '06:00', '08:00');
        $s2 = $this->shift($a->id, '2026-10-12', '09:00', '11:00');
        $this->attended($a->user_id, '2026-10-12', '07:00', '11:00');
        $st = $this->states();
        $this->assertSame('late', $st[$s1->id]['state']);
        $this->assertSame('on_time', $st[$s2->id]['state']);   // the day's one sign-in is late only for the first shift
        $e = $this->chefOf('Achieng Auma');
        $s4 = $this->shift($e->id, '2026-10-12', '08:00', '11:00');
        $this->attended($e->user_id, '2026-10-12', '08:00', '09:00');
        $this->assertSame('left_early', $this->states()[$s4->id]['state']);
        $s5 = $this->shift($this->chefOf('Mwangi Kariuki')->id, '2026-10-12', '08:00', '11:00');
        $this->attended(\App\Models\Menus\Chef::find($s5->chef_id)->user_id, '2026-10-12', '08:00', '10:45');   // within the grace of the end
        $this->assertSame('on_time', $this->states()[$s5->id]['state']);
        $s3 = $this->shift($b->id, '2026-10-12', '08:00', '16:00');
        DB::table('attendance_days')->insert(['user_id' => $b->user_id, 'work_date' => '2026-10-12', 'status' => 'leave', 'created_at' => now(), 'updated_at' => now()]);
        $this->assertSame('away', $this->states()[$s3->id]['state']);
    }

    public function test_drafts_are_not_judged(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $this->rota()->saveShift(['chef_id' => $a->id, 'location_id' => 1, 'date' => '2026-10-12', 'starts_at' => '06:00', 'ends_at' => '11:00']);
        $this->assertSame([], $this->states());
    }

    public function test_attended_hours(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $b = $this->chefOf('Otieno Odhiambo');
        $this->attended($a->user_id, '2026-10-12', '08:00', '12:30');
        $this->attended($a->user_id, '2026-10-13', '08:00', '10:00');
        $this->attended($a->user_id, '2026-10-20', '08:00', '10:00');   // another week
        $h = app(RotaAttendance::class)->attendedHours(\App\Models\Menus\Chef::all(), Carbon::parse('2026-10-12'), Carbon::parse('2026-10-18'));
        $this->assertSame(6.5, $h[$a->id]);
        $this->assertSame(0.0, $h[$b->id]);
    }

    public function test_the_watch_tells_the_managers_once_per_shift(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $b = $this->chefOf('Otieno Odhiambo');
        $this->shift($a->id, '2026-10-12', '08:00', '16:00');   // not in
        $this->shiftRow($b->id, '2026-10-11', '08:00', '16:00');   // yesterday, never came
        $this->shiftRow($b->id, '2026-10-10', '08:00', '16:00');   // too old
        $ok = $this->chefOf('Achieng Auma');
        $this->shift($ok->id, '2026-10-12', '08:00', '16:00');
        $this->attended($ok->user_id, '2026-10-12', '08:00', '09:00', ['sign_out_at' => null]);
        $this->assertSame(2, app(RotaAttendance::class)->watch());
        $this->assertSame(2, $this->toldCount('notIn'));
        $this->assertSame(0, app(RotaAttendance::class)->watch());   // once only
        $this->assertSame(2, Shift::whereNotNull('watch_notified_at')->count());
        $this->assertEqualsCanonicalizing(['not_in', 'no_show'], array_map(fn ($t) => end($t), array_filter($this->told, fn ($t) => $t[0] === 'notIn')));
    }

    public function test_the_watch_can_be_switched_off(): void
    {
        MenusSettings::save(['rota_no_show_alerts' => false], null);
        $a = $this->chefOf('Wanjiru Kamau');
        $this->shift($a->id, '2026-10-12', '08:00', '16:00');
        $this->assertSame(0, app(RotaAttendance::class)->watch());
        $this->assertSame(0, $this->toldCount('notIn'));
    }

    // ── clocking in from the rota ─────────────────────────────────────────

    private function clock(): RotaClock
    {
        return app(RotaClock::class);
    }

    public function test_clock_status_for_the_chef(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $u = \App\Models\User::find($a->user_id);
        $this->assertFalse($this->clock()->status($this->person('Not A Chef'))['chef']);
        $this->assertSame('You have no shift today.', $this->clock()->status($u)['message']);
        $this->shift($a->id, '2026-10-12', '13:00', '17:00');   // opens at 12:30; it is 12:00
        $s = $this->clock()->status($u);
        $this->assertFalse($s['can_in']);
        $this->assertStringContainsString('starts at 13:00', $s['message']);
        $this->assertStringContainsString('from 12:30', $s['message']);
        Carbon::setTestNow(Carbon::parse('2026-10-12 12:30', 'Africa/Nairobi'));   // exactly when it opens
        $this->assertTrue($this->clock()->status($u)['can_in']);
        MenusSettings::save(['rota_clock_from_rota' => false], null);
        $this->assertFalse($this->clock()->status($u)['available']);
    }

    public function test_clocking_in_and_out_is_the_attendance_sign_in(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $u = \App\Models\User::find($a->user_id);
        $this->shift($a->id, '2026-10-12', '12:00', '17:00');
        $day = $this->clock()->clockIn($u);
        $this->assertSame('present', $day->status);
        $this->assertSame(1, DB::table('attendance_days')->count());
        $this->fails(fn () => $this->clock()->clockIn($u), 'You signed in at');
        $this->assertFalse($this->clock()->status($u)['can_in']);
        $this->assertTrue($this->clock()->status($u)['can_out']);
        Carbon::setTestNow(Carbon::parse('2026-10-12 17:05', 'Africa/Nairobi'));
        $out = $this->clock()->clockOut($u);
        $this->assertNotNull($out->sign_out_at);
        $this->fails(fn () => $this->clock()->clockOut($u), 'You signed out at');
    }

    public function test_lateness_is_judged_against_the_shift_not_the_working_day(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $b = $this->chefOf('Otieno Odhiambo');
        $this->shift($a->id, '2026-10-12', '11:00', '17:00');   // started an hour ago: late (the working day starts at 08:00, so Attendance alone would also say late)
        $this->shift($b->id, '2026-10-12', '12:00', '17:00');   // starts now: on time, although 12:00 is long past 08:15
        $this->assertSame('late', $this->clock()->clockIn(\App\Models\User::find($a->user_id))->status);
        $this->assertSame('present', $this->clock()->clockIn(\App\Models\User::find($b->user_id))->status);
    }

    public function test_clocking_in_is_refused_without_a_shift_that_is_open(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $u = \App\Models\User::find($a->user_id);
        $this->fails(fn () => $this->clock()->clockIn($u), 'no shift today');
        $this->shift($a->id, '2026-10-12', '14:00', '18:00');   // opens at 13:30
        $this->fails(fn () => $this->clock()->clockIn($u), 'from 13:30');
        $this->rota()->saveShift(['chef_id' => $a->id, 'location_id' => 1, 'date' => '2026-10-12', 'starts_at' => '12:30', 'ends_at' => '13:30']);   // a draft does not count
        $this->fails(fn () => $this->clock()->clockIn($u), 'from 13:30');
        $this->fails(fn () => $this->clock()->clockIn($this->person('Nobody')), 'chef profile');
        $this->fails(fn () => $this->clock()->clockOut($this->person('Nobody2')), 'chef profile');
        $this->fails(fn () => $this->clock()->clockOut($u), 'Sign in first');
        MenusSettings::save(['rota_clock_from_rota' => false], null);
        $this->fails(fn () => $this->clock()->clockIn($u), 'switched off');
        $this->fails(fn () => $this->clock()->clockOut($u), 'switched off');
    }

    public function test_a_shift_that_has_ended_can_not_be_clocked_into(): void
    {
        $a = $this->chefOf('Wanjiru Kamau');
        $this->shift($a->id, '2026-10-12', '06:00', '12:00');   // ended exactly now
        $this->fails(fn () => $this->clock()->clockIn(\App\Models\User::find($a->user_id)), 'over');
    }

    public function test_can_mark_is_unchanged_by_the_clock(): void
    {
        $this->assertTrue(AttendanceService::ready());
        $this->assertTrue(RotaAttendance::ready());
    }
}
