<?php

namespace App\Services\BulkImport\Entities;

use App\Models\Currency;
use App\Services\Books\TradingAccounts;
use App\Services\BulkImport\ImportContext;
use App\Services\BulkImport\RowProblem;

/** What products, services and hampers share: the sales account that decides their tax, the currency, and a SKU that nothing else has. */
trait TradingColumns
{
    /** The sales (or purchase) account named in a cell, checked by the same rules the product screens use. */
    protected function account(array $r, string $col, ImportContext $ctx, string $kind, string $scope): ?int
    {
        $text = $this->str($r, $col);
        if ($text === null) {
            return null;
        }
        $ledger = $ctx->ledger($text);
        if (! $ledger) {
            throw new RowProblem("The account \"{$text}\" is not in the chart of accounts. Use an account's name or code.", RowProblem::MISSING_REF, $col);
        }
        if ($why = TradingAccounts::problem((int) $ledger->id, $kind, $scope)) {
            throw new RowProblem($why, RowProblem::INVALID, $col);
        }

        return (int) $ledger->id;
    }

    protected function currencyId(array $r, string $col = 'currency'): ?int
    {
        $code = $this->str($r, $col);
        if ($code === null) {
            return null;
        }
        $c = Currency::whereRaw('LOWER(code) = ?', [mb_strtolower($code)])->where('is_active', true)->first();
        if (! $c) {
            throw new RowProblem("The currency \"{$code}\" is not an active currency. Use its code (KES, USD...).", RowProblem::MISSING_REF, $col);
        }

        return (int) $c->id;
    }

    protected function unitId(array $r, string $col, ImportContext $ctx): ?int
    {
        $text = $this->str($r, $col);
        if ($text === null) {
            return null;
        }
        $u = $ctx->unit($text);
        if (! $u || ! $u->is_active) {
            throw new RowProblem("The unit \"{$text}\" is not an active unit. Use a unit's code or name from Units.", RowProblem::MISSING_REF, $col);
        }

        return (int) $u->id;
    }

    protected function skuFree(array $r): void
    {
        $sku = $this->str($r, 'sku');
        if ($sku === null) {
            return;
        }
        if (str_contains($sku, '/') || str_contains($sku, '\\')) {
            throw new RowProblem('A SKU can not contain a slash.', RowProblem::INVALID, 'sku');
        }
        if (app(\App\Services\Ecommerce\SkuGenerator::class)->taken($sku)) {
            throw new RowProblem("The SKU {$sku} is already used by another product, variant or service.", RowProblem::EXISTS, 'sku');
        }
    }

    /** A slug no other row of $model has: name-2, name-3... */
    protected function uniqueSlug(string $model, string $name): string
    {
        $base = \Illuminate\Support\Str::slug($name) ?: 'item';
        $slug = $base;
        for ($n = 2; $model::where('slug', $slug)->exists(); $n++) {
            $slug = $base.'-'.$n;
        }

        return $slug;
    }

    protected function baseCurrencyId(): int
    {
        return (int) app(\App\Services\CurrencyConversionService::class)->getBaseCurrency()->id;
    }
}
