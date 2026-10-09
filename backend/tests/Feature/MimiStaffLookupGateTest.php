<?php

namespace Tests\Feature;

use App\Http\Controllers\ChatController;
use App\Models\User;
use App\Services\Chat\Local\CallerContext;
use App\Services\Chat\Local\LocalLayer;
use App\Services\Chat\MimiBlockService;
use App\Services\Chat\MimiQueryLogService;
use App\Services\Chat\MimiSessionService;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * The staff side of today's Mimi (the old prompt path) used to look up any order or customer for anyone who could open the admin area. These checks
 * run with NO vouchers, customers or payments tables: if a refused lookup or a stat still touched them, it would throw. Refusal has to come first.
 */
class MimiStaffLookupGateTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Schema::create('products', function ($t) { $t->id(); $t->string('status')->default('active'); $t->softDeletes(); });
        config(['cache.default' => 'array']);
    }

    private function chat(CallerContext $ctx): ChatController
    {
        return new class($ctx, app(MimiSessionService::class), app(MimiQueryLogService::class), app(MimiBlockService::class), app(LocalLayer::class)) extends ChatController
        {
            public function __construct(private CallerContext $ctx, $a, $b, $c, $d)
            {
                parent::__construct($a, $b, $c, $d);
            }

            protected function callerFor(User $user): CallerContext
            {
                return $this->ctx;
            }

            public function context(User $u, string $m): array
            {
                return json_decode((new \ReflectionMethod(ChatController::class, 'getAdminContext'))->invoke($this, $u, $m), true);
            }

            public function intent(string $m): array
            {
                return (new \ReflectionMethod(ChatController::class, 'detectAdminIntent'))->invoke($this, $m);
            }
        };
    }

    private function user(): User
    {
        return (new User)->forceFill(['id' => 7]);
    }

    public function test_a_staff_account_without_customers_view_cannot_look_up_orders_or_customers(): void
    {
        $chef = $this->chat(CallerContext::fake('staff', ['admin.access', 'menus.view'], 'all', $this->user()));

        $order = $chef->context($this->user(), 'look up order WNKJ-SO-00012');
        $this->assertStringContainsString("don't have the permission", $order['lookup']);

        $cust = $chef->context($this->user(), 'who is wanjiru@example.com');
        $this->assertStringContainsString("don't have the permission", $cust['lookup']);

        $this->assertArrayNotHasKey('orders', $order['stats']);        // not even the counts
        $this->assertArrayNotHasKey('customers', $order['stats']);
        $this->assertArrayNotHasKey('payments', $order['stats']);
    }

    public function test_payment_records_need_the_books_and_no_branch_limit_and_the_refusal_does_not_reveal_whether_it_exists(): void
    {
        $noBooks = $this->chat(CallerContext::fake('staff', ['admin.access'], 'all', $this->user()));
        $limited = $this->chat(CallerContext::fake('staff', ['admin.access', 'books.view'], 'all', $this->user(), [3]));

        foreach ([$noBooks, $limited] as $c) {
            $real = $c->context($this->user(), 'payment PAY-2026-1-001')['lookup'];
            $none = $c->context($this->user(), 'payment PAY-2099-9-999')['lookup'];
            $this->assertSame($real, $none);
            $this->assertStringContainsString("don't have access", $real);
            $this->assertStringContainsString('not available', $c->context($this->user(), 'payment summary')['payments']);
        }
    }

    public function test_orders_numbered_the_way_the_books_number_them_are_recognised(): void
    {
        $c = $this->chat(CallerContext::fake('staff', ['*'], 'all', $this->user()));
        $this->assertSame(['type' => 'order_lookup', 'identifier' => 'WNKJ-SO-00001'], $c->intent('where is WNKJ-SO-00001 please'));
        $this->assertSame('order_lookup', $c->intent('order 42')['type']);
        $this->assertSame('payment_lookup', $c->intent('PAY-2026-1-001')['type']);
    }
}
