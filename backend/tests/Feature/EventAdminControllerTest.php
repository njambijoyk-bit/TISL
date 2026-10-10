<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\EventAdminController;
use App\Models\Events\Event;
use App\Services\Events\EventEditor;
use App\Services\Events\EventPresenter;
use App\Services\Events\TicketHolds;
use App\Services\ServiceVideo;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** The staff doors of events: what each returns, what each refuses, and which permission each needs. */
class EventAdminControllerTest extends TestCase
{
    use Concerns\CreatesEventTables;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createEventTables();
        Storage::fake('public');
    }

    private function c(): EventAdminController
    {
        return new EventAdminController(app(EventEditor::class), app(EventPresenter::class), app(ServiceVideo::class));
    }

    private function req(array $data = [], string $method = 'POST', array $files = []): Request
    {
        $r = Request::create('/x', $method, $data, [], $files);
        $r->setUserResolver(fn () => (new \App\Models\User)->forceFill(['id' => 5]));

        return $r;
    }

    private function body(array $o = []): array
    {
        return $o + ['title' => 'Jazz night', 'venue_name' => 'Alliance', 'currency_id' => 1, 'sales_ledger_id' => 40,
            'sessions' => [['key' => 'a', 'starts_at' => now()->addDays(10)->format('Y-m-d H:i:s'), 'label' => 'Saturday']], 'ticket_types' => [['name' => 'General', 'price' => 1000, 'capacity' => 20, 'session_ids' => ['a']]]];
    }

    public function test_create_show_list_publish_and_delete(): void
    {
        $made = $this->c()->store($this->req($this->body()));
        $this->assertSame(201, $made->getStatusCode());
        $id = $made->getData(true)['id'];
        $shown = $this->c()->show($id)->getData(true);
        $this->assertSame(['Jazz night', 'draft', 1], [$shown['title'], $shown['status'], count($shown['sessions'])]);
        $this->assertSame([20, 0, 20], [$shown['ticket_types'][0]['capacity'], $shown['ticket_types'][0]['sold'], $shown['ticket_types'][0]['remaining']]);
        $this->assertSame([], $shown['problems'], 'it can be published');
        $list = $this->c()->index($this->req([], 'GET'))->getData(true)['data'];
        $this->assertSame([$id, 20, 0, false], [$list[0]['id'], $list[0]['capacity'], $list[0]['sold'], $list[0]['over']]);
        $this->assertSame(1, $list[0]['currency_id'], 'the list says which currency its takings are in');
        $pub = $this->c()->publish($this->req(), $id);
        $this->assertSame(['published', 'Published: it is now on sale.'], [$pub->getData(true)['status'], $pub->getData(true)['message']]);
        $this->assertSame(1, count($this->c()->index($this->req(['status' => 'published'], 'GET'))->getData(true)['data']));
        $this->assertSame(0, count($this->c()->index($this->req(['status' => 'draft'], 'GET'))->getData(true)['data']));
        $this->assertSame(200, $this->c()->destroy($id)->getStatusCode());
        $this->assertSame(0, Event::count());
    }

    public function test_a_bad_save_or_publish_is_a_422_with_the_reason(): void
    {
        $bad = $this->c()->store($this->req($this->body(['sales_ledger_id' => 41])));
        $this->assertSame(422, $bad->getStatusCode());
        $this->assertStringContainsString('income account', $bad->getData(true)['message']);
        $id = $this->c()->store($this->req(['title' => 'Bare']))->getData(true)['id'];
        $res = $this->c()->publish($this->req(), $id);
        $this->assertSame(422, $res->getStatusCode());
        $this->assertStringContainsString('at least one date', $res->getData(true)['message']);
        $this->assertSame(['at least one date' => true], ['at least one date' => str_contains(implode(' ', $this->c()->show($id)->getData(true)['problems']), 'at least one date')], 'the editor shows what is missing');
    }

    public function test_an_event_with_tickets_sold_cannot_be_deleted_but_can_be_cancelled(): void
    {
        $id = $this->c()->store($this->req($this->body()))->getData(true)['id'];
        $this->c()->publish($this->req(), $id);
        $e = Event::find($id);
        $holds = app(TicketHolds::class);
        $holds->issue($holds->hold($e, [$e->ticketTypes[0]->id => 2], ['name' => 'B']));
        $del = $this->c()->destroy($id);
        $this->assertSame(422, $del->getStatusCode());
        $this->assertStringContainsString('cancel it instead', $del->getData(true)['message']);
        $this->assertSame(422, $this->c()->unpublish($this->req(), $id)->getStatusCode());
        $row = $this->c()->index($this->req([], 'GET'))->getData(true)['data'][0];
        $this->assertEquals([2, 2000.0], [$row['sold'], $row['revenue']]);
        $this->assertSame('cancelled', $this->c()->cancel($this->req(), $id)->getData(true)['status']);
    }

    public function test_repeating_dates_are_worked_out_for_review(): void
    {
        $r = $this->c()->recurrence($this->req(['start' => '2026-11-07 10:00', 'minutes' => 60, 'repeat' => 'weekly', 'count' => 3]))->getData(true)['dates'];
        $this->assertSame(['2026-11-07 10:00:00', '2026-11-14 10:00:00', '2026-11-21 10:00:00'], array_column($r, 'starts_at'));
        $bad = $this->c()->recurrence($this->req(['start' => '2026-11-07 10:00', 'repeat' => 'weekly']));
        $this->assertSame(422, $bad->getStatusCode(), 'it must say when it stops');
    }

    public function test_the_picture_and_video(): void
    {
        $id = $this->c()->store($this->req($this->body()))->getData(true)['id'];
        $img = $this->c()->image($this->req([], 'POST', ['file' => UploadedFile::fake()->image('a.jpg', 400, 300)]), $id)->getData(true);
        $this->assertStringContainsString('/storage/events/', $img['image_url']);
        $first = Event::find($id)->main_image;
        Storage::disk('public')->assertExists(substr($first, 9));
        $this->c()->image($this->req([], 'POST', ['file' => UploadedFile::fake()->image('b.jpg')]), $id);
        Storage::disk('public')->assertMissing(substr($first, 9));
        $this->c()->removeImage($id);
        $this->assertNull(Event::find($id)->main_image);
        $v = $this->c()->setVideo($this->req(['url' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ']), $id)->getData(true)['video'];
        $this->assertSame('youtube', $v['provider']);
        $this->assertSame($v['provider'], $this->c()->show($id)->getData(true)['video']['provider']);
        $this->c()->setVideo($this->req([], 'POST', ['file' => UploadedFile::fake()->create('t.mp4', 300, 'video/mp4')]), $id);
        $this->assertStringStartsWith('/storage/events/video/', Event::find($id)->video_url);
        $this->c()->removeVideo($id);
        $this->assertNull(Event::find($id)->video_url);
        $this->assertSame(422, $this->c()->setVideo($this->req(), $id)->getStatusCode());
    }

    public function test_settings_are_saved_and_the_account_must_be_income(): void
    {
        $ok = $this->c()->saveSettings($this->req(['hold_minutes' => 20, 'sales_ledger_id' => 40], 'PUT'))->getData(true);
        $this->assertSame([20, 40], [$ok['settings']['hold_minutes'], $ok['settings']['sales_ledger_id']]);
        $this->assertSame(20, $this->c()->settings()->getData(true)['settings']['hold_minutes']);
        $this->assertSame(422, $this->c()->saveSettings($this->req(['sales_ledger_id' => 41], 'PUT'))->getStatusCode());
        $this->assertSame(422, $this->c()->saveSettings($this->req(['hold_minutes' => 1], 'PUT'))->getStatusCode());
    }

    public function test_every_route_needs_a_permission_and_the_events_module(): void
    {
        $seen = 0;
        foreach (Route::getRoutes()->getRoutes() as $r) {
            if (! str_starts_with($r->uri(), 'api/admin/events')) {
                continue;
            }
            $seen++;
            $mw = $r->gatherMiddleware();
            $perms = array_values(array_filter($mw, fn ($m) => is_string($m) && str_starts_with($m, 'permission:events.')));
            $this->assertCount(1, $perms, $r->uri() . ' needs an events permission');
            $this->assertContains('module:events', $mw, $r->uri());
            $uri = $r->uri();
            $need = match (true) {
                (bool) preg_match('#/refunds|/tickets/\{ticketId\}/refund#', $uri) => 'permission:events.refund',   // deciding ticket refunds
                (bool) preg_match('#/(door|guests)$#', $uri) => 'permission:events.checkin,events.view',   // the door and the guest list: door staff or whoever may view
                str_ends_with($uri, '/guests/export') => 'permission:events.view',
                (bool) preg_match('#/checkin#', $uri) => 'permission:events.checkin',   // scanning, letting in by hand, undoing
                $r->methods()[0] === 'GET' => 'permission:events.view',
                str_ends_with($uri, '{id}') && $r->methods()[0] === 'DELETE' => 'permission:events.delete',
                default => 'permission:events.edit',
            };
            $this->assertSame($need, $perms[0], $r->methods()[0] . ' ' . $uri);
        }
        $this->assertGreaterThanOrEqual(26, $seen);
    }
}
