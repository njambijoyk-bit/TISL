<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\EventAdminController;
use App\Http\Controllers\Api\EventBoxOfficeController;
use App\Http\Controllers\Api\EventPlatformController;
use App\Http\Controllers\Api\EventRefundController;
use App\Models\Events\Event;
use App\Models\Events\EventCategory;
use App\Models\Events\EventOrganiser;
use App\Models\User;
use App\Services\Events\EventAccess;
use App\Services\Events\EventCategoryService;
use App\Services\Events\EventEditor;
use App\Services\Events\EventException;
use App\Services\Events\EventOrganiserService;
use App\Services\Events\EventPresenter;
use App\Services\ServiceVideo;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

/** Events, phase 1: categories, outside organisers kept apart from each other, the approval of their events, and what stays with TISL's staff. */
class EventPlatformTest extends TestCase
{
    use Concerns\CreatesEventTables;
    use Concerns\StandsInForAccess;

    private User $staff;
    private User $anna;
    private User $ben;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createEventTables();
        Schema::create('users', function ($t) { $t->id(); $t->string('name')->nullable(); $t->string('email')->nullable(); $t->timestamps(); $t->softDeletes(); });
        Schema::table('events', function ($t) {
            $t->unsignedBigInteger('category_id')->nullable(); $t->unsignedBigInteger('organiser_id')->nullable(); $t->unsignedBigInteger('client_customer_id')->nullable(); $t->unsignedBigInteger('manager_user_id')->nullable();
            $t->string('participation', 12)->default('paid'); $t->string('approval_status', 10)->default('approved'); $t->string('approval_note')->nullable(); $t->string('registration_status', 10)->default('auto');
            $t->unsignedSmallInteger('age_min')->nullable(); $t->string('languages')->nullable(); $t->string('accessibility')->nullable(); $t->unsignedBigInteger('venue_id')->nullable(); $t->unsignedBigInteger('venue_space_id')->nullable();
        });
        Schema::create('event_categories', function ($t) {
            $t->id(); $t->unsignedBigInteger('parent_id')->nullable(); $t->string('name'); $t->string('slug')->unique(); $t->string('icon')->nullable(); $t->string('description')->nullable(); $t->string('cover_image')->nullable();
            $t->string('default_participation', 12)->nullable(); $t->integer('sort_order')->default(0); $t->boolean('is_active')->default(true); $t->timestamps();
        });
        Schema::create('event_organisers', function ($t) {
            $t->id(); $t->string('name'); $t->string('slug')->unique(); $t->string('kind')->default('business'); $t->string('email')->nullable(); $t->string('phone')->nullable(); $t->string('website')->nullable(); $t->string('logo')->nullable();
            $t->text('description')->nullable(); $t->string('tax_pin')->nullable(); $t->string('registration_no')->nullable(); $t->string('status')->default('pending'); $t->string('status_note')->nullable(); $t->dateTime('verified_at')->nullable();
            $t->unsignedBigInteger('verified_by')->nullable(); $t->decimal('commission_percent', 5, 2)->nullable(); $t->boolean('is_internal')->default(false); $t->unsignedBigInteger('created_by')->nullable(); $t->softDeletes(); $t->timestamps();
        });
        Schema::create('event_organiser_members', function ($t) { $t->id(); $t->unsignedBigInteger('organiser_id'); $t->unsignedBigInteger('user_id'); $t->string('role')->default('staff'); $t->timestamps(); $t->unique(['organiser_id', 'user_id']); });
        Schema::create('event_documents', function ($t) {
            $t->id(); $t->string('owner_type'); $t->unsignedBigInteger('owner_id'); $t->string('type'); $t->string('title')->nullable(); $t->string('path'); $t->string('status')->default('pending'); $t->string('note')->nullable();
            $t->unsignedBigInteger('reviewed_by')->nullable(); $t->dateTime('reviewed_at')->nullable(); $t->timestamps();
        });
        DB::table('event_organisers')->insert(['id' => 1, 'name' => 'TISL', 'slug' => 'tisl', 'kind' => 'company', 'status' => 'verified', 'is_internal' => 1]);
        foreach ([[5, 'Staff', 'staff@x.test'], [6, 'Anna', 'anna@x.test'], [7, 'Ben', 'ben@x.test']] as [$id, $n, $e]) {
            DB::table('users')->insert(['id' => $id, 'name' => $n, 'email' => $e]);
        }
        $this->staff = User::find(5);
        $this->anna = User::find(6);
        $this->ben = User::find(7);
        $this->grant($this->staff, ['events.view', 'events.edit', 'events.admin', 'events.sell', 'events.refund']);
        $this->grant($this->anna, ['events.view', 'events.edit', 'events.sell', 'events.refund']);
        $this->grant($this->ben, ['events.view', 'events.edit', 'events.sell', 'events.refund']);
        // two verified outside organisers, each with one person
        $o = app(EventOrganiserService::class);
        $a = $o->apply($this->anna, ['name' => 'Anna Weddings']);
        $b = $o->apply($this->ben, ['name' => 'Ben Concerts']);
        $o->setStatus($a, 'verified', null, $this->staff);
        $o->setStatus($b, 'verified', null, $this->staff);
    }

    protected function tearDown(): void
    {
        foreach (['event_documents', 'event_organiser_members', 'event_organisers', 'event_categories', 'users'] as $t) {
            Schema::dropIfExists($t);
        }
        parent::tearDown();
    }

    private function admin(): EventAdminController
    {
        return new EventAdminController(app(EventEditor::class), app(EventPresenter::class), app(ServiceVideo::class));
    }

    private function req(User $u, array $data = [], string $method = 'POST'): Request
    {
        $r = Request::create('/x', $method, $data);
        $this->app->instance('request', $r);   // the scoping reads the request the controller was called with (binding it resets the user, so the user is set after)
        $r->setUserResolver(fn () => $u);

        return $r;
    }

    private function body(array $o = []): array
    {
        return $o + ['title' => 'Jazz night', 'venue_name' => 'Alliance', 'currency_id' => 1, 'sessions' => [['key' => 'a', 'starts_at' => now()->addDays(10)->format('Y-m-d H:i:s'), 'label' => 'Saturday']],
            'ticket_types' => [['name' => 'General', 'price' => 1000, 'capacity' => 20, 'session_keys' => ['a']]]];
    }

    // ── categories ──────────────────────────────────────────────────────

    public function test_the_standard_categories_are_added_once_two_levels_deep_and_a_used_one_is_switched_off_not_deleted(): void
    {
        $svc = app(EventCategoryService::class);
        $made = $svc->addStandard();
        $this->assertContains('Weddings & Celebrations', $made);
        $this->assertContains('Weddings & Celebrations › Birthdays', $made);
        $this->assertSame([], $svc->addStandard(), 'nothing is added twice');
        $tree = $svc->tree();
        $this->assertSame(6, count($tree));
        $weddings = collect($tree)->firstWhere('name', 'Weddings & Celebrations');
        $this->assertSame(9, count($weddings['children']));
        $birthdays = EventCategory::where('name', 'Birthdays')->first();
        try {
            $svc->save($birthdays, ['name' => 'Birthdays', 'parent_id' => EventCategory::where('name', 'Weddings')->value('id')]);
            $this->fail('three levels');
        } catch (\Illuminate\Validation\ValidationException $e) {
            $this->assertArrayHasKey('parent_id', $e->errors());
        }
        $conf = EventCategory::where('name', 'Conferences')->first();
        DB::table('events')->insert(['title' => 'AGM', 'slug' => 'agm', 'category_id' => $conf->id]);
        $this->assertFalse($svc->delete($conf), 'it has an event');
        $this->assertFalse((bool) $conf->fresh()->is_active);
        $this->assertTrue($svc->delete(EventCategory::where('name', 'Marathons')->first()));
        $this->assertSame(1, EventCategory::where('slug', 'weddings')->count());
        $this->assertNotSame(EventCategory::where('name', 'Weddings')->value('slug'), EventCategory::where('name', 'Weddings & Celebrations')->value('slug'));
    }

    // ── organisers ──────────────────────────────────────────────────────

    public function test_signing_up_makes_a_pending_organiser_with_the_person_as_owner_and_commission_follows_the_rules(): void
    {
        $o = app(EventOrganiserService::class);
        $new = User::create(['name' => 'Cara', 'email' => 'cara@x.test']);
        $org = $o->apply($new, ['name' => 'Cara Catering', 'kind' => 'business']);
        $this->assertSame('pending', $org->status);
        $this->assertFalse($org->inGoodStanding());
        $this->assertSame(['owner'], collect($o->members($org))->pluck('role')->all());
        try {
            $o->apply($new, ['name' => 'Another']);
            $this->fail('one account each');
        } catch (\Illuminate\Validation\ValidationException $e) {
            $this->assertArrayHasKey('name', $e->errors());
        }
        $this->assertSame(10.0, $o->commissionFor($org), 'the default in the events settings');
        $o->setCommission($org, 7.5);
        $this->assertSame(7.5, $o->commissionFor($org->fresh()));
        $this->assertSame(0.0, $o->commissionFor(EventOrganiser::where('is_internal', 1)->first()), 'TISL pays itself nothing');
        $o->setStatus($org, 'verified', null, $this->staff);
        $this->assertTrue($org->fresh()->inGoodStanding());
        $this->expectException(\Illuminate\Validation\ValidationException::class);
        $o->setStatus(EventOrganiser::where('is_internal', 1)->first(), 'suspended', null, $this->staff);
    }

    public function test_the_last_owner_cannot_be_removed(): void
    {
        $o = app(EventOrganiserService::class);
        $org = EventOrganiser::where('name', 'Anna Weddings')->first();
        $o->addMember($org, $this->ben, 'staff');
        $o->removeMember($org, $this->ben->id);
        $this->assertCount(1, $o->members($org));
        $this->expectException(\Illuminate\Validation\ValidationException::class);
        $o->removeMember($org, $this->anna->id);
    }

    // ── keeping organisers apart ────────────────────────────────────────

    public function test_an_outside_organiser_sees_and_changes_only_their_own_events_and_staff_see_all(): void
    {
        $annaEvent = $this->admin()->store($this->req($this->anna, $this->body(['title' => 'Anna wedding'])))->getData(true);
        $benEvent = $this->admin()->store($this->req($this->ben, $this->body(['title' => 'Ben concert'])))->getData(true);
        $staffEvent = $this->admin()->store($this->req($this->staff, $this->body(['title' => 'TISL conference'])))->getData(true);
        $this->assertSame('Anna Weddings', $annaEvent['organiser_name']);
        $this->assertSame('TISL', $staffEvent['organiser_name']);

        $titles = fn (User $u) => collect($this->admin()->index($this->req($u, [], 'GET'))->getData(true)['data'])->pluck('title')->sort()->values()->all();
        $this->assertSame(['Anna wedding'], $titles($this->anna));
        $this->assertSame(['Ben concert'], $titles($this->ben));
        $this->assertSame(['Anna wedding', 'Ben concert', 'TISL conference'], $titles($this->staff));

        $this->req($this->anna);
        $this->assertSame('Anna wedding', $this->admin()->show($annaEvent['id'])->getData(true)['title']);
        foreach ([$benEvent['id'], $staffEvent['id']] as $other) {
            try {
                $this->req($this->anna);
                $this->admin()->show($other);
                $this->fail("Anna reached event {$other}");
            } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
                $this->assertTrue(true, 'not found: another organiser\'s event is not even confirmed to exist');
            }
        }
        $this->req($this->ben);
        $this->assertSame('Ben concert', $this->admin()->show($benEvent['id'])->getData(true)['title']);
        $this->req($this->staff);
        $this->assertSame('Anna wedding', $this->admin()->show($annaEvent['id'])->getData(true)['title'], 'staff see everything');
    }

    public function test_an_outside_organiser_cannot_choose_tisls_accounts_or_another_owner_or_approve_themselves(): void
    {
        $made = $this->admin()->store($this->req($this->anna, $this->body(['title' => 'Sneaky', 'sales_ledger_id' => 40, 'organiser_id' => 1, 'approval_status' => 'approved', 'location_id' => 3])))->getData(true);
        $e = Event::find($made['id']);
        $this->assertNull($e->sales_ledger_id, 'the money passes through TISL: its accounts are set by TISL');
        $this->assertNull($e->location_id);
        $this->assertSame((int) EventOrganiser::where('name', 'Anna Weddings')->value('id'), (int) $e->organiser_id, 'under her own organiser, whatever was sent');
        $this->assertSame('draft', $e->approval_status, 'never approved by typing it');
    }

    // ── approval ────────────────────────────────────────────────────────

    public function test_an_outside_organisers_event_is_published_only_after_tisl_approves_it(): void
    {
        DB::table('event_settings')->insert(['id' => 1, 'settings' => json_encode(['sales_ledger_id' => 40])]);
        $id = $this->admin()->store($this->req($this->anna, $this->body()))->getData(true)['id'];
        $this->req($this->anna);
        $r = $this->admin()->publish($this->req($this->anna), $id);
        $this->assertSame(422, $r->getStatusCode());
        $this->assertStringContainsString('Send it to TISL for approval', $r->getData(true)['message']);

        $sent = $this->admin()->submit($this->req($this->anna), $id)->getData(true);
        $this->assertSame('pending', $sent['approval_status']);
        $this->assertStringContainsString('has not approved', $this->admin()->publish($this->req($this->anna), $id)->getData(true)['message']);

        $decided = $this->admin()->decide($this->req($this->staff, ['approve' => true]), $id)->getData(true);
        $this->assertSame('approved', $decided['approval_status']);
        $pub = $this->admin()->publish($this->req($this->anna), $id)->getData(true);
        $this->assertSame('published', $pub['status']);
        $this->assertSame(1, Event::public()->count());

        // suspended: it leaves the public list
        app(EventOrganiserService::class)->setStatus(EventOrganiser::where('name', 'Anna Weddings')->first(), 'suspended', 'complaints', $this->staff);
        $this->assertSame(0, Event::public()->count());
    }

    public function test_an_unverified_organiser_cannot_have_an_event_approved_and_staff_events_need_no_approval(): void
    {
        DB::table('event_settings')->insert(['id' => 1, 'settings' => json_encode(['sales_ledger_id' => 40])]);
        $org = app(EventOrganiserService::class)->apply(User::create(['name' => 'Cara', 'email' => 'c@x.test']), ['name' => 'Cara Catering']);
        $cara = User::where('email', 'c@x.test')->first();
        $this->grant($cara, ['events.view', 'events.edit']);
        $id = $this->admin()->store($this->req($cara, $this->body()))->getData(true)['id'];
        $this->admin()->submit($this->req($cara), $id);
        $r = $this->admin()->decide($this->req($this->staff, ['approve' => true]), $id);
        $this->assertSame(422, $r->getStatusCode());
        $this->assertStringContainsString('Verify the organiser first', $r->getData(true)['message']);

        $own = $this->admin()->store($this->req($this->staff, $this->body(['title' => 'TISL own'])))->getData(true);
        $this->assertSame('approved', $own['approval_status']);
        $this->assertSame('published', $this->admin()->publish($this->req($this->staff), $own['id'])->getData(true)['status']);
    }

    // ── what stays with TISL's staff ─────────────────────────────────────

    public function test_cash_at_the_door_refunds_and_the_company_settings_stay_with_tisl_staff(): void
    {
        $this->req($this->anna);
        foreach ([fn () => $this->admin()->settings(), fn () => $this->admin()->saveSettings($this->req($this->anna, ['hold_minutes' => 30]))] as $do) {
            try {
                $do();
                $this->fail('an outside organiser reached the company settings');
            } catch (HttpException $e) {
                $this->assertSame(403, $e->getStatusCode());
            }
        }
        $refunds = new EventRefundController(app(\App\Services\Events\EventRefunds::class));
        try {
            $refunds->decline($this->req($this->anna, ['note' => 'no']), 1);
            $this->fail('an outside organiser decided a refund');
        } catch (HttpException $e) {
            $this->assertSame(403, $e->getStatusCode());
        }
        $this->req($this->staff);
        $this->assertSame(200, $this->admin()->settings()->getStatusCode());
        $this->assertSame(10, $this->admin()->settings()->getData(true)['settings']['commission_percent']);
    }

    public function test_verifying_an_organiser_gives_its_people_the_organiser_role_and_suspending_takes_it_back(): void
    {
        Schema::create('roles', function ($t) { $t->id(); $t->string('key'); });
        Schema::create('user_roles', function ($t) { $t->id(); $t->unsignedBigInteger('user_id'); $t->unsignedBigInteger('role_id'); $t->boolean('is_primary')->default(false); $t->dateTime('starts_at')->nullable(); $t->dateTime('expires_at')->nullable(); $t->timestamps(); });
        DB::table('roles')->insert(['id' => 9, 'key' => 'event_organiser']);
        \App\Services\Access\Authorizer::reset();
        $o = app(EventOrganiserService::class);
        $a = EventOrganiser::where('name', 'Anna Weddings')->first();
        $o->setStatus($a, 'pending', null, $this->staff);
        $o->setStatus($a, 'verified', null, $this->staff);
        $this->assertSame(1, DB::table('user_roles')->where(['user_id' => $this->anna->id, 'role_id' => 9, 'is_primary' => 0])->count(), 'verified: the role is given');
        $this->assertSame(0, DB::table('user_roles')->where('user_id', $this->ben->id)->count(), 'only that organiser\'s own people');
        $o->setStatus($a, 'suspended', 'complaints', $this->staff);
        $this->assertSame(0, DB::table('user_roles')->where('user_id', $this->anna->id)->count(), 'suspended: taken back');
        $o->setStatus($a, 'verified', null, $this->staff);
        $o->addMember($a, $this->ben, 'door');
        $this->assertSame(1, DB::table('user_roles')->where('user_id', $this->ben->id)->count(), 'a person added to a verified organiser gets it too');
        $o->removeMember($a, $this->ben->id);
        $this->assertSame(1, DB::table('user_roles')->where('user_id', $this->ben->id)->count(), 'Ben still belongs to his own verified organiser');
        \App\Services\Access\Authorizer::reset();
    }

    private function ledgerTables(): void
    {
        Schema::create('event_organiser_ledger', function ($t) {
            $t->id(); $t->unsignedBigInteger('organiser_id'); $t->unsignedBigInteger('event_id')->nullable(); $t->unsignedBigInteger('ticket_id')->nullable(); $t->string('kind'); $t->decimal('gross', 14, 2)->default(0);
            $t->decimal('commission_percent', 5, 2)->nullable(); $t->decimal('commission', 14, 2)->default(0); $t->decimal('amount', 14, 2); $t->unsignedBigInteger('voucher_id')->nullable(); $t->string('reference')->nullable();
            $t->string('note')->nullable(); $t->unsignedBigInteger('created_by')->nullable(); $t->timestamps(); $t->unique(['ticket_id', 'kind']);
        });
    }

    private function ticket(int $eventId, string $ref, float $price): \App\Models\Events\EventTicket
    {
        return \App\Models\Events\EventTicket::create(['event_id' => $eventId, 'ticket_type_id' => 1, 'reference' => $ref, 'state' => 'valid', 'price' => $price]);
    }

    public function test_an_outside_organiser_is_owed_the_price_less_commission_and_a_refund_takes_it_back(): void
    {
        $this->ledgerTables();
        $o = app(EventOrganiserService::class);
        $anna = EventOrganiser::where('name', 'Anna Weddings')->first();
        $o->setCommission($anna, 12.5);
        $mine = DB::table('events')->insertGetId(['title' => 'Gala', 'slug' => 'gala', 'organiser_id' => $anna->id, 'sales_ledger_id' => 40]);
        $own = DB::table('events')->insertGetId(['title' => 'TISL day', 'slug' => 'tisl-day', 'organiser_id' => 1, 'sales_ledger_id' => 40]);
        $pay = app(\App\Services\Events\EventPayables::class);

        $t1 = $this->ticket($mine, 'AAA111', 1000);
        $t2 = $this->ticket($mine, 'AAA112', 1000);
        $free = $this->ticket($mine, 'AAA113', 0);
        $tisl = $this->ticket($own, 'BBB111', 500);
        $pay->accrue([$t1, $t2, $free, $tisl]);
        $pay->accrue([$t1]);   // twice changes nothing
        $this->assertSame(1750.0, $pay->balanceOf($anna->id), '2 x 1000 less 12.5%');
        $this->assertSame(0, DB::table('event_organiser_ledger')->where('organiser_id', 1)->count(), 'TISL owes itself nothing');

        $pay->reverse($t1);
        $pay->reverse($t1);
        $this->assertSame(875.0, $pay->balanceOf($anna->id), 'a refund takes back that ticket\'s share, once');
        $b = collect($pay->balances())->firstWhere('organiser_id', $anna->id);
        $this->assertSame([1000.0, 125.0, 0.0, 875.0, 3], [$b['gross'], $b['commission'], $b['paid'], $b['balance'], $b['unposted']], 'nothing could be posted yet: no liability account chosen');
        $this->assertCount(3, $pay->statement($anna->id));

        $this->expectException(\App\Services\Events\EventException::class);
        $pay->payout($anna, 5000, 41, null, null, $this->staff);   // more than is owed
    }

    public function test_what_is_owed_is_booked_as_a_journal_and_a_payout_pays_it_down(): void
    {
        $this->ledgerTables();
        Schema::create('voucher_types', function ($t) { $t->id(); $t->string('base_type'); $t->boolean('is_active')->default(true); $t->timestamps(); });
        DB::table('voucher_types')->insert(['id' => 3, 'base_type' => 'journal']);
        Schema::create('currencies', function ($t) { $t->id(); $t->string('code', 8); $t->boolean('is_base')->default(false); $t->timestamps(); });
        $posted = [];
        $this->mock(\App\Services\Books\VoucherService::class, function ($m) use (&$posted) {
            $m->shouldReceive('create')->andReturnUsing(function ($d) use (&$posted) { $posted[] = $d; $v = new \App\Models\Books\Voucher(); $v->id = 100 + count($posted); $v->voucher_number = 'J-' . count($posted); return $v; });
        });
        $anna = EventOrganiser::where('name', 'Anna Weddings')->first();
        $mine = DB::table('events')->insertGetId(['title' => 'Gala', 'slug' => 'gala', 'organiser_id' => $anna->id, 'sales_ledger_id' => 40]);
        $pay = app(\App\Services\Events\EventPayables::class);
        $pay->accrue([$this->ticket($mine, 'CCC111', 1000)]);
        $this->assertSame([], $posted, 'no liability account chosen yet: kept, not posted');

        \App\Services\Events\EventSettings::save(['organiser_payable_ledger_id' => 41], 5);   // any ledger id stands in for the liability
        $this->assertSame(1, $pay->postWaiting());
        $this->assertSame([40, 'D', 41, 'C', 900.0], [$posted[0]['entries'][0]['ledger_id'], $posted[0]['entries'][0]['side'], $posted[0]['entries'][1]['ledger_id'], $posted[0]['entries'][1]['side'], (float) $posted[0]['entries'][0]['amount']], 'Dr income, Cr owed to organisers, 900 after the 10% default');

        $r = $pay->payout($anna, 400, 41, 'MPESA123', 'first half', $this->staff);
        $this->assertSame(500.0, $r['balance']);
        $this->assertSame('D', $posted[1]['entries'][0]['side']);
        $this->assertSame(0, DB::table('event_organiser_ledger')->whereNull('voucher_id')->count());
    }
}
