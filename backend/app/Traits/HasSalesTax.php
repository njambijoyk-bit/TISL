<?php

namespace App\Traits;

use App\Services\Books\PriceTax;

/**
 * For anything sold under a sales account (product, service, hamper). Its price is stored EXCLUSIVE of tax;
 * these read-only attributes give the storefront the tax treatment and the tax-inclusive figures, derived
 * from the account's rate. Needs a `sales_ledger_id` and a `display_price`.
 */
trait HasSalesTax
{
    public function getTaxInfoAttribute(): ?array
    {
        return PriceTax::forItem($this);
    }

    /** Tax on display_price (the shopper's currency). */
    public function getDisplayTaxAttribute(): ?float
    {
        return $this->display_price === null ? null : PriceTax::split((float) $this->display_price, $this->tax_info)['tax'];
    }

    public function getDisplayPriceInclAttribute(): ?float
    {
        return $this->display_price === null ? null : PriceTax::split((float) $this->display_price, $this->tax_info)['gross'];
    }
}
