<?php

namespace App\Services\Catalogue;

use App\Models\Auction;
use App\Models\Books\Ledger;
use App\Models\Currency;
use App\Models\Hamper;
use App\Models\Product;
use App\Models\ProductVariantUnit;
use App\Models\Service;
use App\Services\Books\PriceTax;
use App\Services\Books\TaxLineService;
use Illuminate\Database\Eloquent\Model;

/**
 * The selling prices of an item as plain lines, each in the item's OWN currency (nothing is converted), excluding tax, with the tax worked out the way an
 * invoice does it for a guest buying one unit: the item's sales account, the duty or tax name and rate, a percentage on the amount, a fixed amount converted
 * from its own currency into the item's currency and added up. Books is only read. Cost is never touched.
 */
class PriceLines
{
    /** @var array<int,?Ledger> */
    private array $ledgers = [];

    public function __construct(private TaxLineService $taxLines) {}

    /** @return array<int,array<string,mixed>> */
    public function forProduct(Product $p): array
    {
        $p->loadMissing(['currency:id,code,symbol', 'category:id,name', 'defaultUnit:id,code,name']);
        $cur = $p->currency;
        $lines = [];
        $variants = $p->hasStructuredVariants() ? $p->productVariants()->where('status', 'active')->with(['units' => fn ($q) => $q->where('is_active', true)->where('is_sellable', true), 'units.unit:id,code,name'])->get() : collect();
        if ($variants->isEmpty()) {
            if ($p->price !== null) {
                $lines[] = $this->line($p, $p->sku, null, $p->defaultUnit?->code, (float) $p->price, $p->original_price !== null ? (float) $p->original_price : null, $cur);
            }

            return $lines;
        }
        $many = $variants->count() > 1;
        foreach ($variants as $v) {
            $v->loadMissing('units');
            foreach ($v->units as $u) {
                $price = $u->effectivePrice();
                if ($price === null) {
                    continue;
                }
                $label = $many ? ($v->name ?: null) : null;
                $lines[] = $this->line($p, $v->sku ?: $p->sku, $label, $u->unit?->code, $price, $u->compare_at_price !== null ? (float) $u->compare_at_price : null, $cur);
            }
        }

        return $lines;
    }

    /** @return array<int,array<string,mixed>> */
    public function forService(Service $s): array
    {
        $s->loadMissing(['currency:id,code,symbol', 'category:id,name']);
        $cur = $s->currency;
        $lines = [];
        $packages = $s->variants()->where('status', 'active')->with('priceUnit:id,code,name')->orderBy('position')->get();
        foreach ($packages as $v) {
            if ($v->price === null) {
                continue;
            }
            $lines[] = $this->line($s, $s->sku, $v->name, $v->priceUnit?->code, (float) $v->price, $v->compare_at_price !== null ? (float) $v->compare_at_price : null, $cur) + ['variant_id' => $v->id];
        }
        if (! $lines && $s->base_price !== null && (float) $s->base_price > 0) {
            $lines[] = $this->line($s, $s->sku, null, $s->priceUnit?->code, (float) $s->base_price, null, $cur);
        }

        return $lines;
    }

    /** A hamper has one price. */
    public function forHamper(Hamper $h): array
    {
        $h->loadMissing('currency:id,code,symbol');

        return [$this->line($h, null, null, null, (float) $h->price, null, $h->currency)];
    }

    /** An auction shows its current price (the start price until a bid is placed). */
    public function forAuction(Auction $a): array
    {
        $a->loadMissing('currency:id,code,symbol');
        $price = (float) ($a->current_price ?: $a->start_price);

        return [$this->line($a, null, 'Current price', null, $price, null, $a->currency)];
    }

    private function ledger(?int $id): ?Ledger
    {
        return $id ? ($this->ledgers[$id] ??= Ledger::find($id)) : null;
    }

    private function line(Model $item, ?string $code, ?string $variant, ?string $unit, float $price, ?float $original, ?Currency $cur): array
    {
        $tax = $this->tax($item, $price, $cur);

        return [
            'code' => $code, 'variant' => $variant, 'unit' => $unit,
            'currency_code' => $cur?->code ?? '', 'currency_symbol' => $cur?->symbol,
            'price' => round($price, 4), 'original_price' => $original !== null && $original > 0 ? round($original, 4) : null,
            'tax_account' => $tax['account'], 'tax_name' => $tax['name'], 'tax_percent' => $tax['percent'], 'tax_amount' => $tax['amount'], 'total' => round($price + $tax['amount'], 4),
        ];
    }

    /** @return array{account:?string,name:?string,percent:?float,amount:float} */
    private function tax(Model $item, float $price, ?Currency $cur): array
    {
        $ledger = $this->ledger($item->sales_ledger_id ?? null);
        $none = ['account' => $ledger?->name, 'name' => null, 'percent' => null, 'amount' => 0.0];
        if (! $ledger) {
            return $none;
        }
        $info = PriceTax::forItem($item);
        $none['name'] = $info['label'] ?? null;
        try {
            $rows = $this->taxLines->fromAccount($ledger, $price, $price, 1.0, 'output', null, $cur, now(), $item);
        } catch (\Throwable) {
            return $none;
        }
        if (! $rows) {
            return $none;
        }

        return ['account' => $ledger->name, 'name' => implode(' + ', array_column($rows, 'label')), 'percent' => $rows[0]['percent'], 'amount' => round(array_sum(array_column($rows, 'tax_amount')), 4)];
    }
}
