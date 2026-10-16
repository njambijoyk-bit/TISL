<?php

namespace Tests\Feature;

use App\Http\Controllers\Admin\NavController;
use App\Models\NavLink;
use App\Services\Licensing\LicenseManager;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Storefront navigation: the shortcut letter an admin sets on a link (script 179) is validated, kept unique, and reaches the public feed. */
class NavLinkShortcutsTest extends TestCase
{
    use Concerns\RunsSqlScripts;

    private NavController $nav;

    protected function setUp(): void
    {
        parent::setUp();
        Schema::create('nav_links', function ($t) {
            $t->id(); $t->string('key'); $t->string('label'); $t->string('path'); $t->string('module_key')->default('core');
            $t->boolean('visible')->default(true); $t->integer('sort_order')->default(0); $t->timestamps();
        });
        $this->runSqlScripts('179_nav_link_shortcuts.sql');
        NavLink::create(['key' => 'shop', 'label' => 'Shop', 'path' => '/shop', 'module_key' => 'core', 'sort_order' => 1]);
        NavLink::create(['key' => 'about', 'label' => 'About', 'path' => '/about', 'module_key' => 'core', 'sort_order' => 2]);
        $this->nav = new NavController($this->createMock(LicenseManager::class));
    }

    private function set(string $key, $shortcut)
    {
        $id = NavLink::where('key', $key)->value('id');

        return $this->nav->update(Request::create('/x', 'PUT', ['shortcut' => $shortcut]), $id);
    }

    public function test_a_letter_is_saved_in_capitals_and_reaches_the_public_feed(): void
    {
        $this->assertSame(200, $this->set('shop', 's')->getStatusCode());
        $this->assertSame('S', NavLink::where('key', 'shop')->value('shortcut'));
        $feed = $this->nav->publicNav()->getData(true)['links'];
        $this->assertSame(['S', null], array_column($feed, 'shortcut'));
    }

    public function test_the_letters_the_app_uses_are_kept_back(): void
    {
        foreach (['a', 'U', 'm', 'N', 'r', 'T'] as $letter) {
            $res = $this->set('shop', $letter);
            $this->assertSame(422, $res->getStatusCode());
            $this->assertNull(NavLink::where('key', 'shop')->value('shortcut'));
        }
    }

    public function test_one_letter_goes_to_one_link_but_the_owner_of_it_may_save_it_again(): void
    {
        $this->set('shop', 'S');
        $this->assertSame(422, $this->set('about', 's')->getStatusCode());
        $this->assertSame(200, $this->set('shop', 's')->getStatusCode());
        $this->assertNull(NavLink::where('key', 'about')->value('shortcut'));
    }

    public function test_a_shortcut_can_be_cleared_and_only_a_single_letter_is_taken(): void
    {
        $this->set('shop', 'S');
        $this->assertSame(200, $this->set('shop', '')->getStatusCode());
        $this->assertNull(NavLink::where('key', 'shop')->value('shortcut'));
        foreach (['ab', '1', '+'] as $bad) {
            $this->expectsValidationFailure(fn () => $this->set('shop', $bad));
        }
    }

    private function expectsValidationFailure(callable $f): void
    {
        try {
            $f();
            $this->fail('a bad shortcut was accepted');
        } catch (\Illuminate\Validation\ValidationException $e) {
            $this->assertArrayHasKey('shortcut', $e->errors());
        }
    }
}
