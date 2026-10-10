<?php

namespace Tests\Feature;

use App\Models\Events\Event;
use App\Models\Events\EventSession;
use App\Models\Events\EventTicket;
use App\Models\Events\EventTicketType;
use App\Services\Events\EventSettings;
use App\Services\Events\Reminders;
use App\Services\Notify\Notifier;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** "Tomorrow: your event": once, to each holder, for each date they can go to, and only when the company switched it on. */
class EventRemindersTest extends TestCase
{
    use Concerns\CreatesEventTables;

    /** @var array<int, array> */
    private array $sent = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->createEventTables();
        config(['app.frontend_url' => 'https://shop.example.com']);
        Schema::create('event_reminders', function ($t) { $t->id(); $t->unsignedBigInteger('session_id'); $t->string('buyer_key', 220); $t->dateTime('sent_at'); $t->unique(['session_id', 'buyer_key']); });
        $notifier = $this->createMock(Notifier::class);
        $notifier->method('sendToContact')->willReturnCallback(function (array $c, string $type, string $title, string $msg, array $o = []) { $this->sent[] = ['to' => $c['email'], 'type' => $type, 'title' => $title, 'msg' => $msg, 'o' => $o]; return []; });
        $this->app->instance(Notifier::class, $notifier);
        EventSettings::save(['reminders_on' => true, 'reminder_hours' => 24], null);
    }

    private function event(string $title = 'Jazz night', array $o = [], ?int $hours = 10): Event
    {
        $e = Event::create($o + ['title' => $title, 'status' => Event::PUBLISHED, 'venue_name' => 'Alliance']);
        if ($hours !== null) {
            EventSession::create(['event_id' => $e->id, 'label' => 'Night', 'starts_at' => now()->addHours($hours), 'ends_at' => now()->addHours($hours + 3)]);
        }

        return $e;
    }

    private function ticket(Event $e, string $email = 'amina@example.com', array $o = []): EventTicket
    {
        $type = EventTicketType::where('event_id', $e->id)->orderBy('id')->first() ?? EventTicketType::create(['event_id' => $e->id, 'name' => 'General', 'price' => 1000]);

        return EventTicket::create($o + ['event_id' => $e->id, 'ticket_type_id' => $type->id, 'reference' => strtoupper(substr(md5(uniqid('', true)), 0, 8)), 'state' => 'valid', 'buyer_name' => 'Amina', 'buyer_email' => $email, 'holder_name' => 'Amina', 'price' => 1000]);
    }

    private function remind(bool $dry = false): array
    {
        return app(Reminders::class)->run($dry);
    }

    public function test_nothing_is_sent_until_the_company_switches_it_on(): void
    {
        EventSettings::save(['reminders_on' => false], null);
        $e = $this->event();
        $this->ticket($e);
        $this->assertSame(['sent' => 0, 'dates' => 0], $this->remind());
        $this->assertSame([], $this->sent);
    }

    public function test_each_buyer_is_reminded_once_with_all_their_tickets_in_one_message(): void
    {
        $e = $this->event();
        $this->ticket($e);
        $this->ticket($e);
        $this->ticket($e, 'baraka@example.com');
        $this->assertSame(['sent' => 2, 'dates' => 1], $this->remind());
        $this->assertEqualsCanonicalizing(['amina@example.com', 'baraka@example.com'], array_column($this->sent, 'to'));
        $amina = collect($this->sent)->firstWhere('to', 'amina@example.com');
        $this->assertSame(['event_reminder', 'Reminder: Jazz night'], [$amina['type'], $amina['title']]);
        $this->assertStringContainsString('Have your ticket ready', collect($this->sent)->firstWhere('to', 'baraka@example.com')['msg'], 'one ticket reads in the singular');
        $this->assertStringContainsString('Have your 2 tickets ready', $amina['msg']);
        $this->assertStringContainsString('Alliance', $amina['msg']);
        $this->assertStringStartsWith('/tickets/tk.', $amina['o']['action_url']);
        $this->assertSame(['sent' => 0, 'dates' => 1], $this->remind(), 'the next run reminds nobody again');
        $this->assertCount(2, $this->sent);
    }

    public function test_only_a_date_inside_the_reminder_time_counts(): void
    {
        $this->ticket($this->event('Far', [], 30));
        $soon = $this->event('Soon', [], 5);
        $this->ticket($soon);
        $this->ticket($this->event('Started', [], -2));
        $this->assertSame(1, $this->remind()['sent']);
        $this->assertSame('Reminder: Soon', $this->sent[0]['title']);
        $this->travel(7)->hours();
        $this->assertSame(1, $this->remind()['sent'], 'a few hours later the far one is inside the time');
        $this->assertSame('Reminder: Far', $this->sent[1]['title']);
        EventSettings::save(['reminder_hours' => 2], null);
        $this->sent = [];
        $this->ticket($this->event('Later', [], 5));
        $this->assertSame(0, $this->remind()['sent'], 'five hours away is outside a two-hour reminder');
    }

    public function test_cancelled_dates_and_events_that_are_not_on_sale_are_never_reminded(): void
    {
        foreach ([Event::CANCELLED, Event::DRAFT, Event::POSTPONED] as $status) {
            $this->ticket($this->event($status, ['status' => $status]));
        }
        $e = $this->event('One date cancelled');
        EventSession::where('event_id', $e->id)->update(['is_cancelled' => true]);
        $this->ticket($e);
        $this->assertSame(0, $this->remind()['sent']);
    }

    public function test_only_valid_tickets_are_reminded(): void
    {
        $e = $this->event();
        foreach (['cancelled', 'held', 'released'] as $state) {
            $this->ticket($e, "{$state}@example.com", ['state' => $state]);
        }
        $this->assertSame(0, $this->remind()['sent']);
    }

    public function test_a_day_pass_is_reminded_for_its_day_and_a_full_pass_before_each_day(): void
    {
        $e = $this->event('Festival', [], null);
        $d1 = EventSession::create(['event_id' => $e->id, 'label' => 'Day 1', 'starts_at' => now()->addHours(10), 'ends_at' => now()->addHours(14)]);
        $d2 = EventSession::create(['event_id' => $e->id, 'label' => 'Day 2', 'starts_at' => now()->addHours(34), 'ends_at' => now()->addHours(38)]);
        $full = EventTicketType::create(['event_id' => $e->id, 'name' => 'Full pass', 'price' => 3000]);
        $day2 = EventTicketType::create(['event_id' => $e->id, 'name' => 'Day 2', 'price' => 1200]);
        DB::table('event_ticket_type_sessions')->insert(['ticket_type_id' => $day2->id, 'session_id' => $d2->id]);
        $this->ticket($e, 'full@example.com', ['ticket_type_id' => $full->id]);
        $this->ticket($e, 'day2@example.com', ['ticket_type_id' => $day2->id]);
        $this->assertSame(1, $this->remind()['sent']);
        $this->assertSame(['full@example.com'], array_column($this->sent, 'to'), 'only the full pass can go on day 1');
        $this->travel(20)->hours();
        $this->assertSame(2, $this->remind()['sent']);
        $this->assertEqualsCanonicalizing(['full@example.com', 'full@example.com', 'day2@example.com'], array_column($this->sent, 'to'), 'day 2 reminds both');
    }

    public function test_a_dry_run_only_counts(): void
    {
        $e = $this->event();
        $this->ticket($e);
        $this->assertSame(1, $this->remind(true)['sent']);
        $this->assertSame([[], 0], [$this->sent, DB::table('event_reminders')->count()]);
        $this->assertSame(1, $this->remind()['sent'], 'and it still goes when it is real');
    }

    public function test_a_reminder_that_fails_to_send_is_not_repeated(): void
    {
        $e = $this->event();
        $this->ticket($e);
        $broken = $this->createMock(Notifier::class);
        $broken->method('sendToContact')->willThrowException(new \RuntimeException('mail down'));
        $this->app->instance(Notifier::class, $broken);
        $this->assertSame(1, app(Reminders::class)->run()['sent']);
        $this->assertSame(1, DB::table('event_reminders')->count());
        $this->assertSame(0, app(Reminders::class)->run()['sent'], 'a broken mail server does not turn into a reminder every 15 minutes');
    }
}
