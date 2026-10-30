<?php

namespace Tests\Feature;

use App\Models\Events\EventVendor;
use App\Models\Events\EventVenue;
use App\Models\User;
use App\Services\Events\EventMarketplace;
use App\Services\Events\EventMedia;
use App\Services\Events\EventOwnerAccess;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/** Vendors and venues (profile, offer, people, verification, directory) and the media gallery (public or private, embeds, one cover). */
class EventMarketplaceTest extends TestCase
{
    use Concerns\CreatesEventTables;
    use Concerns\StandsInForAccess;

    private User $admin;
    private User $caro;
    private User $dan;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createEventTables();
        Storage::fake('public');
        Storage::fake('local');
        Schema::create('users', function ($t) { $t->id(); $t->string('name')->nullable(); $t->string('email')->nullable(); $t->timestamps(); $t->softDeletes(); });
        Schema::table('events', function ($t) { $t->unsignedBigInteger('organiser_id')->nullable(); });
        Schema::create('event_organisers', function ($t) { $t->id(); $t->string('name'); $t->boolean('is_internal')->default(false); $t->timestamps(); });
        Schema::create('event_vendors', function ($t) {
            $t->id(); $t->string('name'); $t->string('slug')->unique(); $t->string('category')->default('other'); $t->string('summary')->nullable(); $t->text('description')->nullable(); $t->string('email')->nullable(); $t->string('phone')->nullable();
            $t->string('website')->nullable(); $t->string('logo')->nullable(); $t->json('service_areas')->nullable(); $t->string('tax_pin')->nullable(); $t->string('registration_no')->nullable(); $t->string('status')->default('pending');
            $t->string('status_note')->nullable(); $t->dateTime('verified_at')->nullable(); $t->unsignedBigInteger('verified_by')->nullable(); $t->decimal('commission_percent', 5, 2)->nullable(); $t->boolean('is_listed')->default(true);
            $t->unsignedBigInteger('created_by')->nullable(); $t->softDeletes(); $t->timestamps();
        });
        Schema::create('event_vendor_packages', function ($t) {
            $t->id(); $t->unsignedBigInteger('vendor_id'); $t->string('name'); $t->text('description')->nullable(); $t->decimal('price', 15, 2)->default(0); $t->string('price_unit')->default('fixed'); $t->unsignedBigInteger('currency_id')->nullable();
            $t->unsignedInteger('min_guests')->nullable(); $t->unsignedInteger('max_guests')->nullable(); $t->json('inclusions')->nullable(); $t->decimal('deposit_percent', 5, 2)->nullable(); $t->text('cancellation_policy')->nullable();
            $t->boolean('is_active')->default(true); $t->integer('sort_order')->default(0); $t->timestamps();
        });
        Schema::create('event_venues', function ($t) {
            $t->id(); $t->string('name'); $t->string('slug')->unique(); $t->string('summary')->nullable(); $t->text('description')->nullable(); $t->string('country')->nullable(); $t->string('county')->nullable(); $t->string('town')->nullable();
            $t->string('address')->nullable(); $t->decimal('latitude', 10, 7)->nullable(); $t->decimal('longitude', 10, 7)->nullable(); $t->string('map_url')->nullable(); $t->text('directions')->nullable(); $t->string('parking')->nullable();
            $t->string('accessibility')->nullable(); $t->json('facilities')->nullable(); $t->string('email')->nullable(); $t->string('phone')->nullable(); $t->string('website')->nullable(); $t->string('tax_pin')->nullable();
            $t->string('registration_no')->nullable(); $t->string('status')->default('pending'); $t->string('status_note')->nullable(); $t->dateTime('verified_at')->nullable(); $t->unsignedBigInteger('verified_by')->nullable();
            $t->decimal('commission_percent', 5, 2)->nullable(); $t->boolean('is_listed')->default(true); $t->unsignedBigInteger('created_by')->nullable(); $t->softDeletes(); $t->timestamps();
        });
        Schema::create('event_venue_spaces', function ($t) {
            $t->id(); $t->unsignedBigInteger('venue_id'); $t->string('name'); $t->text('description')->nullable(); $t->unsignedInteger('capacity')->nullable(); $t->json('layouts')->nullable(); $t->decimal('price', 15, 2)->default(0);
            $t->string('price_unit')->default('per_day'); $t->unsignedBigInteger('currency_id')->nullable(); $t->decimal('deposit_percent', 5, 2)->nullable(); $t->text('cancellation_policy')->nullable(); $t->boolean('is_active')->default(true);
            $t->integer('sort_order')->default(0); $t->timestamps();
        });
        Schema::create('event_provider_members', function ($t) { $t->id(); $t->string('provider_type'); $t->unsignedBigInteger('provider_id'); $t->unsignedBigInteger('user_id'); $t->string('role')->default('staff'); $t->timestamps(); $t->unique(['provider_type', 'provider_id', 'user_id']); });
        Schema::create('event_media', function ($t) {
            $t->id(); $t->string('owner_type'); $t->unsignedBigInteger('owner_id'); $t->string('kind')->default('image'); $t->string('role')->default('gallery'); $t->string('path')->nullable(); $t->string('url')->nullable(); $t->string('title')->nullable();
            $t->string('caption')->nullable(); $t->string('visibility')->default('public'); $t->string('mime')->nullable(); $t->unsignedBigInteger('size_bytes')->nullable(); $t->integer('sort_order')->default(0); $t->unsignedBigInteger('created_by')->nullable(); $t->timestamps();
        });
        foreach ([[5, 'Admin', 'a@x.test'], [6, 'Caro', 'caro@x.test'], [7, 'Dan', 'dan@x.test']] as [$id, $n, $e]) {
            DB::table('users')->insert(['id' => $id, 'name' => $n, 'email' => $e]);
        }
        $this->admin = User::find(5);
        $this->caro = User::find(6);
        $this->dan = User::find(7);
        $this->grant($this->admin, ['events.admin']);
        $this->grant($this->caro, ['events.view']);
        $this->grant($this->dan, ['events.view']);
    }

    protected function tearDown(): void
    {
        foreach (['event_media', 'event_provider_members', 'event_venue_spaces', 'event_venues', 'event_vendor_packages', 'event_vendors', 'event_organisers', 'users'] as $t) {
            Schema::dropIfExists($t);
        }
        parent::tearDown();
    }

    private function market(): EventMarketplace
    {
        return app(EventMarketplace::class);
    }

    public function test_a_vendor_applies_is_pending_until_verified_and_only_then_is_listed(): void
    {
        $v = $this->market()->apply('vendor', $this->caro, ['name' => 'ABC Catering', 'category' => 'caterer', 'summary' => 'Weddings and corporate', 'service_areas' => ['Nairobi', 'Kiambu']]);
        $this->assertSame('pending', $v->status);
        $this->assertSame('owner', $this->market()->memberRole('vendor', $v->id, $this->caro));
        $this->assertSame([], $this->market()->directory('vendor', []), 'not listed until verified');
        $this->market()->setStatus('vendor', $v, 'verified', null, $this->admin);
        $this->assertSame(['ABC Catering'], array_column($this->market()->directory('vendor', []), 'name'));
        $this->assertSame(['ABC Catering'], array_column($this->market()->directory('vendor', ['category' => 'caterer', 'area' => 'kiambu']), 'name'), 'the area is matched any case');
        $this->assertSame([], $this->market()->directory('vendor', ['category' => 'florist']));
        $this->market()->setStatus('vendor', $v, 'suspended', 'complaints', $this->admin);
        $this->assertSame([], $this->market()->directory('vendor', []), 'a suspended vendor leaves the directory');
        try {
            $this->market()->apply('vendor', $this->dan, ['name' => 'X', 'category' => 'spaceship']);
            $this->fail('unknown category');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('category', $e->errors());
        }
    }

    public function test_packages_and_spaces_are_checked_and_commission_follows_the_rules(): void
    {
        $v = $this->market()->apply('vendor', $this->caro, ['name' => 'ABC Catering', 'category' => 'caterer']);
        $pkg = $this->market()->saveOffer('vendor', $v->id, ['name' => 'Wedding lunch', 'price' => 1500, 'price_unit' => 'per_guest', 'deposit_percent' => 30, 'inclusions' => ['Waiters', 'Crockery'], 'min_guests' => 50]);
        $this->assertSame(['Wedding lunch', 'per_guest', ['Waiters', 'Crockery']], [$pkg['name'], $pkg['price_unit'], $pkg['inclusions']]);
        foreach ([['name' => 'X', 'price' => -1], ['name' => 'X', 'price' => 1, 'price_unit' => 'per_century'], ['name' => 'X', 'price' => 1, 'deposit_percent' => 140], ['name' => ' ', 'price' => 1]] as $bad) {
            try {
                $this->market()->saveOffer('vendor', $v->id, $bad);
                $this->fail('a bad package was accepted');
            } catch (ValidationException $e) {
                $this->assertNotEmpty($e->errors());
            }
        }
        $venue = $this->market()->apply('venue', $this->dan, ['name' => 'Garden Hall', 'county' => 'Nairobi']);
        $space = $this->market()->saveOffer('venue', $venue->id, ['name' => 'Main hall', 'capacity' => 300, 'price' => 80000, 'layouts' => ['banquet' => 200, 'theatre' => 300]]);
        $this->assertSame(['per_day', 300, ['banquet' => 200, 'theatre' => 300]], [$space['price_unit'], $space['capacity'], $space['layouts']]);
        $this->market()->setStatus('venue', $venue, 'verified', null, $this->admin);
        $this->assertSame(300, $this->market()->directory('venue', [])[0]['max_capacity']);
        $this->assertSame([], $this->market()->directory('venue', ['min_capacity' => 500]));
        $this->assertCount(1, $this->market()->directory('venue', ['county' => 'Nairobi']));
        $this->assertSame(10.0, $this->market()->commissionFor($v), 'the events default');
        $this->market()->setCommission($v, 12.5);
        $this->assertSame(12.5, $this->market()->commissionFor($v->fresh()));
        $this->market()->removeOffer('vendor', $v->id, $pkg['id']);
        $this->assertSame([], $this->market()->offers('vendor', $v->id, false));
    }

    public function test_only_a_providers_owner_or_manager_or_admin_may_run_it_and_the_last_owner_stays(): void
    {
        $v = $this->market()->apply('vendor', $this->caro, ['name' => 'ABC Catering', 'category' => 'caterer']);
        $m = $this->market();
        $this->assertTrue($m->canManage('vendor', $v->id, $this->caro, false));
        $this->assertFalse($m->canManage('vendor', $v->id, $this->dan, false));
        $this->assertTrue($m->canManage('vendor', $v->id, $this->dan, true), 'the platform admin');
        $m->addMember('vendor', $v->id, $this->dan, 'staff');
        $this->assertFalse($m->canManage('vendor', $v->id, $this->dan, false), 'staff may not change the profile');
        $m->addMember('vendor', $v->id, $this->dan, 'manager');
        $this->assertTrue($m->canManage('vendor', $v->id, $this->dan, false));
        $this->assertSame(1, count(array_filter($m->mine($this->dan))));
        $m->removeMember('vendor', $v->id, $this->dan->id);
        $this->expectException(ValidationException::class);
        $m->removeMember('vendor', $v->id, $this->caro->id);
    }

    // ── media ───────────────────────────────────────────────────────────

    public function test_embeds_only_from_youtube_or_vimeo(): void
    {
        $this->assertSame('https://www.youtube.com/embed/dQw4w9WgXcQ', EventMedia::embedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'));
        $this->assertSame('https://www.youtube.com/embed/dQw4w9WgXcQ', EventMedia::embedUrl('https://youtu.be/dQw4w9WgXcQ'));
        $this->assertSame('https://player.vimeo.com/video/123456789', EventMedia::embedUrl('https://vimeo.com/123456789'));
        $this->assertNull(EventMedia::embedUrl('https://evil.example/watch?v=dQw4w9WgXcQ'));
        $this->assertNull(EventMedia::embedUrl('javascript:alert(1)'));
        $this->expectException(ValidationException::class);
        app(EventMedia::class)->addEmbed('event', 1, 'https://evil.example/x', [], null);
    }

    public function test_public_and_private_files_live_apart_and_there_is_one_cover(): void
    {
        $media = app(EventMedia::class);
        $eid = DB::table('events')->insertGetId(['title' => 'Wedding', 'slug' => 'wedding']);
        $a = $media->addFile('event', $eid, UploadedFile::fake()->image('a.jpg'), ['role' => 'cover', 'title' => 'First'], 5);
        $b = $media->addFile('event', $eid, UploadedFile::fake()->image('b.jpg'), ['role' => 'cover'], 5);
        $this->assertSame('gallery', collect($media->list('event', $eid, true))->firstWhere('id', $a['id'])['role'], 'the old cover steps down');
        $this->assertSame('cover', collect($media->list('event', $eid, true))->firstWhere('id', $b['id'])['role']);
        $this->assertNotNull(DB::table('events')->where('id', $eid)->value('main_image'), 'the cover is the event\'s main picture');
        $plan = $media->addFile('event', $eid, UploadedFile::fake()->create('floor.pdf', 100, 'application/pdf'), ['role' => 'floor_plan', 'visibility' => 'public'], 5);
        $this->assertSame('private', $plan['visibility'], 'a document is never public, whatever was asked');
        $this->assertNull($plan['url'], 'and has no public address');
        $secret = $media->addFile('event', $eid, UploadedFile::fake()->image('c.jpg'), ['visibility' => 'private'], 5);
        $this->assertNull($secret['url']);
        $this->assertCount(4, $media->list('event', $eid, true));
        $this->assertSame([$a['id'], $b['id']], array_column($media->list('event', $eid, false), 'id'), 'a visitor sees only the public items');
        Storage::disk('local')->assertExists(DB::table('event_media')->where('id', $secret['id'])->value('path'));
        Storage::disk('public')->assertMissing(DB::table('event_media')->where('id', $secret['id'])->value('path'));

        $media->update($secret['id'], ['visibility' => 'public']);   // the file moves with it
        $path = DB::table('event_media')->where('id', $secret['id'])->value('path');
        Storage::disk('public')->assertExists($path);
        Storage::disk('local')->assertMissing($path);
        $media->remove($secret['id']);
        Storage::disk('public')->assertMissing($path);

        try {
            $media->addFile('event', $eid, UploadedFile::fake()->create('virus.exe', 10), [], 5);
            $this->fail('an exe was accepted');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('file', $e->errors());
        }
        try {
            $media->addFile('event', $eid, UploadedFile::fake()->image('huge.jpg')->size(9000), [], 5);
            $this->fail('an image over 8 MB was accepted');
        } catch (ValidationException $e) {
            $this->assertStringContainsString('too large', $e->errors()['file'][0]);
        }
        $media->reorder('event', $eid, [$b['id'], $a['id']]);
        $this->assertSame($b['id'], $media->list('event', $eid, true)[0]['id']);
    }

    public function test_who_may_work_on_what_an_owner_holds(): void
    {
        $v = $this->market()->apply('vendor', $this->caro, ['name' => 'ABC Catering', 'category' => 'caterer']);
        $pkg = $this->market()->saveOffer('vendor', $v->id, ['name' => 'Lunch', 'price' => 100]);
        $acc = app(EventOwnerAccess::class);
        $this->assertTrue($acc->canWork($this->caro, 'vendor', $v->id));
        $this->assertTrue($acc->canWork($this->caro, 'package', $pkg['id']), 'a package belongs to its vendor');
        $this->assertFalse($acc->canWork($this->dan, 'vendor', $v->id));
        $this->assertFalse($acc->canWork($this->dan, 'package', $pkg['id']));
        $this->assertTrue($acc->canWork($this->admin, 'vendor', $v->id));
        $this->assertFalse($acc->canWork($this->caro, 'package', 9999), 'a package that is not there');
    }
}
