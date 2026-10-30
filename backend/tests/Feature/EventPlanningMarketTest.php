<?php

namespace Tests\Feature;

use App\Models\Events\Event;
use App\Models\Events\EventVendor;
use App\Models\User;
use App\Services\Books\VoucherService;
use App\Services\Events\EventAdvertising;
use App\Services\Events\EventBookings;
use App\Services\Events\EventException;
use App\Services\Events\EventGuests;
use App\Services\Events\EventMarketplace;
use App\Services\Events\EventPlanning;
use App\Services\Events\EventSettings;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/** Events phases 3 to 6: the planning workspace, guests and RSVPs, advertising, and booking vendors with the money held for them. */
class EventPlanningMarketTest extends TestCase
{
    use Concerns\CreatesEventTables;

    private User $planner;
    private User $photog;
    private User $owner;
    private Event $event;
    private array $journals = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->createEventTables();
        Schema::create('users', function ($t) { $t->id(); $t->string('name')->nullable(); $t->string('email')->nullable(); $t->timestamps(); $t->softDeletes(); });
        Schema::table('events', function ($t) { $t->unsignedBigInteger('organiser_id')->nullable(); $t->unsignedBigInteger('category_id')->nullable(); $t->string('approval_status')->default('approved'); $t->unsignedBigInteger('client_customer_id')->nullable(); });
        Schema::create('event_tasks', function ($t) {
            $t->id(); $t->unsignedBigInteger('event_id'); $t->unsignedBigInteger('parent_id')->nullable(); $t->unsignedBigInteger('depends_on_id')->nullable(); $t->string('title'); $t->text('notes')->nullable(); $t->string('department')->nullable();
            $t->unsignedBigInteger('assignee_id')->nullable(); $t->string('priority')->default('normal'); $t->string('status')->default('todo'); $t->date('starts_on')->nullable(); $t->date('due_on')->nullable(); $t->decimal('effort_hours', 6, 2)->nullable();
            $t->string('evidence')->nullable(); $t->boolean('client_visible')->default(false); $t->integer('sort_order')->default(0); $t->dateTime('completed_at')->nullable(); $t->unsignedBigInteger('created_by')->nullable(); $t->timestamps();
        });
        Schema::create('event_task_comments', function ($t) { $t->id(); $t->unsignedBigInteger('task_id'); $t->unsignedBigInteger('user_id')->nullable(); $t->string('body'); $t->timestamp('created_at')->nullable(); });
        Schema::create('event_milestones', function ($t) { $t->id(); $t->unsignedBigInteger('event_id'); $t->string('title'); $t->date('due_on')->nullable(); $t->dateTime('done_at')->nullable(); $t->boolean('client_visible')->default(true); $t->integer('sort_order')->default(0); $t->timestamps(); });
        Schema::create('event_programme', function ($t) { $t->id(); $t->unsignedBigInteger('event_id'); $t->date('day_on')->nullable(); $t->string('starts_at')->nullable(); $t->string('ends_at')->nullable(); $t->string('title'); $t->string('location')->nullable(); $t->string('responsible')->nullable(); $t->string('equipment')->nullable(); $t->string('notes')->nullable(); $t->integer('sort_order')->default(0); $t->timestamps(); });
        Schema::create('event_budget_lines', function ($t) {
            $t->id(); $t->unsignedBigInteger('event_id'); $t->string('category'); $t->string('item'); $t->string('supplier')->nullable(); $t->unsignedBigInteger('booking_id')->nullable(); $t->decimal('estimated', 14, 2)->default(0);
            $t->decimal('approved', 14, 2)->default(0); $t->decimal('committed', 14, 2)->default(0); $t->decimal('actual', 14, 2)->default(0); $t->string('notes')->nullable(); $t->timestamps();
        });
        Schema::create('event_team', function ($t) { $t->id(); $t->unsignedBigInteger('event_id'); $t->unsignedBigInteger('user_id')->nullable(); $t->string('name'); $t->string('role'); $t->string('phone')->nullable(); $t->boolean('sees_budget')->default(false); $t->timestamps(); });
        Schema::create('event_templates', function ($t) { $t->id(); $t->string('name')->unique(); $t->unsignedBigInteger('category_id')->nullable(); $t->string('description')->nullable(); $t->json('body'); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('event_guests', function ($t) {
            $t->id(); $t->unsignedBigInteger('event_id'); $t->string('token', 24)->unique(); $t->string('name'); $t->string('email')->nullable(); $t->string('phone')->nullable(); $t->string('role')->default('guest'); $t->string('group_name')->nullable();
            $t->string('table_label')->nullable(); $t->unsignedSmallInteger('plus_ones')->default(0); $t->string('rsvp')->default('pending'); $t->unsignedSmallInteger('attending')->default(0); $t->string('meal')->nullable(); $t->string('needs')->nullable();
            $t->string('note')->nullable(); $t->dateTime('invited_at')->nullable(); $t->dateTime('reminded_at')->nullable(); $t->unsignedSmallInteger('reminders')->default(0); $t->dateTime('responded_at')->nullable(); $t->dateTime('checked_in_at')->nullable(); $t->timestamps();
        });
        Schema::create('event_guest_history', function ($t) { $t->id(); $t->unsignedBigInteger('guest_id'); $t->string('rsvp'); $t->unsignedSmallInteger('attending')->default(0); $t->timestamp('created_at')->nullable(); });
        Schema::create('event_ad_products', function ($t) { $t->id(); $t->string('name'); $t->string('kind'); $t->string('description')->nullable(); $t->decimal('price', 14, 2)->default(0); $t->unsignedSmallInteger('duration_days')->default(7); $t->unsignedSmallInteger('max_slots')->default(5); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('event_ad_campaigns', function ($t) {
            $t->id(); $t->unsignedBigInteger('event_id'); $t->unsignedBigInteger('product_id'); $t->unsignedBigInteger('category_id')->nullable(); $t->unsignedBigInteger('requested_by')->nullable(); $t->date('starts_on'); $t->date('ends_on'); $t->decimal('amount', 14, 2)->default(0);
            $t->string('status')->default('pending'); $t->string('note')->nullable(); $t->unsignedBigInteger('invoice_id')->nullable(); $t->unsignedInteger('impressions')->default(0); $t->unsignedInteger('clicks')->default(0); $t->unsignedInteger('registrations')->default(0); $t->timestamps();
        });
        Schema::create('event_provider_members', function ($t) { $t->id(); $t->string('provider_type'); $t->unsignedBigInteger('provider_id'); $t->unsignedBigInteger('user_id'); $t->string('role')->default('owner'); $t->timestamps(); });
        Schema::create('event_venues', function ($t) { $t->id(); $t->string('name'); $t->string('slug')->unique(); $t->string('status')->default('pending'); $t->boolean('is_listed')->default(true); $t->decimal('commission_percent', 5, 2)->nullable(); $t->softDeletes(); $t->timestamps(); });
        Schema::create('event_venue_spaces', function ($t) { $t->id(); $t->unsignedBigInteger('venue_id'); $t->string('name'); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('event_vendors', function ($t) {
            $t->id(); $t->string('name'); $t->string('slug')->unique(); $t->string('category')->default('other'); $t->string('summary')->nullable(); $t->json('service_areas')->nullable(); $t->string('status')->default('pending'); $t->boolean('is_listed')->default(true);
            $t->decimal('commission_percent', 5, 2)->nullable(); $t->unsignedBigInteger('created_by')->nullable(); $t->softDeletes(); $t->timestamps();
        });
        Schema::create('event_vendor_packages', function ($t) { $t->id(); $t->unsignedBigInteger('vendor_id'); $t->string('name'); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('event_bookings', function ($t) {
            $t->id(); $t->string('reference')->unique(); $t->unsignedBigInteger('event_id'); $t->string('provider_type'); $t->unsignedBigInteger('provider_id'); $t->unsignedBigInteger('offer_id')->nullable(); $t->unsignedBigInteger('requested_by')->nullable();
            $t->date('starts_on'); $t->date('ends_on')->nullable(); $t->unsignedInteger('guests')->nullable(); $t->string('message')->nullable(); $t->decimal('quoted_amount', 14, 2)->nullable(); $t->decimal('deposit_percent', 5, 2)->nullable();
            $t->decimal('commission_percent', 5, 2)->nullable(); $t->string('status')->default('enquiry'); $t->string('provider_note')->nullable(); $t->string('cancel_reason')->nullable(); $t->timestamps();
        });
        Schema::create('event_provider_ledger', function ($t) { $t->id(); $t->string('provider_type'); $t->unsignedBigInteger('provider_id'); $t->unsignedBigInteger('booking_id')->nullable(); $t->string('kind'); $t->decimal('amount', 14, 2); $t->unsignedBigInteger('voucher_id')->nullable(); $t->string('reference')->nullable(); $t->string('note')->nullable(); $t->unsignedBigInteger('created_by')->nullable(); $t->timestamps(); });
        Schema::create('event_reviews', function ($t) { $t->id(); $t->unsignedBigInteger('booking_id')->unique(); $t->string('provider_type'); $t->unsignedBigInteger('provider_id'); $t->unsignedBigInteger('user_id')->nullable(); $t->unsignedTinyInteger('rating'); $t->string('comment')->nullable(); $t->timestamps(); });
        Schema::create('event_blocked_dates', function ($t) { $t->id(); $t->string('provider_type'); $t->unsignedBigInteger('provider_id'); $t->date('day_on'); $t->string('note')->nullable(); $t->unique(['provider_type', 'provider_id', 'day_on']); });
        Schema::create('voucher_types', function ($t) { $t->id(); $t->string('base_type'); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('currencies', function ($t) { $t->id(); $t->string('code', 8); $t->boolean('is_base')->default(false); $t->timestamps(); });
        DB::table('voucher_types')->insert(['id' => 3, 'base_type' => 'journal']);
        foreach ([[1, 'Planner'], [2, 'Photographer'], [3, 'Caro']] as [$id, $n]) {
            DB::table('users')->insert(['id' => $id, 'name' => $n, 'email' => strtolower($n) . '@x.test']);
        }
        $this->planner = User::find(1);
        $this->photog = User::find(2);
        $this->owner = User::find(3);
        $this->event = Event::create(['title' => 'Wedding', 'status' => 'published']);
        $this->journals = [];
        $this->mock(VoucherService::class, function ($m) {
            $m->shouldReceive('create')->andReturnUsing(function ($d) {
                $this->journals[] = $d;
                $v = new \App\Models\Books\Voucher();
                $v->id = 500 + count($this->journals);
                $v->voucher_number = 'J-' . count($this->journals);

                return $v;
            });
        });
        EventSettings::save(['provider_payable_ledger_id' => 42, 'commission_income_ledger_id' => 43], 1);
    }

    private function plan(): EventPlanning
    {
        return app(EventPlanning::class);
    }

    public function test_tasks_depend_on_each_other_and_the_overview_counts_them(): void
    {
        $p = $this->plan();
        $a = $p->saveTask($this->event, ['title' => 'Book venue', 'due_on' => '2020-01-01'], null, $this->planner);
        $b = $p->saveTask($this->event, ['title' => 'Send invitations', 'depends_on_id' => $a['id']], null, $this->planner);
        try {
            $p->saveTask($this->event, ['status' => 'done'], $b['id'], $this->planner);
            $this->fail('finished before the task it waits for');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('status', $e->errors());
        }
        $p->saveTask($this->event, ['status' => 'done'], $a['id'], $this->planner);
        $p->saveTask($this->event, ['status' => 'done'], $b['id'], $this->planner);
        $p->saveTask($this->event, ['title' => 'Late one', 'due_on' => '2020-01-02'], null, $this->planner);
        $o = $p->overview($this->event, $this->planner);
        $this->assertSame([3, 2, 1], [$o['tasks']['total'], $o['tasks']['done'], $o['tasks']['late']]);
        $this->assertCount(1, $p->addComment($this->event, $a['id'], 'Deposit paid', $this->planner));
        $this->expectException(ValidationException::class);
        $p->saveTask($this->event, ['title' => 'Bad dates', 'starts_on' => '2030-02-01', 'due_on' => '2030-01-01'], null, $this->planner);
    }

    public function test_a_template_builds_the_whole_checklist_and_the_budget_is_hidden_from_a_photographer(): void
    {
        $p = $this->plan();
        $this->assertSame(3, $p->addStandardTemplates());
        $wedding = collect($p->templates())->firstWhere('name', 'Wedding');
        $made = $p->applyTemplate($this->event, $wedding['id'], '2030-06-15', $this->planner);
        $this->assertSame([7, 4, 7, 5, 3], array_values($made));
        $first = DB::table('event_tasks')->where('title', 'Book the venue')->first();
        $this->assertSame('2029-12-17', $first->due_on, '180 days before the wedding day');
        $this->assertSame('urgent', $first->priority);
        $p->saveBudgetLine($this->event, ['category' => 'Venue', 'item' => 'Hall', 'estimated' => 100000, 'approved' => 90000, 'committed' => 85000], null);
        $b = $p->budget($this->event)['totals'];
        $this->assertSame([90000.0, 5000.0, 'near'], [$b['approved'], $b['remaining'], $b['warning']], 'within 10% of the approved amount warns');
        $p->saveTeam($this->event, ['email' => 'photographer@x.test', 'role' => 'Photographer', 'sees_budget' => false], null);
        $this->assertFalse($p->canSeeBudget($this->event, $this->photog), 'a team member who was not given the budget does not see it');
        $this->assertTrue($p->canSeeBudget($this->event, $this->planner));
        $this->assertArrayNotHasKey('budget', $p->overview($this->event, $this->photog));
        $this->assertArrayHasKey('budget', $p->overview($this->event, $this->planner));
    }

    public function test_a_guest_list_is_imported_invited_answered_and_summed_up(): void
    {
        $g = app(EventGuests::class);
        $r = $g->import($this->event, "Amina Wanjiru, amina@x.test, 0711000001, guest, Bride's family, 1\nJoseph Otieno, joseph@x.test, , speaker\nAmina again, amina@x.test\n, nobody@x.test\n");
        $this->assertSame([2, 1], [$r['added'], $r['skipped']]);
        $this->assertCount(1, $r['errors'], 'a line with no name is reported, not added');
        $amina = DB::table('event_guests')->where('name', 'Amina Wanjiru')->first();
        $this->assertSame(24, strlen($amina->token));
        $view = $g->respond($amina, ['rsvp' => 'yes', 'attending' => 5, 'meal' => 'Vegetarian', 'needs' => 'Wheelchair access']);
        $this->assertSame(2, $view['guest']['attending'], 'one plus-one allowed, so two people at most');
        $s = $g->summary($this->event);
        $this->assertSame([2, 1, 1, 2, ['Vegetarian' => 1]], [$s['invited'], $s['yes'], $s['pending'], $s['heads'], $s['meals']]);
        $this->assertSame('Wheelchair access', $s['needs'][0]['needs']);
        $this->assertSame(2, DB::table('event_guest_history')->count() + 1, 'every answer is kept');
        $this->expectException(ValidationException::class);
        $g->respond($amina, ['rsvp' => 'perhaps']);
    }

    public function test_the_door_pack_lists_guests_who_are_coming_and_syncs_check_ins(): void
    {
        $g = app(EventGuests::class);
        $a = $g->save($this->event, ['name' => 'Coming'], null);
        $b = $g->save($this->event, ['name' => 'Not coming'], null);
        $g->respond(DB::table('event_guests')->find($a['id']), ['rsvp' => 'yes']);
        $g->respond(DB::table('event_guests')->find($b['id']), ['rsvp' => 'no']);
        $pack = $g->doorPack($this->event);
        $this->assertSame(['Coming'], array_column(array_filter($pack['entries'], fn ($e) => $e['kind'] === 'guest'), 'name'));
        $this->assertSame(1, $g->checkIn($this->event, [$a['id']]));
        $this->assertSame(0, $g->checkIn($this->event, [$a['id']]), 'a second sync changes nothing');
    }

    public function test_promotions_are_limited_by_places_approved_and_counted(): void
    {
        $ads = app(EventAdvertising::class);
        $this->assertSame(5, $ads->addStandardProducts());
        $product = collect($ads->products())->firstWhere('kind', 'banner');   // 3 places
        $day = today()->addDay()->toDateString();
        $ids = [];
        for ($i = 0; $i < 4; $i++) {
            $e = Event::create(['title' => "Event {$i}", 'status' => 'published'])->fresh();
            try {
                $c = $ads->request($e, $product['id'], $day, null, $this->planner);
                $ids[] = $c['id'];
                $ads->decide($c['id'], true, null);
            } catch (EventException $ex) {
                $this->assertSame(3, $i, 'the fourth is refused: the places are taken ('.$ex->getMessage().')');
            }
        }
        $this->assertCount(3, $ids);
        $this->assertSame([], $ads->live('banner'), 'not started yet (tomorrow)');
        DB::table('event_ad_campaigns')->update(['starts_on' => today()->toDateString()]);
        $live = $ads->live('banner');
        $this->assertCount(3, $live);
        $cid = array_values($live)[0];
        $ads->count($cid, 'impressions');
        $ads->count($cid, 'impressions');
        $ads->count($cid, 'clicks');
        $ads->registered(array_key_first($live), 4);
        $c = collect($ads->campaigns())->firstWhere('id', $cid);
        $this->assertSame([2, 1, 4, 50.0], [$c['impressions'], $c['clicks'], $c['registrations'], $c['ctr']]);
        $draft = Event::create(['title' => 'Draft', 'status' => 'draft'])->fresh();
        $this->expectException(EventException::class);
        $ads->request($draft, $product['id'], $day, null, $this->planner);
    }

    private function vendor(): EventVendor
    {
        $v = EventVendor::create(['name' => 'ABC Catering', 'slug' => 'abc', 'category' => 'caterer', 'status' => 'verified', 'is_listed' => true, 'created_by' => $this->owner->id]);
        DB::table('event_provider_members')->insert(['provider_type' => 'vendor', 'provider_id' => $v->id, 'user_id' => $this->owner->id, 'role' => 'owner']);

        return $v;
    }

    public function test_a_booking_goes_from_enquiry_to_payout_with_the_money_held_and_commission_taken(): void
    {
        $v = $this->vendor();
        $b = app(EventBookings::class);
        $day = today()->addDays(30)->toDateString();
        $r = $b->request($this->planner, $this->event, 'vendor', $v->id, ['starts_on' => $day, 'guests' => 100]);
        $this->assertSame('enquiry', $r['status']);
        $q = $b->quote($r['id'], 100000, 30, 'Lunch for 100');
        $this->assertSame([100000.0, 30000.0, 10.0], [$q['quoted_amount'], $q['deposit_amount'], $q['commission_percent']], 'deposit 30% and the events default commission');
        $this->assertSame(100000.0, (float) DB::table('event_budget_lines')->where('booking_id', $r['id'])->value('estimated'));
        $b->accept($r['id']);
        $this->assertSame(100000.0, (float) DB::table('event_budget_lines')->where('booking_id', $r['id'])->value('committed'));
        $x = $b->recordPayment($r['id'], 20000, 41, 'MPESA1', $this->planner);
        $this->assertSame('accepted', $x['status'], 'less than the deposit does not confirm it');
        $x = $b->recordPayment($r['id'], 10000, 41, 'MPESA2', $this->planner);
        $this->assertSame(['confirmed', 30000.0, 70000.0], [$x['status'], $x['paid'], $x['balance_due']]);
        $this->assertSame([41, 'D', 42, 'C'], [$this->journals[0]['entries'][0]['ledger_id'], $this->journals[0]['entries'][0]['side'], $this->journals[0]['entries'][1]['ledger_id'], $this->journals[0]['entries'][1]['side']], 'Dr bank, Cr owed to providers');
        $b->deliver($r['id']);
        try {
            $b->complete($r['id'], $this->planner);
            $this->fail('completed with a balance unpaid');
        } catch (EventException $e) {
            $this->assertStringContainsString('balance', $e->getMessage());
        }
        $b->recordPayment($r['id'], 70000, 41, null, $this->planner);
        $this->assertSame([], array_filter($b->balances(), fn ($x) => $x['payable'] > 0), 'nothing payable until the job is completed');
        $done = $b->complete($r['id'], $this->planner);
        $this->assertSame('completed', $done['status']);
        $this->assertSame(90000.0, $b->owed('vendor', $v->id), '100000 held less 10% commission');
        $last = end($this->journals);
        $this->assertSame([42, 'D', 43, 'C', 10000.0], [$last['entries'][0]['ledger_id'], $last['entries'][0]['side'], $last['entries'][1]['ledger_id'], $last['entries'][1]['side'], (float) $last['entries'][0]['amount']], 'commission: Dr owed to providers, Cr commission income');
        $r2 = $b->payout('vendor', $v->id, 50000, 41, 'EFT9', $this->planner);
        $this->assertSame(40000.0, $r2['owed']);
        try {
            $b->payout('vendor', $v->id, 50000, 41, null, $this->planner);
            $this->fail('paid out more than is owed');
        } catch (EventException $e) {
            $this->assertStringContainsString('more than', $e->getMessage());
        }
        $b->review($r['id'], $this->planner, 5, 'Superb');
        $this->assertSame(['average' => 5.0, 'count' => 1], array_intersect_key($b->reviews('vendor', $v->id), ['average' => 1, 'count' => 1]));
    }

    public function test_blocked_days_and_clashing_venue_bookings_are_refused_and_only_finished_jobs_reviewed(): void
    {
        $v = $this->vendor();
        $b = app(EventBookings::class);
        $day = today()->addDays(10)->toDateString();
        $r = $b->request($this->planner, $this->event, 'vendor', $v->id, ['starts_on' => $day]);
        try {
            $b->review($r['id'], $this->planner, 5, null);
            $this->fail('reviewed before the job was done');
        } catch (EventException $e) {
            $this->assertStringContainsString('cannot be reviewed', $e->getMessage());
        }
        $b->block('vendor', $v->id, [$day], true);
        try {
            $b->request($this->planner, $this->event, 'vendor', $v->id, ['starts_on' => $day]);
            $this->fail('booked a blocked day');
        } catch (EventException $e) {
            $this->assertStringContainsString('not available', $e->getMessage());
        }
        $venue = DB::table('event_venues')->insertGetId(['name' => 'Hall', 'slug' => 'hall', 'status' => 'verified']);
        $b->assertFree('venue', $venue, null, $day, $day);
        DB::table('event_bookings')->insert(['reference' => 'EBX', 'event_id' => 1, 'provider_type' => 'venue', 'provider_id' => $venue, 'starts_on' => $day, 'status' => 'confirmed']);
        $this->expectException(EventException::class);
        $b->assertFree('venue', $venue, null, $day, $day);
    }
}
