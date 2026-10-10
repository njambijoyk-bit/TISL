<?php

namespace Tests\Feature;

use App\Models\Events\Event;
use App\Models\Events\EventSession;
use App\Models\Events\EventTicket;
use App\Models\Events\EventTicketType;
use App\Services\Events\EventEditor;
use App\Services\Events\EventException;
use App\Services\Events\EventSettings;
use App\Services\Events\Recurrence;
use App\Services\Events\TicketHolds;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** What staff do to an event: save it with its dates and tickets, publish it only when it can be sold, and never hurt people who already hold tickets. */
class EventEditorTest extends TestCase
{
    use Concerns\CreatesEventTables;

    private EventEditor $editor;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createEventTables();
        $this->editor = app(EventEditor::class);
    }

    private function when(int $days, int $hour = 18): string
    {
        return now()->addDays($days)->setTime($hour, 0)->format('Y-m-d H:i:s');
    }

    private function data(array $o = []): array
    {
        return $o + [
            'title' => 'Jazz night', 'venue_name' => 'Alliance Française', 'currency_id' => 1, 'sales_ledger_id' => 40,
            'sessions' => [['key' => 'a', 'starts_at' => $this->when(10), 'ends_at' => $this->when(10, 21), 'label' => 'Saturday']],
            'ticket_types' => [['name' => 'General', 'price' => 1000, 'capacity' => 100, 'session_ids' => ['a']]],
        ];
    }

    private function refuses(callable $f, string $needle): void
    {
        try {
            $f();
            $this->fail("Expected: {$needle}");
        } catch (EventException $e) {
            $this->assertStringContainsString($needle, $e->getMessage());
        }
    }

    // ------------------------------------------------------------ saving

    public function test_an_event_is_saved_with_its_dates_and_ticket_types_in_one_go(): void
    {
        $e = $this->editor->save(null, $this->data(), 5);
        $this->assertSame(['Jazz night', 'jazz-night', 'draft', 5], [$e->title, $e->slug, $e->status, (int) $e->created_by]);
        $this->assertCount(1, $e->sessions);
        $this->assertSame(['General', '1000.00', 100], [$e->ticketTypes[0]->name, (string) $e->ticketTypes[0]->price, $e->ticketTypes[0]->capacity]);
        $this->assertSame([$e->sessions[0]->id], $e->ticketTypes[0]->sessions()->pluck('event_sessions.id')->all(), 'the temporary key was turned into the real date');
    }

    public function test_saving_again_changes_in_place_and_adds_or_removes_what_changed(): void
    {
        $e = $this->editor->save(null, $this->data(), 5);
        $sid = $e->sessions[0]->id;
        $tid = $e->ticketTypes[0]->id;
        $e = $this->editor->save($e, ['title' => 'Jazz night II', 'sessions' => [['id' => $sid, 'starts_at' => $this->when(11)], ['starts_at' => $this->when(12), 'key' => 'b']],
            'ticket_types' => [['id' => $tid, 'name' => 'General', 'price' => 1200, 'capacity' => 80], ['name' => 'VIP', 'price' => 3000, 'capacity' => 10, 'session_ids' => [$sid, 'b']]]], 5);
        $this->assertCount(2, $e->sessions);
        $this->assertSame('Jazz night II', $e->title);
        $this->assertSame('jazz-night', $e->slug, 'the address does not change when the title does');
        $this->assertSame(['1200.00', 80], [(string) $e->ticketTypes[0]->price, $e->ticketTypes[0]->capacity]);
        $this->assertCount(2, $e->ticketTypes[1]->sessions);
        $e = $this->editor->save($e, ['ticket_types' => [['id' => $tid, 'name' => 'General', 'price' => 1200]]], 5);
        $this->assertCount(1, $e->ticketTypes, 'a type left out of the list is removed when nobody holds one');
    }

    public function test_a_save_that_leaves_dates_or_tickets_out_of_the_request_leaves_them_alone(): void
    {
        $e = $this->editor->save(null, $this->data(), 5);
        $e = $this->editor->save($e, ['summary' => 'A night of jazz'], 5);
        $this->assertSame([1, 1, 'A night of jazz'], [$e->sessions->count(), $e->ticketTypes->count(), $e->summary]);
    }

    public function test_the_obvious_mistakes_are_refused_in_words(): void
    {
        $this->refuses(fn () => $this->editor->save(null, ['title' => ' '], 1), 'title');
        $this->refuses(fn () => $this->editor->save(null, $this->data(['kind' => 'moon']), 1), 'in person, online or both');
        $this->refuses(fn () => $this->editor->save(null, $this->data(['online_url' => 'ftp://x']), 1), 'http');
        $this->refuses(fn () => $this->editor->save(null, $this->data(['max_per_order' => 0]), 1), 'Tickets per order');
        $this->refuses(fn () => $this->editor->save(null, $this->data(['sales_ledger_id' => 41]), 1), 'choose an income account');
        $this->refuses(fn () => $this->editor->save(null, $this->data(['sales_ledger_id' => 999]), 1), 'not found');
        $this->refuses(fn () => $this->editor->save(null, $this->data(['sessions' => [['starts_at' => $this->when(5), 'ends_at' => $this->when(4)]]]), 1), 'end before it starts');
        $this->refuses(fn () => $this->editor->save(null, $this->data(['sessions' => [['ends_at' => $this->when(5)]]]), 1), 'needs a start');
        $this->refuses(fn () => $this->editor->save(null, $this->data(['sessions' => [['starts_at' => $this->when(5), 'capacity' => 0]]]), 1), 'at least 1 person');
        foreach ([[['name' => ''], 'needs a name'], [['name' => 'A', 'price' => -1], 'below 0'], [['name' => 'A', 'capacity' => 0], 'at least 1'], [['name' => 'A', 'min_per_order' => 3, 'max_per_order' => 2], 'below the least'],
            [['name' => 'A', 'sale_starts_at' => $this->when(5), 'sale_ends_at' => $this->when(4)], 'end before it starts'], [['name' => 'A', 'session_ids' => [9999]], 'not part of this event']] as [$type, $says]) {
            $this->refuses(fn () => $this->editor->save(null, $this->data(['ticket_types' => [$type]]), 1), $says);
        }
        $this->assertSame(0, Event::count(), 'a refused save leaves nothing behind');
    }

    // ------------------------------------------------------------ people who already hold tickets

    private function sold(Event $e, int $n = 2): void
    {
        $this->app->make(TicketHolds::class)->issue($this->app->make(TicketHolds::class)->hold($e->fresh(), [$e->ticketTypes[0]->id => $n], ['name' => 'Buyer'], 5));
    }

    public function test_a_date_with_tickets_can_be_cancelled_but_not_deleted(): void
    {
        $e = $this->editor->save(null, $this->data(['status' => 'published']), 5);
        $this->editor->publish($e, 5);
        $this->sold($e);
        $sid = $e->sessions[0]->id;
        $this->refuses(fn () => $this->editor->save($e->fresh(), ['sessions' => []], 5), 'mark it cancelled instead');
        $e = $this->editor->save($e->fresh(), ['sessions' => [['id' => $sid, 'starts_at' => $this->when(10), 'is_cancelled' => true], ['starts_at' => $this->when(20)]]], 5);
        $this->assertTrue((bool) $e->sessions->first()->is_cancelled);
    }

    public function test_a_ticket_type_that_has_tickets_cannot_be_deleted_or_cut_below_what_is_sold(): void
    {
        $e = $this->editor->save(null, $this->data(), 5);
        $this->editor->publish($e, 5);
        $this->sold($e, 3);
        $tid = $e->ticketTypes[0]->id;
        $this->refuses(fn () => $this->editor->save($e->fresh(), ['ticket_types' => []], 5), 'switch it off instead');
        $this->refuses(fn () => $this->editor->save($e->fresh(), ['ticket_types' => [['id' => $tid, 'name' => 'General', 'capacity' => 2]]], 5), '3 are already sold');
        $this->assertSame(3, $this->editor->save($e->fresh(), ['ticket_types' => [['id' => $tid, 'name' => 'General', 'capacity' => 3]]], 5)->ticketTypes[0]->capacity);
        $off = $this->editor->save($e->fresh(), ['ticket_types' => [['id' => $tid, 'name' => 'General', 'is_active' => false]]], 5);
        $this->assertFalse((bool) $off->ticketTypes[0]->is_active);
    }

    public function test_a_ticket_type_whose_tickets_were_all_cancelled_is_still_kept_but_one_whose_holds_lapsed_can_go(): void
    {
        $e = $this->editor->save(null, $this->data(), 5);
        $this->editor->publish($e, 5);
        $holds = app(TicketHolds::class);
        $made = $holds->hold($e->fresh(), [$e->ticketTypes[0]->id => 1], ['name' => 'B']);
        $holds->issue($made);
        $holds->cancel($made[0]->fresh(), 'Refunded');
        $this->refuses(fn () => $this->editor->save($e->fresh(), ['ticket_types' => []], 5), 'switch it off instead');   // the sales record stays with its type
        $e2 = $this->editor->save(null, $this->data(['title' => 'Other']), 5);
        $this->editor->publish($e2, 5);
        $lapsed = $holds->hold($e2->fresh(), [$e2->ticketTypes[0]->id => 1], ['name' => 'B']);
        EventTicket::whereKey($lapsed[0]->id)->update(['held_until' => now()->subMinute()]);
        $holds->releaseExpired();
        $this->assertCount(0, $this->editor->save($e2->fresh(), ['ticket_types' => []], 5)->ticketTypes);
    }

    // ------------------------------------------------------------ publishing

    public function test_an_event_is_published_only_when_it_can_really_be_sold(): void
    {
        $e = $this->editor->save(null, ['title' => 'Bare'], 1);
        $this->refuses(fn () => $this->editor->publish($e), 'at least one date');
        $this->refuses(fn () => $this->editor->publish($e), 'at least one ticket type');
        $this->refuses(fn () => $this->editor->publish($e), 'the venue');
        $past = $this->editor->save(null, $this->data(['sessions' => [['key' => 'a', 'starts_at' => now()->subDays(2)->format('Y-m-d H:i:s')]]]), 1);
        $this->refuses(fn () => $this->editor->publish($past), 'still to come');
        $noMoney = $this->editor->save(null, $this->data(['title' => 'Unbooked', 'sales_ledger_id' => null, 'currency_id' => null]), 1);
        $this->refuses(fn () => $this->editor->publish($noMoney), 'the currency');
        $this->refuses(fn () => $this->editor->publish($noMoney), 'income account');
        EventSettings::save(['sales_ledger_id' => 40], 1);
        $noMoney->update(['currency_id' => 1]);
        $this->assertSame('published', $this->editor->publish($noMoney->fresh())->status, 'the default account in the settings is enough');
        $online = $this->editor->save(null, $this->data(['title' => 'Webinar', 'kind' => 'online', 'venue_name' => null]), 1);
        $this->refuses(fn () => $this->editor->publish($online), 'the link people join with');
    }

    public function test_a_free_event_needs_no_money_settings(): void
    {
        $e = $this->editor->save(null, ['title' => 'Open mic', 'venue_name' => 'The Cave', 'sessions' => [['starts_at' => $this->when(3)]], 'ticket_types' => [['name' => 'RSVP', 'price' => 0]]], 1);
        $this->assertSame([], $this->editor->problems($e));
        $this->assertNotNull($this->editor->publish($e)->published_at);
    }

    public function test_taking_down_and_cancelling(): void
    {
        $e = $this->editor->save(null, $this->data(), 1);
        $this->editor->publish($e);
        $this->assertSame('draft', $this->editor->unpublish($e->fresh())->status);
        $this->editor->publish($e->fresh());
        $this->sold($e);
        $this->refuses(fn () => $this->editor->unpublish($e->fresh()), 'already hold tickets');
        $this->assertSame('cancelled', $this->editor->cancel($e->fresh())->status);
        $this->refuses(fn () => $this->editor->publish($e->fresh()), 'cancelled event');
    }

    public function test_once_unpublished_a_buyer_cannot_buy_and_when_published_they_can(): void
    {
        $e = $this->editor->save(null, $this->data(), 1);
        $holds = app(TicketHolds::class);
        $this->refuses(fn () => $holds->hold($e, [$e->ticketTypes[0]->id => 1], ['name' => 'X']), 'not on sale');
        $this->editor->publish($e);
        $this->assertCount(1, $holds->hold($e->fresh(), [$e->ticketTypes[0]->id => 1], ['name' => 'X']));
    }

    // ------------------------------------------------------------ repeating dates

    public function test_a_weekly_repeat_makes_the_dates_and_stops_where_it_should(): void
    {
        $r = Recurrence::dates(['start' => '2026-11-07 10:00', 'minutes' => 90, 'repeat' => 'weekly', 'count' => 4]);   // a Saturday
        $this->assertSame(['2026-11-07 10:00:00', '2026-11-14 10:00:00', '2026-11-21 10:00:00', '2026-11-28 10:00:00'], array_column($r, 'starts_at'));
        $this->assertSame('2026-11-07 11:30:00', $r[0]['ends_at']);
        $u = Recurrence::dates(['start' => '2026-11-07 10:00', 'repeat' => 'weekly', 'until' => '2026-11-22']);
        $this->assertCount(3, $u, 'the last date is included, nothing after it');
        $this->assertNull($u[0]['ends_at']);
    }

    public function test_several_weekdays_and_every_second_week(): void
    {
        $r = Recurrence::dates(['start' => '2026-11-02 18:30', 'repeat' => 'weekly', 'weekdays' => [1, 3], 'count' => 5]);   // Monday start: Mon, Wed
        $this->assertSame(['2026-11-02', '2026-11-04', '2026-11-09', '2026-11-11', '2026-11-16'], array_map(fn ($x) => substr($x['starts_at'], 0, 10), $r));
        $every = Recurrence::dates(['start' => '2026-11-02 18:30', 'repeat' => 'weekly', 'every' => 2, 'count' => 3]);
        $this->assertSame(['2026-11-02', '2026-11-16', '2026-11-30'], array_map(fn ($x) => substr($x['starts_at'], 0, 10), $every));
        $skipped = Recurrence::dates(['start' => '2026-11-04 18:30', 'repeat' => 'weekly', 'weekdays' => [1, 3], 'count' => 2]);   // starts on a Wednesday: the Monday before is not a session
        $this->assertSame(['2026-11-04', '2026-11-09'], array_map(fn ($x) => substr($x['starts_at'], 0, 10), $skipped));
    }

    public function test_daily_and_monthly_repeats(): void
    {
        $d = Recurrence::dates(['start' => '2026-11-30 09:00', 'repeat' => 'daily', 'every' => 2, 'count' => 3]);
        $this->assertSame(['2026-11-30', '2026-12-02', '2026-12-04'], array_map(fn ($x) => substr($x['starts_at'], 0, 10), $d));
        $m = Recurrence::dates(['start' => '2026-01-31 09:00', 'repeat' => 'monthly', 'count' => 4]);
        $this->assertSame(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'], array_map(fn ($x) => substr($x['starts_at'], 0, 10), $m), 'the end of a short month does not drag the later ones back');
    }

    public function test_a_repeat_must_stop_and_must_be_sensible(): void
    {
        foreach ([['start' => '2026-11-07 10:00', 'repeat' => 'weekly'], ['start' => '2026-11-07 10:00', 'repeat' => 'weekly', 'count' => 101], ['start' => '2026-11-07 10:00', 'repeat' => 'hourly', 'count' => 3],
            ['start' => '2026-11-07 10:00', 'repeat' => 'weekly', 'until' => '2026-11-01'], ['start' => '2026-11-07 10:00', 'repeat' => 'weekly', 'weekdays' => [7], 'count' => 2]] as $bad) {
            try {
                Recurrence::dates($bad);
                $this->fail('Expected a refusal');
            } catch (EventException) {
                $this->addToAssertionCount(1);
            }
        }
        $this->assertCount(100, Recurrence::dates(['start' => '2026-01-01 10:00', 'repeat' => 'daily', 'until' => '2030-01-01']), 'an open-ended repeat is capped');
    }
}
