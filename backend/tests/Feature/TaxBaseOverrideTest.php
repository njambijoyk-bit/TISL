<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\VoucherService;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Changing what a tax is worked out on, on a document line (docs/TAX_CONTROL_PLAN.md, T6c): permission, reason, and the record kept. */
class TaxBaseOverrideTest extends TestCase
{
    private function user(bool $may): User
    {
        $u = new class extends User {
            public bool $may = false;
            public function hasPermission($p): bool { return $this->may && $p === 'books.tax.override'; }
        };
        $u->may = $may;
        $u->id = 41;

        return $u;
    }

    private function run_(array $line, ?User $user)
    {
        $m = new \ReflectionMethod(VoucherService::class, 'baseOverride');
        $m->setAccessible(true);

        return $m->invoke(app(VoucherService::class), $line, ['user' => $user]);
    }

    protected function setUp(): void
    {
        parent::setUp();
        Schema::dropIfExists('tax_control_settings');
        Schema::dropIfExists('tax_control_log');
    }

    public function test_no_request_or_the_same_amount_changes_nothing(): void
    {
        $this->assertNull($this->run_(['amount' => 1000.0], null));
        $this->assertNull($this->run_(['amount' => 1000.0, 'tax_base_request' => ['amount' => 1000.0, 'reason' => '']], null));
    }

    public function test_it_needs_the_permission(): void
    {
        $this->expectException(BooksException::class);
        $this->run_(['amount' => 1000.0, 'tax_base_request' => ['amount' => 800.0, 'reason' => 'Part is not taxable']], $this->user(false));
    }

    public function test_it_needs_a_reason_by_default(): void
    {
        $this->expectExceptionMessage('Give a reason');
        $this->run_(['amount' => 1000.0, 'tax_base_request' => ['amount' => 800.0, 'reason' => '']], $this->user(true));
    }

    public function test_an_allowed_override_records_what_it_was_and_who_changed_it(): void
    {
        $o = $this->run_(['amount' => 1000.0, 'tax_base_request' => ['amount' => 800.0, 'reason' => 'Deposit is not taxable']], $this->user(true));
        $this->assertEquals(['from' => 1000.0, 'to' => 800.0, 'reason' => 'Deposit is not taxable', 'by' => 41], $o);
    }

    public function test_a_negative_base_is_refused(): void
    {
        $this->expectException(BooksException::class);
        $this->run_(['amount' => 1000.0, 'tax_base_request' => ['amount' => -5.0, 'reason' => 'x']], $this->user(true));
    }
}
