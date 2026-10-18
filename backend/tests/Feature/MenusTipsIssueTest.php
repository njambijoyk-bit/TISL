<?php

namespace Tests\Feature;

use App\Models\Books\Voucher;
use App\Models\Menus\Tip;
use App\Models\Menus\TipEvent;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Menus\IngredientUse;
use App\Services\Menus\MenusSettings;
use App\Services\Menus\Tips;
use App\Services\Notify\Staff;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Menus tips, build steps 6.4 and 6.5 (script 212): the tips screen, and handing a tip over in one journal, once, inside the window. */
class MenusTipsIssueTest extends TestCase
{
    use Concerns\CreatesCounterWorld;

    /** @var array<int, array<string, mixed>> */
    private array $journals = [];

    private bool $journalFails = false;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createCounterWorld();
        Schema::create('users', function ($t) { $t->id(); $t->string('name')->nullable(); $t->softDeletes(); });
        DB::table('users')->insert([['id' => 3, 'name' => 'Cashier Jo'], ['id' => 4, 'name' => 'Waiter Wanjiku'], ['id' => 5, 'name' => 'Manager Mo']]);
        DB::table('payment_methods')->where('id', 1)->update(['ledger_id' => 11]);
        $this->runSqlScripts('212_menus_tips.sql');
        MenusSettings::save(['tip_ledger_id' => 80], null);
        $this->journals = [];
        $this->journalFails = false;
        $use = $this->createMock(IngredientUse::class);
        $use->method('book')->willReturnCallback(function (int $debit, int $credit, float $amount, string $narration, int $loc, Carbon $on, ?User $by) {
            if ($this->journalFails) {
                throw new BooksException('The books are closed for that date.');
            }
            $this->journals[] = compact('debit', 'credit', 'amount', 'narration', 'loc');

            return (new Voucher())->forceFill(['id' => 500 + count($this->journals)]);
        });
        $this->app->instance(IngredientUse::class, $use);
        $this->app->instance(Staff::class, new class() extends Staff {
            public function holding(string $permission): \Illuminate\Support\Collection
            {
                return User::whereIn('id', [3, 4])->get();
            }
        });
    }

    /** Someone holding exactly the permissions named (permissions are data: the stand-in answers for them). */
    private function person(int $id, array $has): User
    {
        $u = new class() extends User {
            public array $has = [];

            public function hasPermission(string $permission): bool
            {
                return in_array($permission, $this->has, true);
            }
        };
        $u->has = $has;
        $u->forceFill(['id' => $id, 'name' => $id === 5 ? 'Manager Mo' : 'Someone']);

        return $u;
    }

    private function tip(float $amount = 200, array $o = []): Tip
    {
        static $n = 100;

        return Tip::create($o + ['order_id' => ++$n, 'amount' => $amount, 'ledger_id' => 80, 'location_id' => 1, 'customer_name' => 'Window', 'short_no' => 4, 'received_by' => 3, 'served_by' => 4]);
    }

    private function fails(callable $fn, string $part): void
    {
        try {
            $fn();
        } catch (BooksException $e) {
            $this->assertStringContainsString($part, $e->getMessage());

            return;
        }
        $this->fail("Expected: {$part}");
    }

    private function in(array $o = []): array
    {
        return $o + ['to_user_id' => 4, 'from_ledger_id' => 11];
    }

    private function manager(): User
    {
        return $this->person(5, ['menus.tips.view', 'menus.tips.issue']);
    }

    private function noon(): Carbon
    {
        return Carbon::parse('2026-03-04 12:00', config('app.timezone'));
    }

    // ------------------------------------------------------------ the screen (6.4)

    public function test_the_screen_lists_what_waits_and_what_was_taken_today_with_the_totals(): void
    {
        $now = Carbon::now((string) config('app.timezone', 'Africa/Nairobi'));
        $a = $this->tip(200);
        $b = $this->tip(50);
        $old = $this->tip(75);
        Tip::whereKey($old->id)->update(['created_at' => $now->copy()->subDays(3)]);

        $s = app(Tips::class)->screen($this->manager(), $now);
        $this->assertTrue($s['ready']);
        $this->assertSame([$old->id, $a->id, $b->id], array_column($s['pending'], 'id'), 'everything that waits, oldest first, whatever day it was taken');
        $this->assertSame([$b->id, $a->id], array_column($s['today'], 'id'), 'today: what was taken today, the newest first');
        $this->assertNotContains($old->id, array_column($s['today'], 'id'));
        $this->assertSame([325.0, 250.0, 0.0], [$s['totals']['pending'], $s['totals']['taken_today'], $s['totals']['issued_today']]);
        $this->assertSame(['Window', 4, 'Cashier Jo', 'Waiter Wanjiku', 'pending'], [$s['pending'][1]['customer'], $s['pending'][1]['short_no'], $s['pending'][1]['received_by'], $s['pending'][1]['served_by'], $s['pending'][1]['status']]);
        $this->assertSame([['ledger_id' => 11, 'name' => 'Cash']], $s['sources'], 'cash and bank accounts only');
        $this->assertSame([3, 4], array_column($s['recipients'], 'id'));
        $this->assertSame([true, true, false], [$s['can']['issue'], $s['window']['open'], $s['can']['reverse']]);
        $this->assertSame('Tips may be handed out at any time', $s['window']['words']);
    }

    public function test_the_screen_says_it_is_not_ready_before_script_212(): void
    {
        Schema::drop('menus_tip_events');
        Schema::drop('menus_tips');
        $this->assertSame(['ready' => false], app(Tips::class)->screen($this->manager()));
    }

    public function test_the_window_is_said_in_words(): void
    {
        MenusSettings::save(['tips_window' => 'daily', 'tips_from' => '18:00', 'tips_to' => '22:00'], null);
        $this->assertSame('Tips may be handed out every day between 18:00 and 22:00', Tips::windowWords());
        MenusSettings::save(['tips_window' => 'days', 'tips_days' => [6, 7]], null);
        $this->assertSame('Tips may be handed out on Sat, Sun between 18:00 and 22:00', Tips::windowWords());
        MenusSettings::save(['tips_window' => 'never'], null);
        $this->assertStringContainsString('held', Tips::windowWords());
    }

    // ------------------------------------------------------------ handing over (6.5)

    public function test_handing_a_tip_over_makes_one_journal_and_marks_it_issued(): void
    {
        $t = $this->tip(200);
        $r = app(Tips::class)->issue($t->id, $this->in(['narration' => 'Weekend share']), $this->manager(), $this->noon());

        $this->assertFalse($r['already']);
        $this->assertSame([['debit' => 80, 'credit' => 11, 'amount' => 200.0, 'narration' => 'Weekend share', 'loc' => 1]], $this->journals, 'Dr tips payable, Cr the cash account');
        $tip = $t->fresh();
        $this->assertSame(['issued', 5, 4, 11, 501, 'Weekend share'], [$tip->status, (int) $tip->issued_by, (int) $tip->issued_to, (int) $tip->issued_from_ledger_id, (int) $tip->issue_voucher_id, $tip->issue_narration]);
        $e = TipEvent::where('tip_id', $t->id)->first();
        $this->assertSame(['issued', '200.00', 501, 5], [$e->kind, (string) $e->amount, (int) $e->voucher_id, (int) $e->done_by]);

        $s = app(Tips::class)->screen($this->manager(), $this->noon());
        $this->assertSame([[], 0.0], [$s['pending'], $s['totals']['pending']]);
    }

    public function test_the_narration_is_made_when_none_is_given_and_a_name_can_stand_for_someone_who_is_not_a_user(): void
    {
        $t = $this->tip(80);
        app(Tips::class)->issue($t->id, ['to_name' => 'Kitchen team', 'from_ledger_id' => 11], $this->manager(), $this->noon());
        $this->assertSame('Tip handed to Kitchen team, Window', $this->journals[0]['narration']);
        $tip = $t->fresh();
        $this->assertSame([null, 'Kitchen team', null], [$tip->issued_to, $tip->issued_to_name, $tip->issue_narration]);
    }

    public function test_a_retry_finds_the_tip_issued_and_makes_no_second_journal(): void
    {
        $t = $this->tip(200);
        app(Tips::class)->issue($t->id, $this->in(), $this->manager(), $this->noon());
        $again = app(Tips::class)->issue($t->id, $this->in(['to_user_id' => 3]), $this->manager(), $this->noon());

        $this->assertTrue($again['already']);
        $this->assertSame([1, 501, 4, 1], [count($this->journals), (int) $again['tip']->issue_voucher_id, (int) $again['tip']->issued_to, TipEvent::count()], 'the same journal, the same person, one event');
    }

    public function test_a_journal_that_fails_leaves_the_tip_waiting_and_nothing_saved(): void
    {
        $t = $this->tip(200);
        $this->journalFails = true;
        $this->fails(fn () => app(Tips::class)->issue($t->id, $this->in(), $this->manager(), $this->noon()), 'books are closed');
        $this->assertSame(['pending', 0], [$t->fresh()->status, TipEvent::count()]);

        $this->journalFails = false;
        app(Tips::class)->issue($t->id, $this->in(), $this->manager(), $this->noon());
        $this->assertSame('issued', $t->fresh()->status, 'and it can be tried again');
    }

    public function test_only_someone_who_may_hand_tips_over_can(): void
    {
        $t = $this->tip();
        $this->fails(fn () => app(Tips::class)->issue($t->id, $this->in(), $this->person(5, ['menus.tips.view']), $this->noon()), 'may not hand tips over');
        $this->assertSame([0, 'pending'], [count($this->journals), $t->fresh()->status]);
    }

    public function test_the_window_decides_when(): void
    {
        $t = $this->tip();
        MenusSettings::save(['tips_window' => 'daily', 'tips_from' => '18:00', 'tips_to' => '22:00'], null);
        $this->fails(fn () => app(Tips::class)->issue($t->id, $this->in(), $this->manager(), $this->noon()), 'every day between 18:00 and 22:00');
        $this->assertSame('pending', $t->fresh()->status, 'tips never expire: it waits');

        app(Tips::class)->issue($t->id, $this->in(), $this->manager(), Carbon::parse('2026-03-04 19:30', config('app.timezone')));
        $this->assertSame('issued', $t->fresh()->status);

        $n = $this->tip();
        MenusSettings::save(['tips_window' => 'never'], null);
        $this->fails(fn () => app(Tips::class)->issue($n->id, $this->in(), $this->manager(), $this->noon()), 'held');
    }

    public function test_it_must_say_who_and_from_which_account_and_not_to_oneself(): void
    {
        $t = $this->tip();
        $this->fails(fn () => app(Tips::class)->issue($t->id, ['from_ledger_id' => 11], $this->manager(), $this->noon()), 'who the tip is handed to');
        $this->fails(fn () => app(Tips::class)->issue($t->id, ['to_user_id' => 999, 'from_ledger_id' => 11], $this->manager(), $this->noon()), 'could not be found');
        $this->fails(fn () => app(Tips::class)->issue($t->id, $this->in(['from_ledger_id' => 80]), $this->manager(), $this->noon()), 'cash or bank account');
        $this->fails(fn () => app(Tips::class)->issue($t->id, $this->in(['to_user_id' => 5]), $this->manager(), $this->noon()), 'not handed to the person handing it over');
        $this->fails(fn () => app(Tips::class)->issue(9999, $this->in(), $this->manager(), $this->noon()), 'could not be found');
        $this->assertSame([0, 'pending', 0], [count($this->journals), $t->fresh()->status, TipEvent::count()]);
    }
}
