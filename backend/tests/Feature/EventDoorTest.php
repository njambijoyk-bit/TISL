<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\EventDoorController;
use App\Models\Events\Event;
use App\Models\Events\EventCheckin;
use App\Models\Events\EventSession;
use App\Models\Events\EventTicket;
use App\Models\Events\EventTicketType;
use App\Models\User;
use App\Services\Codes\CodeResolvers;
use App\Services\Events\CheckIn;
use App\Services\Events\EventException;
use App\Services\Events\GuestList;
use App\Services\Events\TicketCodes;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** The door: who is let in, who is refused and why, never twice for the same date, and the guest list that goes with it. */
class EventDoorTest extends TestCase
{
    use Concerns\CreatesEventTables;

    private CheckIn $door;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createEventTables();
        Schema::create('users', function ($t) { $t->id(); $t->string('name')->nullable(); $t->string('email')->nullable(); $t->string('password')->nullable(); $t->timestamps(); });
        DB::table('users')->insert([['id' => 7, 'name' => 'Wanjiku (door)'], ['id' => 8, 'name' => 'Otieno (door)']]);
        $this->door = app(CheckIn::class);
    }

    private function event(array $o = [], int $days = 0): Event
    {
        $e = Event::create($o + ['title' => 'Jazz night', 'status' => Event::PUBLISHED, 'max_per_order' => 10]);
        EventSession::create(['event_id' => $e->id, 'label' => 'Day 1', 'starts_at' => now()->addHours(1)->addDays($days), 'ends_at' => now()->addHours(4)->addDays($days)]);

        return $e;
    }

    private function ticket(Event $e, array $o = []): EventTicket
    {
        $type = EventTicketType::where('event_id', $e->id)->orderBy('id')->first() ?? EventTicketType::create(['event_id' => $e->id, 'name' => 'General', 'price' => 1000]);

        return EventTicket::create($o + ['event_id' => $e->id, 'ticket_type_id' => $type->id, 'reference' => strtoupper(substr(md5(uniqid('', true)), 0, 8)), 'state' => 'valid', 'buyer_name' => 'Amina Wanjiru',
            'buyer_email' => 'amina@example.com', 'buyer_phone' => '0712345678', 'holder_name' => 'Amina Wanjiru', 'price' => 1000, 'issued_at' => now()]);
    }

    private function scan(Event $e, EventTicket $t, ?int $session = null, int $by = 7): array
    {
        return $this->door->scan($e, TicketCodes::url($t), $session, $by);
    }

    // ------------------------------------------------------------ the answers

    public function test_a_good_ticket_is_let_in_once_and_the_second_try_says_when_and_by_whom(): void
    {
        $e = $this->event();
        $t = $this->ticket($e);
        $r = $this->scan($e, $t);
        $this->assertSame([true, 'ok', 'Welcome!', 'Amina Wanjiru'], [$r['ok'], $r['result'], $r['message'], $r['ticket']['holder_name']]);
        $again = $this->scan($e, $t, null, 8);
        $this->assertSame([false, 'already'], [$again['ok'], $again['result']]);
        $this->assertStringContainsString('by Wanjiku (door)', $again['message'], 'it says who let them in the first time');
        $this->assertSame(1, EventCheckin::whereIn('result', ['ok', 'manual'])->count());
        $this->assertSame(['ok', 'already'], EventCheckin::orderBy('id')->pluck('result')->all(), 'the refused try is in the log too');
    }

    public function test_a_code_that_is_not_ours_is_refused_and_logged(): void
    {
        $e = $this->event();
        $t = $this->ticket($e);
        $code = TicketCodes::code($t);
        foreach (['garbage', substr($code, 0, -1) . ($code[-1] === 'A' ? 'B' : 'A'), 'https://example.com/q/xx.1.2'] as $bad) {
            $r = $this->door->scan($e, $bad, null, 7);
            $this->assertSame([false, 'not_found'], [$r['ok'], $r['result']], $bad);
        }
        $this->assertSame(3, EventCheckin::where('result', 'not_found')->whereNull('ticket_id')->count());
        $this->assertSame(0, EventCheckin::whereIn('result', ['ok', 'manual'])->count());
    }

    public function test_a_ticket_for_another_event_says_which(): void
    {
        $here = $this->event();
        $there = $this->event(['title' => 'Comedy night']);
        $t = $this->ticket($there);
        $r = $this->scan($here, $t);
        $this->assertSame('wrong_event', $r['result']);
        $this->assertStringContainsString('Comedy night', $r['message']);
        $this->assertSame(0, EventCheckin::whereIn('result', ['ok', 'manual'])->count());
        $this->assertSame('ok', $this->scan($there, $t)['result'], 'and it still works at its own door');
    }

    public function test_cancelled_and_unpaid_tickets_are_refused_with_the_reason(): void
    {
        $e = $this->event();
        $this->assertSame(['not_valid', 'This ticket was cancelled or refunded.'], array_values(array_intersect_key($this->scan($e, $this->ticket($e, ['state' => 'cancelled'])), array_flip(['result', 'message']))));
        $held = $this->scan($e, $this->ticket($e, ['state' => 'held', 'held_until' => now()->addMinutes(5)]));
        $this->assertSame(['not_valid', 'This ticket was never paid for.'], [$held['result'], $held['message']]);
        $this->assertSame('not_valid', $this->scan($e, $this->ticket($e, ['state' => 'released']))['result']);
    }

    // ------------------------------------------------------------ several dates

    private function threeDays(): array
    {
        $e = Event::create(['title' => 'Festival', 'status' => Event::PUBLISHED, 'max_per_order' => 10]);
        $s = [];
        foreach ([0, 1, 2] as $i) {
            $s[$i] = EventSession::create(['event_id' => $e->id, 'label' => 'Day ' . ($i + 1), 'starts_at' => now()->addHours(1)->addDays($i), 'ends_at' => now()->addHours(5)->addDays($i)]);
        }
        $pass = EventTicketType::create(['event_id' => $e->id, 'name' => 'Full pass', 'price' => 3000]);
        $day2 = EventTicketType::create(['event_id' => $e->id, 'name' => 'Day 2 only', 'price' => 1200]);
        DB::table('event_ticket_type_sessions')->insert(['ticket_type_id' => $day2->id, 'session_id' => $s[1]->id]);

        return [$e, $s, $pass, $day2];
    }

    public function test_a_day_pass_gets_in_on_its_own_day_only(): void
    {
        [$e, $s, , $day2] = $this->threeDays();
        $t = $this->ticket($e, ['ticket_type_id' => $day2->id]);
        $r = $this->scan($e, $t, $s[0]->id);
        $this->assertSame(['wrong_session', 'This ticket does not admit to that date.'], [$r['result'], $r['message']]);
        $this->assertSame('ok', $this->scan($e, $t, $s[1]->id)['result']);
        $this->assertSame($s[1]->id, EventCheckin::where('result', 'ok')->value('session_id'));
    }

    public function test_a_full_pass_is_used_once_each_day(): void
    {
        [$e, $s, $pass] = $this->threeDays();
        $t = $this->ticket($e, ['ticket_type_id' => $pass->id]);
        $this->assertSame('ok', $this->scan($e, $t, $s[0]->id)['result']);
        $this->assertSame('already', $this->scan($e, $t, $s[0]->id)['result']);
        $this->assertSame('ok', $this->scan($e, $t, $s[1]->id)['result'], 'a new day, a new entry');
        $this->assertSame('ok', $this->scan($e, $t, $s[2]->id)['result']);
    }

    public function test_with_no_date_chosen_the_one_on_now_is_used_else_the_nearest(): void
    {
        $e = Event::create(['title' => 'Course', 'status' => Event::PUBLISHED]);
        $yesterday = EventSession::create(['event_id' => $e->id, 'starts_at' => now()->subDay()->subHours(2), 'ends_at' => now()->subDay()]);
        $now = EventSession::create(['event_id' => $e->id, 'starts_at' => now()->subHour(), 'ends_at' => now()->addHours(2)]);
        $tomorrow = EventSession::create(['event_id' => $e->id, 'starts_at' => now()->addDay(), 'ends_at' => now()->addDay()->addHours(2)]);
        $t = $this->ticket($e);
        $this->assertSame($now->id, $this->scan($e, $t)['session']['id']);
        $this->travel(26)->hours();
        $this->assertSame($tomorrow->id, $this->scan($e, $t)['session']['id'], 'a day later, the day that is on then');
        $this->assertNotSame($yesterday->id, $now->id);
    }

    public function test_the_date_on_now_wins_over_one_that_merely_starts_sooner_and_the_nearest_ignores_direction(): void
    {
        $e = Event::create(['title' => 'Course', 'status' => Event::PUBLISHED]);
        $running = EventSession::create(['event_id' => $e->id, 'starts_at' => now()->subHours(3), 'ends_at' => now()->addHours(2)]);
        EventSession::create(['event_id' => $e->id, 'starts_at' => now()->addMinutes(30), 'ends_at' => now()->addHours(3)]);
        $this->assertSame($running->id, $this->scan($e, $this->ticket($e))['session']['id'], 'the one in progress, not the one starting in half an hour');

        $f = Event::create(['title' => 'Later', 'status' => Event::PUBLISHED]);
        $past = EventSession::create(['event_id' => $f->id, 'starts_at' => now()->subHours(20), 'ends_at' => now()->subHours(18)]);
        EventSession::create(['event_id' => $f->id, 'starts_at' => now()->addDays(2), 'ends_at' => now()->addDays(2)->addHours(2)]);
        $this->assertSame($past->id, $this->scan($f, $this->ticket($f))['session']['id'], 'nothing on: the nearest, whether it was yesterday or is tomorrow');
    }

    public function test_a_cancelled_date_admits_nobody(): void
    {
        $e = $this->event();
        EventSession::where('event_id', $e->id)->update(['is_cancelled' => true]);
        $t = $this->ticket($e);
        $this->assertSame('wrong_session', $this->scan($e, $t)['result']);
    }

    // ------------------------------------------------------------ by hand, and mistakes

    public function test_letting_someone_in_by_hand_counts_and_a_mistake_can_be_undone(): void
    {
        $e = $this->event();
        $t = $this->ticket($e);
        $r = $this->door->manual($e, $t, null, 7);
        $this->assertSame(['manual', true], [$r['result'], $r['ok']]);
        $this->assertSame('already', $this->scan($e, $t)['result'], 'the QR is now used too');
        $this->door->undo($e, $r['checkin_id'], 8);
        $this->assertSame('undone', EventCheckin::find($r['checkin_id'])->result);
        $this->assertSame('ok', $this->scan($e, $t)['result'], 'after an undo the ticket works again');
    }

    public function test_only_a_check_in_that_let_someone_in_can_be_undone_and_only_in_its_own_event(): void
    {
        $e = $this->event();
        $other = $this->event(['title' => 'Other']);
        $t = $this->ticket($e);
        $this->scan($e, $t);
        $refused = $this->scan($e, $t);
        foreach ([[$e, $refused['checkin_id']], [$other, EventCheckin::where('result', 'ok')->value('id')], [$e, 9999]] as [$ev, $id]) {
            try {
                $this->door->undo($ev, $id, 7);
                $this->fail('should refuse');
            } catch (EventException) {
                $this->assertTrue(true);
            }
        }
        $this->assertSame(1, EventCheckin::where('result', 'ok')->count());
    }

    // ------------------------------------------------------------ the numbers and the list

    public function test_the_door_counts_what_is_expected_and_who_has_arrived_for_the_date(): void
    {
        [$e, $s, $pass, $day2] = $this->threeDays();
        $a = $this->ticket($e, ['ticket_type_id' => $pass->id]);
        $this->ticket($e, ['ticket_type_id' => $pass->id]);
        $c = $this->ticket($e, ['ticket_type_id' => $day2->id]);
        $this->ticket($e, ['ticket_type_id' => $pass->id, 'state' => 'cancelled']);
        $this->scan($e, $a, $s[0]->id);
        $this->scan($e, $c, $s[1]->id);
        $d1 = app(GuestList::class)->door($e, $s[0]->id);
        $this->assertSame([2, 1, $s[0]->id], [$d1['expected'], $d1['arrived'], $d1['current_session_id']], 'day 1: the two full passes are expected, one has come');
        $d2 = app(GuestList::class)->door($e, $s[1]->id);
        $this->assertSame([3, 1], [$d2['expected'], $d2['arrived']], 'day 2: the day pass is expected too');
        $this->assertSame(['ok', 'ok'], array_column(array_reverse($d2['recent']), 'result'));
        $a->update(['state' => 'cancelled']);
        $this->assertSame([1, 0], [app(GuestList::class)->door($e, $s[0]->id)['expected'], app(GuestList::class)->door($e, $s[0]->id)['arrived']], 'someone refunded after arriving is no longer counted as an arrival');
        $this->assertSame(['Wanjiku (door)'], array_unique(array_column($d2['recent'], 'by')));
    }

    public function test_the_guest_list_searches_filters_and_shows_who_arrived(): void
    {
        $e = $this->event();
        $a = $this->ticket($e, ['holder_name' => 'Amina Wanjiru', 'reference' => 'AAAA1111']);
        $b = $this->ticket($e, ['holder_name' => 'Baraka Otieno', 'buyer_email' => 'baraka@example.com', 'buyer_phone' => '0799000111', 'reference' => 'BBBB2222']);
        $this->ticket($e, ['state' => 'held', 'held_until' => now()->addMinutes(5)]);
        $this->ticket($e, ['state' => 'released']);
        $this->ticket($e, ['state' => 'cancelled', 'holder_name' => 'Gone Away']);
        $this->scan($e, $b);
        $g = app(GuestList::class);
        $this->assertSame(['Amina Wanjiru', 'Baraka Otieno', 'Gone Away'], array_column($g->guests($e, [])['data'], 'holder_name'), 'unpaid and released tickets are not guests');
        $this->assertSame(['Baraka Otieno'], array_column($g->guests($e, ['q' => '0799'])['data'], 'holder_name'), 'by phone');
        $this->assertSame(['Baraka Otieno'], array_column($g->guests($e, ['q' => 'baraka@'])['data'], 'holder_name'), 'by email');
        $this->assertSame(['Amina Wanjiru'], array_column($g->guests($e, ['q' => 'AAAA'])['data'], 'holder_name'), 'by reference');
        $this->assertSame(['Baraka Otieno'], array_column($g->guests($e, ['arrived' => 'yes'])['data'], 'holder_name'));
        $this->assertSame(['Amina Wanjiru', 'Gone Away'], array_column($g->guests($e, ['arrived' => 'no'])['data'], 'holder_name'));
        $this->assertSame(['Gone Away'], array_column($g->guests($e, ['state' => 'cancelled'])['data'], 'holder_name'));
        $row = collect($g->guests($e, [])['data'])->firstWhere('reference', 'BBBB2222');
        $this->assertSame(['Wanjiku (door)', 1], [$row['arrived']['by'], $row['arrived']['times']]);
        $this->assertNull(collect($g->guests($e, [])['data'])->firstWhere('reference', 'AAAA1111')['arrived']);
        $this->assertSame([], $g->guests($e, ['q' => 'a%b'])['data'], 'a percent sign in the search is a letter, not a wildcard');
    }

    public function test_the_guest_list_shows_arrival_for_the_date_asked_about(): void
    {
        [$e, $s, $pass] = $this->threeDays();
        $t = $this->ticket($e, ['ticket_type_id' => $pass->id]);
        $this->scan($e, $t, $s[0]->id);
        $g = app(GuestList::class);
        $this->assertNotNull($g->guests($e, ['session_id' => $s[0]->id])['data'][0]['arrived']);
        $this->assertNull($g->guests($e, ['session_id' => $s[1]->id])['data'][0]['arrived'], 'not yet arrived on day 2');
        $this->assertSame(1, $g->guests($e, ['session_id' => $s[0]->id, 'arrived' => 'yes'])['total']);
        $this->assertSame(0, $g->guests($e, ['session_id' => $s[1]->id, 'arrived' => 'yes'])['total']);
        $this->assertSame(1, $g->guests($e, ['session_id' => $s[1]->id, 'arrived' => 'no'])['total']);
    }

    public function test_the_guest_list_pages(): void
    {
        $e = $this->event();
        for ($i = 0; $i < 53; $i++) {
            $this->ticket($e, ['holder_name' => sprintf('Guest %02d', $i)]);
        }
        $g = app(GuestList::class);
        $p1 = $g->guests($e, []);
        $p2 = $g->guests($e, ['page' => 2]);
        $this->assertSame([53, 2, 50, 3], [$p1['total'], $p1['last_page'], count($p1['data']), count($p2['data'])]);
    }

    public function test_the_spreadsheet_has_a_column_for_each_date_and_never_runs_a_formula(): void
    {
        [$e, $s, $pass] = $this->threeDays();
        $t = $this->ticket($e, ['ticket_type_id' => $pass->id, 'holder_name' => '=HYPERLINK("http://evil")', 'buyer_phone' => '+254700']);
        $this->scan($e, $t, $s[0]->id);
        ob_start();
        app(EventDoorController::class)->export($e->id)->sendContent();
        $csv = ob_get_clean();
        $lines = array_map('str_getcsv', array_filter(explode("\n", ltrim($csv, "\xEF\xBB\xBF"))));
        $this->assertSame(['Reference', 'Ticket', 'State', 'Name on ticket', 'Bought by', 'Email', 'Phone', 'Price', 'Issued'], array_slice($lines[0], 0, 9));
        $this->assertCount(12, $lines[0], 'one arrival column per date');
        $this->assertSame("'=HYPERLINK(\"http://evil\")", $lines[1][3], 'a formula is made plain text');
        $this->assertSame("'+254700", $lines[1][6]);
        $this->assertNotSame('', $lines[1][9], 'arrived on day 1');
        $this->assertSame('', $lines[1][10]);
    }

    // ------------------------------------------------------------ the core scanner

    public function test_the_core_scanner_lets_a_ticket_in_through_the_registered_type(): void
    {
        $e = $this->event();
        $t = $this->ticket($e);
        $defs = (new \ReflectionProperty(CodeResolvers::class, 'defs'))->getValue(app(CodeResolvers::class));
        $this->assertSame('events.checkin', $defs['tk']['permission']);
        $r = ($defs['tk']['scan'])($t->reference, (new User)->forceFill(['id' => 7]), ['event_id' => $e->id]);
        $this->assertSame('ok', $r['result']);
        $this->assertSame('already', ($defs['tk']['scan'])($t->reference, (new User)->forceFill(['id' => 7]), [])['result']);
        [$f, $days, , $day2] = $this->threeDays();
        $pass = $this->ticket($f, ['ticket_type_id' => $day2->id]);
        $this->assertSame('wrong_session', ($defs['tk']['scan'])($pass->reference, (new User)->forceFill(['id' => 7]), ['session_id' => $days[0]->id])['result'], 'the date the screen is checking in is honoured');
    }

    public function test_the_door_screens_doors_answer_normally_for_every_outcome(): void
    {
        $e = $this->event();
        $t = $this->ticket($e);
        $req = fn (array $d) => tap(Request::create('/x', 'POST', $d), fn ($r) => $r->setUserResolver(fn () => (new User)->forceFill(['id' => 7])));
        $c = app(EventDoorController::class);
        $this->assertSame('ok', $c->checkin($req(['code' => TicketCodes::url($t)]), $e->id)->getData(true)['result']);
        $this->assertSame(200, $c->checkin($req(['code' => 'nonsense']), $e->id)->getStatusCode());
        $this->assertSame('already', $c->manual($req(['ticket_id' => $t->id]), $e->id)->getData(true)['result']);
        $this->expectException(\Illuminate\Database\Eloquent\ModelNotFoundException::class);
        $c->manual($req(['ticket_id' => $this->ticket($this->event(['title' => 'Elsewhere']))->id]), $e->id);
    }
}
