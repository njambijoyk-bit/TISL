<?php

namespace App\Services\Books;

use App\Models\Auction;
use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use App\Models\Hamper;
use App\Models\Product;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Every product, service, hamper and auction sells to a SALES ACCOUNT, and the account carries the tax. So an item
 * cannot be saved without one, and the account must have its tax treatment set. One place enforces it for all of them.
 */
class TradingAccounts
{
    /** Why this ledger cannot be used as a sales / purchase account, or null when it can. */
    public static function problem(?int $ledgerId, string $kind = 'sales', string $scope = 'product'): ?string
    {
        $ledger = $ledgerId ? Ledger::find($ledgerId) : null;
        if (! $ledger || ! $ledger->is_active) {
            return "Choose an active {$kind} account.";
        }
        if (LedgerGroup::whereKey($ledger->group_id)->value('behaviour') !== $kind) {
            return "\"{$ledger->name}\" is not a {$kind} account.";
        }
        if ($kind === 'sales') {   // services are sold under Service Income, everything else under Sales Accounts
            $reserved = LedgerGroup::appliesTo((int) $ledger->group_id) === 'service';
            if ($scope === 'service' && ! $reserved) {
                return "\"{$ledger->name}\" is a product sales account. Services are sold under the Service Income accounts.";
            }
            if ($scope !== 'service' && $reserved) {
                return "\"{$ledger->name}\" is a service income account. Products, hampers and auctions are sold under Sales Accounts.";
            }
        }
        if (! $ledger->tax_nature) {
            return "The {$kind} account \"{$ledger->name}\" has no tax set yet. Set its tax under Books → Chart of accounts.";
        }

        return null;
    }

    /**
     * Call before creating / updating an item. On update the account may be left out of the request only if the
     * item already has one. Returns a 422 response, or null when all is well.
     */
    public static function check(Request $request, ?Model $existing = null, ?string $scope = null): ?JsonResponse
    {
        $scope ??= $existing instanceof \App\Models\Service ? 'service' : 'product';
        $has = $request->has('sales_ledger_id');
        $id = $has ? ($request->input('sales_ledger_id') ?: null) : ($existing?->sales_ledger_id);
        if ($has || ! $existing || ! $id) {
            $msg = $id ? self::problem((int) $id, 'sales', $scope) : 'Choose the sales account this is sold under — it decides the tax.';
            if ($msg) {
                return response()->json(['message' => $msg, 'errors' => ['sales_ledger_id' => [$msg]]], 422);
            }
        }
        if ($request->filled('purchase_ledger_id') && ($msg = self::problem((int) $request->input('purchase_ledger_id'), 'purchase'))) {
            return response()->json(['message' => $msg, 'errors' => ['purchase_ledger_id' => [$msg]]], 422);
        }

        return null;
    }

    /** Call after the item is saved: stores the accounts on it (and, for a hamper, keeps its tax in step with the account). */
    public static function save(Model $item, Request $request): void
    {
        $fill = [];
        if ($request->has('sales_ledger_id')) {
            $fill['sales_ledger_id'] = $request->input('sales_ledger_id') ?: null;
        }
        if ($item instanceof Product && $request->has('purchase_ledger_id')) {
            $fill['purchase_ledger_id'] = $request->input('purchase_ledger_id') ?: null;
        }
        if ($fill) {
            $item->forceFill($fill);
        }
        if ($item instanceof Hamper && ($account = Ledger::find($item->sales_ledger_id))) {
            $taxed = in_array($account->tax_nature, ['taxable', 'zero_rated'], true) && $account->tax_rate_ledger_id;
            $item->forceFill(['tax_rate_id' => $taxed ? $account->tax_rate_ledger_id : null, 'apply_vat' => (bool) $taxed]);
        }
        if ($item->isDirty()) {
            $item->save();
        }
    }

    /** The account an auction sells to: its own, else its product's. */
    public static function forAuction(Auction $a): ?int
    {
        return $a->sales_ledger_id ?: ($a->product?->sales_ledger_id);
    }
}
