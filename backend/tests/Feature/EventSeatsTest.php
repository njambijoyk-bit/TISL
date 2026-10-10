<?php

namespace Tests\Feature;

use App\Models\Events\Event;
use App\Models\Events\EventSession;
use App\Models\Events\EventTicket;
use App\Models\Events\EventTicketType;
use App\Services\Events\EventException;
use App\Services\Events\EventSettings;
use App\Services\Events\TicketHolds;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** The numbers behind ticket sales: capacity per ticket type and per session, holds that lapse, and the last seat never sold twice. */
class EventSeatsTest extends TestCase
{
    private TicketHolds $holds;

    protected function setUp(): void
    {
        parent::setUp();
        Schema::create('events', function ($t) { $t->id(); $t->string('title'); $t->string('slug')->unique(); $t->string('summary')->nullable(); $t->text('description')->nullable(); $t->string('kind')->default('in_person'); $t->string('venue_name')->nullable(); $t->string('venue_address')->nullable(); $t->string('map_url')->nullable(); $t->string('online_url')->nullable(); $t->string('organiser')->nullable(); $t->string('main_image')->nullable(); $t->string('video_url')->nullable(); $t->string('status')->default('draft'); $t->boolean('is_listed')->default(true); $t->unsignedBigInteger('currency_id')->nullable(); $t->unsignedBigInteger('sales_ledger_id')->nullable(); $t->unsignedBigInteger('tax_rate_id')->nullable(); $t->unsignedBigInteger('location_id')->nullable(); $t->unsignedSmallInteger('max_per_order')->default(10); $t->dateTime('refund_until')->nullable(); $t->text('refund_policy')->nullable(); $t->boolean('allow_name_change')->default(true); $t->dateTime('published_at')->nullable(); $t->unsignedBigInteger('created_by')->nullable(); $t->unsignedBigInteger('updated_by')->nullable(); $t->softDeletes(); $t->timestamps(); });
        Schema::create('event_sessions', function ($t) { $t->id(); $t->unsignedBigInteger('event_id'); $t->string('label')->nullable(); $t->dateTime('starts_at'); $t->dateTime('ends_at')->nullable(); $t->unsignedInteger('capacity')->nullable(); $t->boolean('is_cancelled')->default(false); $t->timestamps(); });
        Schema::create('event_ticket_types', function ($t) { $t->id(); $t->unsignedBigInteger('event_id'); $t->string('name'); $t->string('description')->nullable(); $t->decimal('price', 12, 2)->default(0); $t->unsignedInteger('capacity')->nullable(); $t->unsignedSmallInteger('min_per_order')->default(1); $t->unsignedSmallInteger('max_per_order')->nullable(); $t->dateTime('sale_starts_at')->nullable(); $t->dateTime('sale_ends_at')->nullable(); $t->smallInteger('sort_order')->default(0); $t->boolean('is_active')->default(true); $t->softDeletes(); $t->timestamps(); });
        Schema::create('event_ticket_type_sessions', function ($t) { $t->unsignedBigInteger('ticket_type_id'); $t->unsignedBigInteger('session_id'); $t->primary(['ticket_type_id', 'session_id']); });
        Schema::create('event_tickets', function ($t) { $t->id(); $t->unsignedBigInteger('event_id'); $t->unsignedBigInteger('ticket_type_id'); $t->string('reference', 12)->unique(); $t->string('state')->default('held'); $t->dateTime('held_until')->nullable(); $t->unsignedBigInteger('order_id')->nullable(); $t->unsignedBigInteger('sale_id')->nullable(); $t->unsignedBigInteger('customer_id')->nullable(); $t->string('buyer_name')->nullable(); $t->string('buyer_email')->nullable(); $t->string('buyer_phone')->nullable(); $t->string('holder_name')->nullable(); $t->decimal('price', 12, 2)->default(0); $t->dateTime('issued_at')->nullable(); $t->dateTime('cancelled_at')->nullable(); $t->string('cancel_reason')->nullable(); $t->unsignedBigInteger('sold_by')->nullable(); $t->timestamps(); });
        Schema::create('event_settings', function ($t) { $t->unsignedTinyInteger('id')->primary(); $t->json('settings')->nullable(); $t->unsignedBigInteger('updated_by')->nullable(); $t->timestamps(); });
        $this->holds = app(TicketHolds::class);
    }

