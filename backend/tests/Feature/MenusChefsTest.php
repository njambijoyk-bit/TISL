<?php

namespace Tests\Feature;

use App\Models\Menus\Chef;
use App\Models\Menus\ChefCert;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Menus\ChefNotices;
use App\Services\Menus\ChefService;
use App\Services\Menus\DishService;
use App\Services\Menus\MenuService;
use App\Services\Menus\PublicMenu;
use App\Services\Notify\Notifier;
use App\Services\Notify\Staff;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Menus step 8: chefs. Their profile, certificates that are warned about before they run out, who is on duty, and the dishes they are credited for. */
class MenusChefsTest extends TestCase
{
    use Concerns\CreatesCounterWorld;

    private array $warned = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->createCounterWorld();
        if (! Schema::hasTable('users')) {
            Schema::create('users', function ($t) { $t->id(); $t->string('name'); $t->string('email')->nullable(); $t->softDeletes(); $t->timestamps(); });
        }
        Schema::create('menus_chefs', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->unique(); $t->string('display_name', 80); $t->string('title', 80)->nullable(); $t->text('bio')->nullable(); $t->string('photo')->nullable(); $t->json('station_ids')->nullable(); $t->boolean('is_instructor')->default(false); $t->boolean('is_public')->default(false); $t->boolean('is_active')->default(true); $t->integer('sort_order')->default(0); $t->timestamps(); });
        Schema::create('menus_chef_certs', function ($t) { $t->id(); $t->unsignedBigInteger('chef_id'); $t->string('kind', 20)->default('food_handler'); $t->string('name', 120); $t->string('number', 60)->nullable(); $t->date('issued_on')->nullable(); $t->date('expires_on')->nullable(); $t->dateTime('warned_at')->nullable(); $t->dateTime('expired_told_at')->nullable(); $t->string('notes')->nullable(); $t->timestamps(); });
        Schema::table('menus_dishes', fn ($t) => $t->unsignedBigInteger('chef_id')->nullable());
        Schema::create('attendance_days', function ($t) { $t->id(); $t->unsignedBigInteger('user_id'); $t->date('work_date'); $t->dateTime('sign_in_at')->nullable(); $t->dateTime('sign_out_at')->nullable(); });
        $n = $this->createMock(ChefNotices::class);
        $n->method('certificate')->willReturnCallback(function (Chef $c, ChefCert $x, string $stage) { $this->warned[] = [$c->display_name, $x->name, $stage]; });
        $this->app->instance(ChefNotices::class, $n);
    }

    private function chefs(): ChefService
    {
        return app(ChefService::class);
    }

    private function user(string $name, ?string $email = null): User
    {
        return User::forceCreate(['name' => $name, 'email' => $email ?? strtolower(str_replace(' ', '.', $name)).'@example.com']);
    }

    private function chef(string $name = 'Wanjiru Kamau', array $o = []): Chef
    {
        return $this->chefs()->save($o + ['user_id' => $this->user($name)->id]);
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

    // ------------------------------------------------------------ the profile

    public function test_staff_are_found_by_name_or_email_and_a_chef_is_not_offered_twice(): void
    {
        $a = $this->user('Wanjiru Kamau');
        $this->user('Baraka Otieno', 'chef.baraka@example.com');
        $this->assertSame([], $this->chefs()->candidates('w'), 'at least two letters');
        $this->assertSame(['Wanjiru Kamau'], array_column($this->chefs()->candidates('wanji'), 'name'));
        $this->assertSame(['Baraka Otieno'], array_column($this->chefs()->candidates('chef.bar'), 'name'));
        $this->chefs()->save(['user_id' => $a->id]);
        $this->assertSame([], $this->chefs()->candidates('wanji'));
    }

    public function test_a_chef_is_a_member_of_staff_with_a_name_to_show(): void
    {
        $this->fails(fn () => $this->chefs()->save(['display_name' => 'Chef X']), 'Choose the member of staff');
        $u = $this->user('Wanjiru Kamau');
        $c = $this->chefs()->save(['user_id' => $u->id, 'title' => ' Head chef ', 'bio' => '', 'is_public' => true]);
        $this->assertSame(['Wanjiru Kamau', 'Head chef', null, true], [$c->display_name, $c->title, $c->bio, $c->is_public], 'the staff name is the default; blanks become nothing');
        $this->fails(fn () => $this->chefs()->save(['user_id' => $u->id]), 'is a chef already');
        $c = $this->chefs()->save(['display_name' => 'Chef Wanjiru', 'is_instructor' => true], $c->id);
        $this->assertSame([$u->id, 'Chef Wanjiru', true], [$c->user_id, $c->display_name, $c->is_instructor]);
        $this->fails(fn () => $this->chefs()->save(['bio' => str_repeat('x', 2001)], $c->id), 'too long');
    }

    public function test_the_stations_a_chef_works_must_exist_and_a_chef_who_is_off_is_not_shown(): void
    {
        $stations = DB::table('menus_stations')->pluck('id')->all();
        $c = $this->chef('Wanjiru Kamau', ['is_public' => true, 'station_ids' => [$stations[0], $stations[0]]]);
        $this->assertSame([$stations[0]], $c->station_ids);
        $this->fails(fn () => $this->chefs()->save(['station_ids' => [999]], $c->id), 'stations does not exist');
        $this->assertFalse($this->chefs()->save(['is_active' => false], $c->id)->is_public, 'a chef who is switched off is taken off the public page');
    }

    // ------------------------------------------------------------ certificates

    public function test_a_certificate_has_a_kind_a_name_and_dates_that_make_sense(): void
    {
        $c = $this->chef();
        $this->fails(fn () => $this->chefs()->saveCert($c, ['kind' => 'driving']), 'kind of certificate');
        $this->fails(fn () => $this->chefs()->saveCert($c, ['kind' => 'medical', 'issued_on' => '2026-05-01', 'expires_on' => '2026-04-01']), 'runs out before it was issued');
        $x = $this->chefs()->saveCert($c, ['kind' => 'food_handler', 'number' => ' FH-12 ', 'expires_on' => '2027-01-31']);
        $this->assertSame(['Food handler', 'FH-12', '2027-01-31'], [$x->name, $x->number, $x->expires_on->toDateString()]);
        $this->chefs()->deleteCert($c, $x->id);
        $this->assertSame(0, ChefCert::count());
        $other = $this->chef('Baraka Otieno');
        $y = $this->chefs()->saveCert($other, ['name' => 'HACCP']);
        $this->expectException(\Illuminate\Database\Eloquent\ModelNotFoundException::class);
        $this->chefs()->deleteCert($c, $y->id);
    }

    public function test_a_certificate_is_valid_expiring_expired_or_never_runs_out(): void
    {
        $c = $this->chef();
        $today = Carbon::parse('2026-10-12');
        $s = fn (?string $d) => $this->chefs()->saveCert($c, ['name' => 'X'.random_int(1, 99999), 'expires_on' => $d])->standing($today);
        $this->assertSame(['none', 'valid', 'expiring', 'expiring', 'expiring', 'expired'], [$s(null), $s('2026-11-12'), $s('2026-11-11'), $s('2026-10-12'), $s('2026-10-20'), $s('2026-10-11')],
            '30 days ahead is already "running out"; today is the last day it is good; yesterday it was not');
    }

    public function test_warnings_go_once_each_and_start_again_when_the_certificate_is_renewed(): void
    {
        $c = $this->chef('Wanjiru Kamau');
        $soon = $this->chefs()->saveCert($c, ['name' => 'Food handler', 'expires_on' => '2026-10-30']);
        $this->chefs()->saveCert($c, ['name' => 'First aid', 'expires_on' => '2027-06-01']);
        $this->chefs()->saveCert($c, ['name' => 'Never', 'expires_on' => null]);
        $today = Carbon::parse('2026-10-12');
        $this->assertSame(['warned' => 1, 'expired' => 0], $this->chefs()->sweepCerts($today));
        $this->assertSame(['warned' => 0, 'expired' => 0], $this->chefs()->sweepCerts($today), 'the same warning is not sent twice');
        $this->assertSame([['Wanjiru Kamau', 'Food handler', 'expiring']], $this->warned);
        $this->assertSame(['warned' => 0, 'expired' => 1], $this->chefs()->sweepCerts(Carbon::parse('2026-10-31')), 'then it says it has run out');
        $this->assertSame(['warned' => 0, 'expired' => 0], $this->chefs()->sweepCerts(Carbon::parse('2026-11-02')));
        $this->chefs()->saveCert($c, ['expires_on' => '2026-11-20'], $soon->id);
        $this->assertSame(['warned' => 1, 'expired' => 0], $this->chefs()->sweepCerts(Carbon::parse('2026-11-05')), 'a new date starts the warnings again');
        $this->assertSame(['expiring', 'expired', 'expiring'], array_column($this->warned, 2));
    }

    public function test_a_chef_who_is_switched_off_is_not_warned_about(): void
    {
        $c = $this->chef();
        $this->chefs()->saveCert($c, ['name' => 'Food handler', 'expires_on' => '2026-10-20']);
        $this->chefs()->save(['is_active' => false], $c->id);
        $this->assertSame(['warned' => 0, 'expired' => 0], $this->chefs()->sweepCerts(Carbon::parse('2026-10-12')));
    }

    public function test_the_chef_and_the_kitchen_managers_are_told(): void
    {
        $sent = [];
        $notifier = $this->createMock(Notifier::class);
        $notifier->method('send')->willReturnCallback(function ($to, $type, $title, $message) use (&$sent) { $sent[] = [$to->id, $type, $title]; return []; });
        $manager = $this->user('Manager');
        $staff = $this->createMock(Staff::class);
        $staff->method('holding')->willReturn(collect([$manager]));
        $c = $this->chef('Wanjiru Kamau', ['display_name' => 'Chef Wanjiru']);
        $cert = $this->chefs()->saveCert($c, ['name' => 'Food handler', 'expires_on' => '2026-10-20']);
        (new ChefNotices($notifier, $staff))->certificate($c->load('user'), $cert, 'expiring');
        $this->assertEqualsCanonicalizing([[$manager->id, 'menu_cert_expiring', "Chef Wanjiru's Food handler runs out on 20 Oct 2026"], [$c->user_id, 'menu_cert_expiring', "Chef Wanjiru's Food handler runs out on 20 Oct 2026"]], $sent);
        $sent = [];
        (new ChefNotices($notifier, $staff))->certificate($c, $cert->fresh(), 'expired');
        $this->assertStringContainsString('has run out', $sent[0][2]);
        $boom = $this->createMock(Notifier::class);
        $boom->method('send')->willThrowException(new \RuntimeException('down'));
        (new ChefNotices($boom, $staff))->certificate($c, $cert, 'expired');
        $this->assertTrue(true, 'a problem telling someone is never raised');
    }

    // ------------------------------------------------------------ who is on duty

    public function test_the_roster_shows_who_is_on_duty_their_stations_and_what_needs_attention(): void
    {
        $station = DB::table('menus_stations')->value('id');
        $a = $this->chef('Wanjiru Kamau', ['station_ids' => [$station]]);
        $b = $this->chef('Baraka Otieno');
        $this->chefs()->saveCert($a, ['name' => 'Food handler', 'expires_on' => '2026-10-20']);
        $this->chefs()->saveCert($a, ['name' => 'First aid', 'expires_on' => '2027-10-20']);
        $this->chefs()->saveCert($b, ['name' => 'Medical', 'expires_on' => '2026-09-01']);
        DB::table('attendance_days')->insert([['user_id' => $a->user_id, 'work_date' => '2026-10-12', 'sign_in_at' => '2026-10-12 07:00:00', 'sign_out_at' => null], ['user_id' => $b->user_id, 'work_date' => '2026-10-12', 'sign_in_at' => '2026-10-12 07:00:00', 'sign_out_at' => '2026-10-12 11:00:00'],
            ['user_id' => $b->user_id, 'work_date' => '2026-10-11', 'sign_in_at' => '2026-10-11 07:00:00', 'sign_out_at' => null]]);
        $r = collect($this->chefs()->roster(Carbon::parse('2026-10-12')))->keyBy('display_name');
        $this->assertSame([true, false], [$r['Wanjiru Kamau']['on_duty'], $r['Baraka Otieno']['on_duty']], 'signed in and not out today; yesterday does not count');
        $this->assertSame([['Kitchen'], 1, 1], [$r['Wanjiru Kamau']['stations'], $r['Wanjiru Kamau']['attention'], $r['Baraka Otieno']['attention']]);
        $this->assertSame(['expiring', 8], [$r['Wanjiru Kamau']['certs'][0]['standing'], $r['Wanjiru Kamau']['certs'][0]['days_left']]);
        $this->assertSame('expired', $r['Baraka Otieno']['certs'][0]['standing']);
    }

    // ------------------------------------------------------------ guests and dishes

    public function test_guests_see_only_chefs_who_are_public_and_active(): void
    {
        $this->chef('Wanjiru Kamau', ['display_name' => 'Chef Wanjiru', 'is_public' => true, 'title' => 'Head chef', 'bio' => 'Loves smoke.', 'sort_order' => 1]);
        $this->chef('Baraka Otieno', ['is_public' => false]);
        $off = $this->chef('Amina Said', ['is_public' => true]);
        $this->chefs()->save(['is_active' => false], $off->id);
        $list = $this->chefs()->publicList();
        $this->assertSame(['Chef Wanjiru'], array_column($list, 'name'));
        $this->assertSame(['Head chef', 'Loves smoke.'], [$list[0]['title'], $list[0]['bio']]);
        $this->assertArrayNotHasKey('user_id', $list[0]);
        $this->assertArrayNotHasKey('certs', $list[0], 'certificates are for the staff, not the page');
    }

    public function test_a_dish_can_be_credited_to_a_chef_and_the_menu_names_them_only_when_they_are_shown(): void
    {
        $c = $this->chef('Wanjiru Kamau', ['display_name' => 'Chef Wanjiru', 'is_public' => true]);
        $d = $this->make('Steak', 900);
        $this->stockDish($d, 5);
        app(MenuService::class)->save(['name' => 'All day', 'sections' => [['name' => 'Mains', 'dishes' => [$d->id]]]]);
        $this->fails(fn () => app(DishService::class)->save(['name' => 'Steak', 'chef_id' => 999], $d->id), 'chef does not exist');
        app(DishService::class)->save(['name' => 'Steak', 'chef_id' => $c->id], $d->id);
        $dish = fn () => app(PublicMenu::class)->build($this->now, self::BRANCH)['menus'][0]['sections'][0]['dishes'][0];
        $this->assertSame('Chef Wanjiru', $dish()['chef']);
        $this->chefs()->save(['is_public' => false], $c->id);
        $this->assertNull($dish()['chef'], 'a chef who is not shown is not named on the menu');
        $this->chefs()->save(['is_active' => false], $c->id);
        $this->fails(fn () => app(DishService::class)->save(['name' => 'Steak', 'chef_id' => $c->id], $d->id), 'switched off');
        $this->assertSame(['Steak'], $this->chefs()->save(['is_active' => true, 'is_public' => true], $c->id) ? $this->chefs()->publicList()[0]['dishes'] : []);
    }

    public function test_removing_a_chef_removes_their_certificates_and_the_credit_on_their_dishes(): void
    {
        $c = $this->chef();
        $this->chefs()->saveCert($c, ['name' => 'Food handler']);
        $d = $this->make('Steak', 900);
        app(DishService::class)->save(['name' => 'Steak', 'chef_id' => $c->id], $d->id);
        $this->chefs()->delete($c);
        $this->assertSame([0, 0, null], [Chef::count(), ChefCert::count(), $d->fresh()->chef_id]);
    }
}
