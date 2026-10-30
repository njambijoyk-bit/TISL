<?php

namespace Tests\Feature;

use App\Models\Books\VoucherType;
use App\Services\Books\AccountingInvoiceGuard;
use App\Services\Books\BooksException;
use App\Services\Books\Engine\LedgerBalances;
use Tests\TestCase;

/** An accounting invoice is ledger lines only: income on a sale, expense or asset on a purchase, never money, parties, tax or stock. */
class AccountingInvoiceGuardTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
    }

    protected function tearDown(): void
    {
        LedgerBalances::forget();
        parent::tearDown();
    }

    private function type(string $base): VoucherType
    {
        return new VoucherType(['code' => strtoupper($base), 'name' => $base, 'base_type' => $base]);
    }

    private function line(int $ledgerId, string $itemType = 'custom'): array
    {
        return ['item_type' => $itemType, 'ledger_id' => $ledgerId, 'is_header' => false];
    }

    private function refused(string $base, array $lines): ?string
    {
        try {
            app(AccountingInvoiceGuard::class)->assert($this->type($base), $lines);
        } catch (BooksException $e) {
            return $e->getMessage();
        }

        return null;
    }

    public function test_it_is_asked_for_through_the_meta(): void
    {
        $this->assertTrue(AccountingInvoiceGuard::wanted(['meta' => ['invoice_mode' => 'accounting']]));
        $this->assertFalse(AccountingInvoiceGuard::wanted(['meta' => ['invoice_mode' => 'item']]));
        $this->assertFalse(AccountingInvoiceGuard::wanted([]));
    }

    public function test_a_sale_posts_to_income_and_a_purchase_to_expense_or_asset(): void
    {
        $this->assertNull($this->refused('sales', [$this->line(11)]), 'Misc income is an income ledger');
        $this->assertNull($this->refused('purchase', [$this->line(6)]), 'Rent is an expense');
        $this->assertStringContainsString('not an income ledger', $this->refused('sales', [$this->line(6)]));
        $this->assertStringContainsString('not an expense or asset', $this->refused('purchase', [$this->line(11)]));
    }

    public function test_money_parties_and_stock_are_refused_and_so_are_item_lines(): void
    {
        $this->assertStringContainsString('customer ledger', $this->refused('sales', [$this->line(3)]));
        $this->assertStringContainsString('bank ledger', $this->refused('purchase', [$this->line(1)]));
        $this->assertStringContainsString('ledger lines only', $this->refused('purchase', [$this->line(6, 'product')]));
        $this->assertStringContainsString('only be a sales or purchase', $this->refused('receipt', [$this->line(6)]));
    }
}
