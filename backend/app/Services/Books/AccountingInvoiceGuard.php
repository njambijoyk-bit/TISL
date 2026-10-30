<?php

namespace App\Services\Books;

use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use App\Models\Books\VoucherType;

/**
 * An accounting invoice is a sales or purchase invoice made of ledger lines only: no products, services or stock. It still posts like any invoice (party, due date, tax from the ledger,
 * paid later), and says so in its meta ("invoice_mode": "accounting"). This checks that what it posts to makes sense: income (or expense recovered from the customer) ledgers on a sale, expense or asset ledgers on a purchase.
 */
class AccountingInvoiceGuard
{
    public const MODE = 'accounting';

    /** Base types that can be an accounting invoice. */
    private const BASES = [VoucherType::SALES, VoucherType::PURCHASE, VoucherType::CREDIT_NOTE, VoucherType::DEBIT_NOTE];

    /** Kinds of ledger an invoice line must never post to, whatever the side. */
    private const NEVER = ['customer', 'supplier', 'cash', 'bank', 'tax', 'stock', 'accumulated_depreciation', 'capital'];

    public static function wanted(array $data): bool
    {
        return ($data['meta']['invoice_mode'] ?? null) === self::MODE;
    }

    /**
     * @param  array  $lines  the lines as resolved for posting
     *
     * @throws BooksException
     */
    public function assert(VoucherType $type, array $lines): void
    {
        if (! in_array($type->base_type, self::BASES, true)) {
            throw new BooksException('An accounting invoice can only be a sales or purchase invoice (or its credit or debit note).');
        }
        $kinds = app(LedgerKinds::class);
        $income = $type->isSalesSide();
        foreach ($lines as $l) {
            foreach (($l['is_header'] ?? false) ? ($l['children'] ?? []) : [$l] as $x) {
                if (($x['notes'] ?? null) === \App\Services\Books\VoucherService::TAX_LINE) {
                    continue;   // a tax entered as a line of its own: it posts to the tax's ledger, which no other line may
                }
                if (($x['item_type'] ?? null) !== 'custom') {
                    throw new BooksException('An accounting invoice has ledger lines only. Remove the product, service or charge lines, or use an item invoice.');
                }
                $ledger = Ledger::with('group:id,nature')->find($x['ledger_id'] ?? 0);
                if (! $ledger) {
                    throw new BooksException('Choose a ledger for every line.');
                }
                $kind = $kinds->kindOf($ledger);
                $nature = $ledger->group?->nature;
                if (in_array($kind, self::NEVER, true)) {
                    throw new BooksException("\"{$ledger->name}\" is a " . mb_strtolower($kinds->label($kind)) . " ledger: an invoice line cannot post to it.");
                }
                if ($income && ! in_array($nature, ['income', 'expense'], true)) {   // income, or an expense being billed back to the customer (a recovery)
                    throw new BooksException("\"{$ledger->name}\" is not an income or expense ledger. A sales invoice line posts to income, or to an expense that is billed back to the customer.");
                }
                if (! $income && ! in_array($nature, ['expense', 'asset'], true)) {
                    throw new BooksException("\"{$ledger->name}\" is not an expense or asset ledger. A purchase invoice line posts to what was bought: an expense, or an asset.");
                }
            }
        }
    }
}