    private function event(array $o = []): Event
    {
        $e = Event::create($o + ['title' => 'Jazz night', 'status' => Event::PUBLISHED, 'max_per_order' => 10]);
        EventSession::create(['event_id' => $e->id, 'starts_at' => now()->addDays(10), 'ends_at' => now()->addDays(10)->addHours(3)]);

        return $e;
    }

    private function type(Event $e, array $o = []): EventTicketType
    {
        return EventTicketType::create($o + ['event_id' => $e->id, 'name' => 'General', 'price' => 1000, 'capacity' => 5]);
    }

    private function buyer(): array
    {
        return ['name' => 'Amina Wanjiru', 'email' => 'amina@example.com', 'phone' => '0712345678'];
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

    // ------------------------------------------------------------ capacity

    public function test_seats_are_held_for_the_buyer_and_counted(): void
    {
        $e = $this->event();
        $t = $this->type($e);
        $made = $this->holds->hold($e, [$t->id => 2], $this->buyer());
        $this->assertCount(2, $made);
        $this->assertSame(['held', 'Amina Wanjiru', '1000.00'], [$made[0]->state, $made[0]->holder_name, (string) $made[0]->price]);
        $this->assertSame(3, $this->holds->remaining($t));
        $this->assertSame(2, array_sum($this->holds->takenByType($e->id)));
        $this->assertCount(2, $made->pluck('reference')->unique());
        $this->assertMatchesRegularExpression('/^[0-9A-HJKMNP-TV-Z]{8}$/', $made[0]->reference);
    }

    public function test_the_last_seat_is_never_sold_twice(): void
    {
        $e = $this->event();
        $t = $this->type($e, ['capacity' => 3]);
        $this->holds->hold($e, [$t->id => 2], $this->buyer());
        $this->refuses(fn () => $this->holds->hold($e, [$t->id => 2], $this->buyer()), 'Only 1 General ticket is left');
        $this->holds->hold($e, [$t->id => 1], $this->buyer());
        $this->refuses(fn () => $this->holds->hold($e, [$t->id => 1], $this->buyer()), 'General is sold out');
        $this->assertSame(3, EventTicket::count(), 'nothing was left half-made by the refusals');
    }

    public function test_a_hold_that_runs_out_gives_the_seat_back_without_anything_running(): void
    {
        $e = $this->event();
        $t = $this->type($e, ['capacity' => 2]);
        $made = $this->holds->hold($e, [$t->id => 2], $this->buyer());
        $this->assertSame(0, $this->holds->remaining($t));
        EventTicket::whereIn('id', $made->pluck('id'))->update(['held_until' => now()->subMinute()]);
        $this->assertSame(2, $this->holds->remaining($t), 'the seats are free the moment the hold lapses');
        $this->assertCount(1, $this->holds->hold($e, [$t->id => 1], $this->buyer()));
        $this->assertSame([], $this->holds->releaseExpired(), 'no order was attached');
        $this->assertSame(2, EventTicket::where('state', 'released')->count());
    }

    public function test_release_reports_the_orders_that_were_waiting(): void
    {
        $e = $this->event();
        $t = $this->type($e);
        $made = $this->holds->hold($e, [$t->id => 2], $this->buyer());
        EventTicket::whereIn('id', $made->pluck('id'))->update(['order_id' => 77, 'held_until' => now()->subSecond()]);
        $this->assertSame([77], $this->holds->releaseExpired());
        $this->assertSame([], $this->holds->releaseExpired(), 'only once');
    }

    public function test_valid_tickets_hold_their_seat_cancelled_and_released_ones_do_not(): void
    {
        $e = $this->event();
        $t = $this->type($e, ['capacity' => 4]);
        $made = $this->holds->hold($e, [$t->id => 4], $this->buyer());
        $this->assertSame(4, $this->holds->issue($made));
        $this->assertSame(0, $this->holds->remaining($t));
        $this->holds->cancel($made[0], 'Refunded');
        $this->assertSame(1, $this->holds->remaining($t));
        $this->assertSame(['cancelled', 'Refunded'], [$made[0]->fresh()->state, $made[0]->fresh()->cancel_reason]);
        $this->refuses(fn () => $this->holds->cancel($made[0]->fresh()), 'already cancelled');
    }

    // ------------------------------------------------------------ the rules of a sale

    public function test_who_may_buy_what_and_when(): void
    {
        $e = $this->event();
        $t = $this->type($e, ['min_per_order' => 2, 'max_per_order' => 3, 'capacity' => 50]);
        $this->refuses(fn () => $this->holds->hold($e, [$t->id => 1], $this->buyer()), 'the least you can buy is 2');
        $this->refuses(fn () => $this->holds->hold($e, [$t->id => 4], $this->buyer()), 'the most you can buy is 3');
        $this->refuses(fn () => $this->holds->hold($e, [], $this->buyer()), 'Choose how many');
        $this->refuses(fn () => $this->holds->hold($e, [$t->id => 0], $this->buyer()), 'Choose how many');
        $early = $this->type($e, ['name' => 'Early bird', 'sale_ends_at' => now()->subDay()]);
        $soon = $this->type($e, ['name' => 'Late', 'sale_starts_at' => now()->addDay()]);
        $off = $this->type($e, ['name' => 'Hidden', 'is_active' => false]);
        foreach ([$early, $soon, $off] as $x) {
            $this->refuses(fn () => $this->holds->hold($e, [$x->id => 1], $this->buyer()), 'not on sale right now');
        }
        $other = $this->event(['title' => 'Other']);
        $foreign = $this->type($other);
        $this->refuses(fn () => $this->holds->hold($e, [$foreign->id => 1], $this->buyer()), 'not part of this event');
        $this->assertCount(2, $this->holds->hold($e, [$t->id => 2], $this->buyer()));
    }

    public function test_the_event_limit_applies_across_all_ticket_types(): void
    {
        $e = $this->event(['max_per_order' => 4]);
        $a = $this->type($e, ['capacity' => 50]);
        $b = $this->type($e, ['name' => 'VIP', 'capacity' => 50]);
        $this->refuses(fn () => $this->holds->hold($e, [$a->id => 3, $b->id => 2], $this->buyer()), 'up to 4 tickets at a time');
        $this->assertCount(4, $this->holds->hold($e, [$a->id => 2, $b->id => 2], $this->buyer()));
    }

    public function test_a_draft_cancelled_or_finished_event_sells_nothing_but_staff_can_sell_a_draft(): void
    {
        $draft = $this->event(['status' => Event::DRAFT]);
        $t = $this->type($draft);
        $this->refuses(fn () => $this->holds->hold($draft, [$t->id => 1], $this->buyer()), 'not on sale');
        $this->assertCount(1, $this->holds->hold($draft, [$t->id => 1], $this->buyer(), soldBy: 5), 'the box office can sell before it is published');
        $cancelled = $this->event(['status' => Event::CANCELLED]);
        $this->refuses(fn () => $this->holds->hold($cancelled, [$this->type($cancelled)->id => 1], $this->buyer()), 'cancelled');
        $past = Event::create(['title' => 'Old', 'status' => Event::PUBLISHED]);
        EventSession::create(['event_id' => $past->id, 'starts_at' => now()->subDays(3), 'ends_at' => now()->subDays(3)->addHours(2)]);
        $this->refuses(fn () => $this->holds->hold($past, [$this->type($past)->id => 1], $this->buyer()), 'over');
        $this->assertTrue($past->fresh()->isOver());
        $this->assertFalse($past->fresh()->isOnSale(), 'a finished event is not on sale');
        $nodates = Event::create(['title' => 'No dates', 'status' => Event::PUBLISHED]);
        $this->refuses(fn () => $this->holds->hold($nodates, [$this->type($nodates)->id => 1], $this->buyer()), 'no dates');
    }

    public function test_a_multi_day_event_stays_on_sale_until_its_last_session_ends(): void
    {
        $e = Event::create(['title' => 'Festival', 'status' => Event::PUBLISHED]);
        EventSession::create(['event_id' => $e->id, 'starts_at' => now()->subDay(), 'ends_at' => now()->subDay()->addHours(5)]);
        EventSession::create(['event_id' => $e->id, 'starts_at' => now()->addDay(), 'ends_at' => now()->addDay()->addHours(5)]);
        $e = $e->fresh();
        $this->assertFalse($e->isOver());
        $this->assertTrue($e->isOnSale());
        $this->assertCount(1, $this->holds->hold($e, [$this->type($e)->id => 1], $this->buyer()));
    }

    // ------------------------------------------------------------ sessions

    public function test_a_session_with_a_limit_is_shared_by_every_ticket_type_that_admits_to_it(): void
    {
        $e = $this->event();
        $s = $e->sessions->first();
        $s->update(['capacity' => 5, 'label' => 'Saturday']);
        $general = $this->type($e, ['capacity' => 50]);
        $vip = $this->type($e, ['name' => 'VIP', 'capacity' => 50]);
        $this->holds->hold($e, [$general->id => 3], $this->buyer());
        $this->assertSame(2, $this->holds->remaining($vip), 'VIP is limited by what General already took');
        $this->refuses(fn () => $this->holds->hold($e, [$vip->id => 3], $this->buyer()), 'Only 2 VIP tickets are left');
        $this->refuses(fn () => $this->holds->hold($e, [$general->id => 1, $vip->id => 2, ], $this->buyer()), 'Only 2 place');
        $this->assertCount(2, $this->holds->hold($e, [$general->id => 1, $vip->id => 1], $this->buyer()));
        $this->refuses(fn () => $this->holds->hold($e, [$vip->id => 1], $this->buyer()), 'sold out');
    }

    public function test_a_ticket_type_for_one_session_only_counts_against_that_session(): void
    {
        $e = $this->event();
        $day1 = $e->sessions->first();
        $day1->update(['capacity' => 2, 'label' => 'Day 1']);
        $day2 = EventSession::create(['event_id' => $e->id, 'starts_at' => now()->addDays(11), 'capacity' => 2, 'label' => 'Day 2']);
        $one = $this->type($e, ['name' => 'Day 1 pass', 'capacity' => 50]);
        $two = $this->type($e, ['name' => 'Day 2 pass', 'capacity' => 50]);
        $both = $this->type($e, ['name' => 'Both days', 'capacity' => 50]);
        DB::table('event_ticket_type_sessions')->insert([['ticket_type_id' => $one->id, 'session_id' => $day1->id], ['ticket_type_id' => $two->id, 'session_id' => $day2->id]]);
        $this->holds->hold($e, [$one->id => 2], $this->buyer());
        $this->assertSame(0, $this->holds->remaining($one));
        $this->assertSame(2, $this->holds->remaining($two), 'Day 2 is untouched');
        $this->assertSame(0, $this->holds->remaining($both), 'a pass for both days needs Day 1, which is full');
        $this->refuses(fn () => $this->holds->hold($e, [$both->id => 1], $this->buyer()), 'sold out');
        $this->assertCount(2, $this->holds->hold($e, [$two->id => 2], $this->buyer()));
    }

    public function test_a_cancelled_session_no_longer_limits_anything(): void
    {
        $e = $this->event();
        $e->sessions->first()->update(['capacity' => 1]);
        $t = $this->type($e, ['capacity' => 10]);
        $this->assertSame(1, $this->holds->remaining($t));
        $e->sessions->first()->update(['is_cancelled' => true]);
        EventSession::create(['event_id' => $e->id, 'starts_at' => now()->addDays(12)]);
        $this->assertSame(10, $this->holds->remaining($t->fresh()));
    }

    // ------------------------------------------------------------ paying later than the hold

    public function test_issuing_is_safe_to_repeat_and_never_revives_a_cancelled_ticket(): void
    {
        $e = $this->event();
        $t = $this->type($e);
        $made = $this->holds->hold($e, [$t->id => 2], $this->buyer());
        $this->assertSame(2, $this->holds->issue($made, 9, 90));
        $this->assertSame(0, $this->holds->issue($made, 9, 90), 'the second time does nothing');
        $this->assertSame([9, 90, 'valid'], [$made[0]->fresh()->order_id, $made[0]->fresh()->sale_id, $made[0]->fresh()->state]);
        $this->holds->cancel($made[1]->fresh());
        $this->assertSame(0, $this->holds->issue([$made[1]]));
        $this->assertSame('cancelled', $made[1]->fresh()->state);
    }

    public function test_payment_after_the_hold_ran_out_gets_the_seats_back_only_if_they_are_still_free(): void
    {
        $e = $this->event();
        $t = $this->type($e, ['capacity' => 2]);
        $mine = $this->holds->hold($e, [$t->id => 2], $this->buyer());
        EventTicket::whereIn('id', $mine->pluck('id'))->update(['held_until' => now()->subMinute()]);
        $this->holds->releaseExpired();
        $this->assertTrue($this->holds->reclaim($mine), 'nobody else took them');
        $this->assertSame('held', $mine[0]->fresh()->state);
        $this->assertSame(2, $this->holds->issue($mine));

        $e2 = $this->event(['title' => 'Second']);
        $t2 = $this->type($e2, ['capacity' => 2]);
        $late = $this->holds->hold($e2, [$t2->id => 2], $this->buyer());
        EventTicket::whereIn('id', $late->pluck('id'))->update(['held_until' => now()->subMinute()]);
        $this->holds->releaseExpired();
        $this->holds->issue($this->holds->hold($e2, [$t2->id => 2], $this->buyer()));   // someone else bought them
        $this->assertFalse($this->holds->reclaim($late), 'the seats are gone: the money has to be refunded');
        $this->assertSame('released', $late[0]->fresh()->state);
    }

    // ------------------------------------------------------------ the rest

    public function test_events_get_unique_readable_addresses(): void
    {
        $a = Event::create(['title' => 'Jazz Night 2026!']);
        $b = Event::create(['title' => 'Jazz Night 2026!']);
        $c = Event::create(['title' => '!!!']);
        $this->assertSame(['jazz-night-2026', 'jazz-night-2026-2', 'event'], [$a->slug, $b->slug, $c->slug]);
        $a->delete();
        $this->assertSame('jazz-night-2026-3', Event::create(['title' => 'Jazz Night 2026!'])->slug, 'a deleted event keeps its address');
    }

    public function test_settings_have_defaults_and_refuse_nonsense(): void
    {
        $this->assertSame(15, EventSettings::all()['hold_minutes']);
        $s = EventSettings::save(['hold_minutes' => 30, 'ticket_note' => '  Doors open at 6  ', 'sales_ledger_id' => '12'], 3);
        $this->assertSame([30, 'Doors open at 6', 12], [$s['hold_minutes'], $s['ticket_note'], $s['sales_ledger_id']]);
        $this->assertSame(30, EventSettings::all()['hold_minutes']);
        foreach ([[['hold_minutes' => 2], 'Seats can be held'], [['hold_minutes' => 500], 'Seats can be held'], [['reminder_hours' => 0], 'The reminder goes']] as [$bad, $says]) {
            $this->refuses(fn () => EventSettings::save($bad, 3), $says);
        }
    }
}
