<?php

namespace Tests\Feature;

use App\Http\Controllers\Admin\LocationController;
use App\Models\Location;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/** "What is it?" on a branch is a text box (up to 20 letters) with suggestions that follow the modules that are on; a kind only fills in the four switches. */
class LocationKindTest extends TestCase
{
    use Concerns\CreatesSecurityTables;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createSecurityTables();   // (the users table)
        Schema::create('locations', function ($t) {
            $t->id(); $t->string('name'); $t->string('code')->unique(); $t->unsignedBigInteger('cost_centre_id')->nullable(); $t->unsignedBigInteger('currency_id')->nullable(); $t->unsignedBigInteger('tax_district_id')->nullable();
            $t->string('phone')->nullable(); $t->string('email')->nullable(); $t->string('address_line1')->nullable(); $t->string('address_line2')->nullable(); $t->string('city')->nullable(); $t->string('state')->nullable(); $t->string('country')->nullable();
            $t->string('postal_code')->nullable(); $t->decimal('latitude', 10, 7)->nullable(); $t->decimal('longitude', 10, 7)->nullable(); $t->string('timezone')->nullable(); $t->json('opening_hours')->nullable();
            $t->string('price_display_default')->nullable(); $t->boolean('accepts_pickup')->default(true); $t->boolean('accepts_delivery')->default(true); $t->json('delivery_zone')->nullable();
            $t->boolean('is_default')->default(false); $t->boolean('is_active')->default(true); $t->integer('sort_order')->default(0);
            $t->string('kind', 20)->default('shop'); $t->boolean('sells_to_customers')->default(true); $t->boolean('fulfils_orders')->default(true); $t->boolean('receives_purchases')->default(true); $t->boolean('produces')->default(false); $t->timestamps();
        });
        Schema::create('location_user', function ($t) { $t->id(); $t->unsignedBigInteger('location_id'); $t->unsignedBigInteger('user_id'); $t->string('role_scope')->nullable(); $t->timestamps(); });
        Schema::create('currencies', function ($t) { $t->id(); $t->string('code'); $t->string('name')->nullable(); $t->string('symbol')->nullable(); $t->boolean('is_base')->default(false); $t->boolean('is_active')->default(true); });
        Schema::create('tax_districts', function ($t) { $t->id(); $t->string('name'); $t->string('level')->nullable(); $t->string('locale')->nullable(); $t->boolean('is_active')->default(true); });
        Location::forgetCapabilities();
    }

    private function create(array $o): \Illuminate\Http\JsonResponse
    {
        $request = Request::create('/x', 'POST', $o + ['name' => 'Westlands', 'code' => 'WL'.random_int(100, 999)]);

        return app(LocationController::class)->store($request);
    }

    public function test_the_kind_is_a_text_box_and_anything_up_to_twenty_letters_is_taken(): void
    {
        $res = $this->create(['kind' => 'Pop-up stall']);
        $this->assertSame(201, $res->status());
        $this->assertSame('Pop-up stall', Location::first()->kind);
        $this->assertTrue(Location::first()->receives_purchases, 'an unknown kind starts with the "other" switches');
        $this->assertFalse(Location::first()->sells_to_customers);
    }

    public function test_it_is_compulsory_and_cannot_be_longer_than_the_column(): void
    {
        foreach ([[], ['kind' => ''], ['kind' => '   '], ['kind' => str_repeat('a', 21)]] as $bad) {
            try {
                $this->create($bad);
                $this->fail('should have been refused: '.json_encode($bad));
            } catch (ValidationException $e) {
                $this->assertArrayHasKey('kind', $e->errors());
            }
        }
        $this->assertSame(201, $this->create(['kind' => str_repeat('a', 20)])->status());
    }

    public function test_typed_text_is_tidied_and_a_known_kind_gets_its_defaults_whatever_the_capitals(): void
    {
        $this->create(['kind' => '  Central   Kitchen ']);
        $this->assertSame('Central Kitchen', Location::first()->kind);
        $this->create(['kind' => '  RESTAURANT ']);
        $r = Location::where('kind', 'RESTAURANT')->first();
        $this->assertSame([true, true, true, true], [$r->sells_to_customers, $r->fulfils_orders, $r->receives_purchases, $r->produces], 'a restaurant sells and cooks');
        $this->assertSame(Location::KIND_SUGGESTIONS['kitchen']['defaults'], Location::defaultsFor('KITCHEN'));
        $this->assertSame(Location::KIND_SUGGESTIONS['other']['defaults'], Location::defaultsFor('whatever'));
        $this->assertSame(Location::KIND_SUGGESTIONS['other']['defaults'], Location::defaultsFor(null));
    }

    public function test_what_the_form_sends_wins_over_the_defaults(): void
    {
        $this->create(['kind' => 'restaurant', 'produces' => false, 'sells_to_customers' => false]);
        $l = Location::first();
        $this->assertSame([false, false], [$l->produces, $l->sells_to_customers]);
        $this->assertTrue($l->fulfils_orders);
    }

    public function test_suggestions_follow_the_modules_that_are_on(): void
    {
        $kinds = fn (array $on) => array_column(Location::suggestions(fn ($m) => in_array($m, $on, true)), 'kind');
        $off = $kinds([]);
        $this->assertSame(['shop', 'warehouse', 'depot', 'office', 'factory', 'other'], $off);
        $menus = $kinds(['menus']);
        $this->assertSame(['restaurant', 'cafe', 'bakery', 'bar', 'kitchen', 'food truck'], array_values(array_diff($menus, $off)));
        $this->assertNotContains('venue', $menus);
        $this->assertContains('venue', $kinds(['events']));
        $this->assertContains('property', $kinds(['accommodations']));
        foreach (Location::KIND_SUGGESTIONS as $kind => $s) {
            $this->assertLessThanOrEqual(Location::KIND_MAX, mb_strlen($kind), $kind);
            $this->assertSame(Location::CAPABILITIES, array_keys($s['defaults']), $kind);
        }
    }

    public function test_the_form_options_hand_the_page_the_suggestions_for_the_modules_that_are_on(): void
    {
        $data = app(LocationController::class)->formOptions()->getData(true);
        $kinds = array_column($data['kind_suggestions'], 'kind');
        $this->assertContains('shop', $kinds);
        $this->assertNotContains('restaurant', $kinds, 'the Menus module is not on, so its kinds are not offered');
        $this->assertSame(20, $data['kind_max']);
    }

    public function test_an_edit_that_leaves_the_box_empty_keeps_the_kind(): void
    {
        $this->create(['kind' => 'bakery']);
        $res = app(LocationController::class)->update(Request::create('/x', 'PUT', ['name' => 'Westlands 2', 'code' => Location::first()->code, 'kind' => '']), Location::first()->id);
        $this->assertSame(200, $res->status());
        $this->assertSame(['Westlands 2', 'bakery'], [Location::first()->name, Location::first()->kind]);
    }
}
