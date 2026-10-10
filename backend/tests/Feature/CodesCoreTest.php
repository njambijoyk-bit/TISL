<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\CodeController;
use App\Models\User;
use App\Services\Access\Authorizer;
use App\Services\Access\Decision;
use App\Services\Codes\CodeException;
use App\Services\Codes\CodeFactory;
use App\Services\Codes\CodeResolvers;
use App\Services\Codes\Signed;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/** Core Codes: signed codes only we can make, what each type means, the public and staff doors, and the picture endpoint. */
class CodesCoreTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['app.key' => 'base64:' . base64_encode(str_repeat('k', 32)), 'app.frontend_url' => 'https://shop.example.com']);
    }

    // ------------------------------------------------------------ signed codes

    public function test_a_signed_code_checks_out_and_is_the_same_every_time(): void
    {
        $code = Signed::make('tk', 4821);
        $this->assertMatchesRegularExpression('/^tk\.4821\.[0-9A-HJKMNP-TV-Z]{13}$/', $code);
        $this->assertSame($code, Signed::make('tk', '4821'));
        $this->assertSame(['type' => 'tk', 'id' => '4821'], Signed::verify($code));
        $this->assertSame(['type' => 'tk', 'id' => '4821'], Signed::verify($code, 'tk'));
    }

    public function test_it_is_found_inside_an_address_and_does_not_care_about_case_or_dashes(): void
    {
        $code = Signed::make('tk', 77);
        $this->assertSame(['type' => 'tk', 'id' => '77'], Signed::verify(Signed::url('tk', 77)));
        $this->assertSame('https://shop.example.com/q/' . $code, Signed::url('tk', 77));
        $this->assertSame(['type' => 'tk', 'id' => '77'], Signed::verify(Signed::url('tk', 77) . '?utm=x#top'));
        $this->assertSame(['type' => 'tk', 'id' => '77'], Signed::verify('  ' . strtolower($code) . ' '));
        [$t, $i, $s] = explode('.', $code);
        $this->assertSame(['type' => 'tk', 'id' => '77'], Signed::verify($t . '.' . $i . '.' . substr($s, 0, 4) . '-' . substr($s, 4, 4) . '-' . substr($s, 8)), 'typed in groups');
    }

    public function test_a_changed_code_is_not_ours(): void
    {
        $code = Signed::make('tk', 4821);
        foreach ([str_replace('.4821.', '.4822.', $code), substr($code, 0, -1) . ($code[-1] === 'A' ? 'B' : 'A'), 'gv' . substr($code, 2), 'tk.4821.', 'tk.4821', '', 'garbage', 'tk.4821.AAAAAAAAAAAAA',
            'tk.48 21.' . explode('.', $code)[2], str_repeat('x', 400)] as $bad) {
            $this->assertNull(Signed::verify($bad), $bad);
        }
    }

    public function test_a_code_for_one_purpose_never_passes_as_another(): void
    {
        $ticket = Signed::make('tk', 9);
        $this->assertNull(Signed::verify($ticket, 'gv'), 'asked for a gift voucher code');
        [, $id, $sig] = explode('.', $ticket);
        $this->assertNull(Signed::verify("gv.{$id}.{$sig}"), 'a ticket signature on a gift-voucher label');
        $this->assertNotSame(explode('.', Signed::make('gv', 9))[2], $sig, 'each type has its own key');
    }

    public function test_changing_the_app_key_invalidates_every_code(): void
    {
        $code = Signed::make('tk', 5);
        config(['app.key' => 'base64:' . base64_encode(str_repeat('z', 32))]);
        $this->assertNull(Signed::verify($code));
    }

    public function test_only_sensible_types_and_ids_are_signed(): void
    {
        foreach ([['TK', 1], ['t k', 1], ['', 1], ['abcdefghi', 1], ['tk', ''], ['tk', 'a.b'], ['tk', str_repeat('1', 25)]] as [$t, $i]) {
            try {
                Signed::make($t, $i);
                $this->fail("{$t}/{$i} should be refused");
            } catch (CodeException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    // ------------------------------------------------------------ what a code means

    private function resolvers(?callable $scan = null, ?string $permission = 'events.checkin'): CodeResolvers
    {
        $r = new CodeResolvers;
        $r->register('tk', 'Event ticket', fn ($id) => "/tickets/{$id}", $scan ?? fn ($id, $by, $ctx) => ['ticket' => $id, 'by' => $by->id, 'ctx' => $ctx], $permission);
        $r->register('tb', 'Table card', fn ($id) => "/menu/table/{$id}");   // customers only
        $this->app->instance(CodeResolvers::class, $r);

        return $r;
    }

    private function allow(bool $yes, ?array &$asked = null): void
    {
        $this->app->instance(Authorizer::class, new class($yes, $asked) extends Authorizer {
            public function __construct(private bool $yes, private ?array &$asked)
            {
            }

            public function allows(User $u, string $permission, array $ctx = []): bool
            {
                $this->asked[] = $permission;

                return $this->yes;
            }
        });
    }

    public function test_only_registered_genuine_codes_are_identified(): void
    {
        $r = $this->resolvers();
        $this->assertSame(['type' => 'tk', 'id' => '12', 'label' => 'Event ticket'], $r->identify(Signed::make('tk', 12)));
        $this->assertNull($r->identify(Signed::make('zz', 12)), 'genuine, but nothing registered for it');
        $this->assertNull($r->identify('tk.12.AAAAAAAAAAAAA'));
        $this->assertSame('/tickets/12', $r->publicPath(Signed::url('tk', 12)));
        $this->assertNull($r->publicPath('nonsense'));
        $this->assertSame(['tk' => 'Event ticket', 'tb' => 'Table card'], $r->types());
    }

    public function test_staff_scanning_needs_the_types_permission_and_runs_the_types_action(): void
    {
        $r = $this->resolvers();
        $user = (new User)->forceFill(['id' => 5]);
        $asked = [];
        $this->allow(true, $asked);
        $out = $r->scan(Signed::make('tk', 12), $user, ['event' => 3]);
        $this->assertSame(['tk', '12', ['ticket' => '12', 'by' => 5, 'ctx' => ['event' => 3]]], [$out['type'], $out['id'], $out['result']]);
        $this->assertSame(['events.checkin'], $asked);

        $this->allow(false);
        $this->expectException(CodeException::class);
        $this->expectExceptionMessage('not allowed');
        $r->scan(Signed::make('tk', 12), $user);
    }

    public function test_scanning_refuses_forgeries_and_types_with_no_staff_action(): void
    {
        $r = $this->resolvers();
        $user = (new User)->forceFill(['id' => 5]);
        $this->allow(true);
        foreach ([fn () => $r->scan('tk.12.AAAAAAAAAAAAA', $user), fn () => $r->scan(Signed::make('tb', 3), $user), fn () => $r->scan('hello', $user)] as $f) {
            try {
                $f();
                $this->fail('Expected a refusal');
            } catch (CodeException $e) {
                $this->assertNotSame('', $e->getMessage());
            }
        }
    }

    // ------------------------------------------------------------ the doors

    public function test_the_public_door_sends_a_customers_phone_to_the_right_page(): void
    {
        $this->resolvers();
        $this->getJson('/api/q/' . Signed::make('tk', 12))->assertOk()->assertJson(['type' => 'tk', 'path' => '/tickets/12']);
        $this->getJson('/api/q/' . urlencode(Signed::url('tk', 12)))->assertOk()->assertJson(['path' => '/tickets/12']);
        $this->getJson('/api/q/tk.12.AAAAAAAAAAAAA')->assertNotFound();
        $this->getJson('/api/q/' . Signed::make('zz', 1))->assertNotFound();
    }

    public function test_the_staff_doors_need_a_permission_or_say_who_checks(): void
    {
        $by = [];
        foreach (Route::getRoutes()->getRoutes() as $r) {
            if (str_starts_with($r->uri(), 'api/admin/codes')) {
                $by[$r->uri()] = array_values(array_filter($r->gatherMiddleware(), fn ($m) => is_string($m) && str_starts_with($m, 'permission:')));
            }
        }
        $this->assertSame(['permission:admin.access', 'permission:codes.view,codes.print'], $by['api/admin/codes/image']);
        $this->assertSame(['permission:admin.access', 'permission:codes.view,codes.print'], $by['api/admin/codes/kinds']);
        $this->assertSame(['permission:admin.access'], $by['api/admin/codes/scan'], 'the code type names the real permission');
    }

    private function controller(): CodeController
    {
        return new CodeController(app(CodeResolvers::class));
    }

    public function test_the_scan_door_answers_with_the_result_or_a_plain_reason(): void
    {
        $this->resolvers();
        $this->allow(true);
        $req = Request::create('/x', 'POST', ['code' => Signed::make('tk', 12), 'context' => ['event' => 3]]);
        $req->setUserResolver(fn () => (new User)->forceFill(['id' => 5]));
        $ok = $this->controller()->scan($req);
        $this->assertSame(200, $ok->getStatusCode());
        $this->assertSame('12', $ok->getData(true)['result']['ticket']);

        $bad = Request::create('/x', 'POST', ['code' => 'tk.12.AAAAAAAAAAAAA']);
        $bad->setUserResolver(fn () => (new User)->forceFill(['id' => 5]));
        $res = $this->controller()->scan($bad);
        $this->assertSame([422, 'This is not one of our codes.'], [$res->getStatusCode(), $res->getData(true)['message']]);
    }

    public function test_the_image_door_draws_any_kind_and_refuses_what_it_cannot(): void
    {
        $c = $this->controller();
        $svg = $c->image(Request::create('/x', 'GET', ['kind' => 'qr', 'data' => 'https://example.com', 'fg' => '#112233']));
        $this->assertSame('image/svg+xml', $svg->headers->get('Content-Type'));
        $this->assertStringContainsString('fill="#112233"', $svg->getContent());
        $png = $c->image(Request::create('/x', 'GET', ['kind' => 'ean13', 'data' => '590123412345', 'format' => 'png']));
        $this->assertSame('image/png', $png->headers->get('Content-Type'));
        $this->assertStringStartsWith("\x89PNG", $png->getContent());
        $this->assertStringContainsString('>123457<', $c->image(Request::create('/x', 'GET', ['kind' => 'ean13', 'data' => '590123412345']))->getContent());
        $this->assertStringNotContainsString('<text', $c->image(Request::create('/x', 'GET', ['kind' => 'code128', 'data' => 'SKU-1', 'text' => '0']))->getContent());
        $bad = $c->image(Request::create('/x', 'GET', ['kind' => 'ean13', 'data' => '5901234123456']));
        $this->assertSame(422, $bad->getStatusCode());
        $this->assertStringContainsString('should be 7', $bad->getData(true)['message']);
        $this->assertSame(422, $c->image(Request::create('/x', 'GET', ['kind' => 'nope', 'data' => 'x']))->getStatusCode());
    }

    public function test_the_kinds_list_and_the_suggestion(): void
    {
        $k = $this->controller()->kinds()->getData(true);
        $this->assertContains('qr', array_column($k['kinds'], 'key'));
        $this->assertContains('ean13', array_column($k['kinds'], 'key'));
        $this->assertSame('ean13', CodeFactory::suggest('5901234123457'));
        $this->assertSame('upca', CodeFactory::suggest('036000291452'));
        $this->assertSame('ean8', CodeFactory::suggest('55123457'));
        $this->assertSame('code128', CodeFactory::suggest('5901234123456'), 'a number with a wrong check digit is not treated as a GTIN');
        $this->assertSame('code128', CodeFactory::suggest('SKU-123'));
        $this->assertSame('code128', CodeFactory::suggest('12345'));
    }
}
