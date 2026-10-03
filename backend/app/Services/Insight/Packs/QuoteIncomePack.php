<?php

namespace App\Services\Insight\Packs;

use App\Models\Books\Voucher;
use App\Models\Customer;
use App\Models\ServiceVariant;
use App\Models\User;
use App\Services\Insight\InsightPack;
use App\Services\Insight\Lookback;
use App\Services\Insight\LoyaltyData;

/** A quote, order or invoice with service lines: priced against the list, and where the quote ended up (ordered, invoiced) and what income that made. */
class QuoteIncomePack implements InsightPack
{
    public function key(): string { return 'quote.income'; }

    public function title(): string { return 'What did this quote earn?'; }

    public function module(): ?string { return null; }

    public function roles(): array { return ['super_admin', 'admin', 'manager', 'finance', 'sales_rep']; }

    public function contexts(): array { return ['voucher']; }

    public function applies(array $context): bool
    {
        $v = Voucher::with('items')->find($context['id'] ?? null);

        return (bool) $v && $v->items->contains(fn ($i) => ! $i->is_header && $i->service_variant_id);
    }

    public function answer(array $context, Lookback $lb, User $user, int $example = 0): array
    {
        $v = Voucher::with(['items', 'type', 'currency'])->findOrFail($context['id']);
        if ($user->role === 'sales_rep') {
            $cust = $v->customer_id ? Customer::find($v->customer_id) : null;
            if (! $cust || (int) $cust->assigned_sales_rep !== (int) $user->id) {
                throw new \Symfony\Component\HttpKernel\Exception\NotFoundHttpException('Not found.');
            }
        }
        $c = $v->currency?->code ?? LoyaltyData::baseCode();
        $rows = []; $listed = 0.0; $quoted = 0.0;
        foreach ($v->items->filter(fn ($i) => ! $i->is_header && $i->service_variant_id) as $i) {
            $sv = ServiceVariant::find($i->service_variant_id);
            $q = (float) $i->quantity; $rate = (float) $i->rate; $list = $sv ? (float) $sv->price : 0;
            $listed += $list * $q; $quoted += $rate * $q;
            $rows[] = [$i->description . ($i->variant_label ? ' · ' . $i->variant_label : ''), rtrim(rtrim(number_format($q, 2), '0'), '.'), number_format($list, 2), number_format($rate, 2), $list > 0 ? ($rate >= $list ? '+' : '') . number_format(($rate / $list - 1) * 100, 1) . '%' : '—'];
        }
        $blocks = [['type' => 'table', 'title' => 'Priced against the list', 'columns' => ['Service', 'Qty', 'List', 'Quoted', 'Difference'], 'rows' => $rows]];

        // follow the chain down: what came of it
        $ids = [$v->id]; $chain = []; $inv = 0.0;
        for ($d = 0; $d < 3; $d++) {
            $kids = Voucher::with('type')->whereIn('source_voucher_id', $ids)->where('status', 'posted')->get();
            if ($kids->isEmpty()) { break; }
            foreach ($kids as $k) {
                $chain[] = [$k->type?->name . ' ' . $k->voucher_number, $k->date?->toDateString(), number_format((float) $k->total_amount, 2)];
                if (in_array($k->type?->base_type, ['sales', 'cash_sale'], true)) { $inv += (float) $k->total_amount; }
            }
            $ids = $kids->pluck('id')->all();
        }
        if ($chain) {
            $blocks[] = ['type' => 'table', 'title' => 'What came of it', 'columns' => ['Document', 'Date', 'Amount'], 'rows' => $chain];
        }
        $isQuote = $v->type?->base_type === 'quotation';
        $diff = $listed > 0 ? ($quoted / $listed - 1) * 100 : 0;
        $blocks[] = ['type' => 'verdict', 'tone' => $isQuote && ! $chain ? 'info' : 'good', 'text' =>
            'Quoted at ' . $c . ' ' . number_format($quoted, 2) . ($listed > 0 ? ', ' . (abs($diff) < 0.05 ? 'exactly the list price' : number_format(abs($diff), 1) . '% ' . ($diff < 0 ? 'under' : 'over') . ' the list of ' . $c . ' ' . number_format($listed, 2)) : '') . '. '
            . ($isQuote ? ($chain ? 'It went on to ' . count($chain) . ' document(s) and has brought in ' . $c . ' ' . number_format($inv, 2) . ' invoiced so far.' : 'It has not become an order yet, so it has earned nothing so far.') : 'Nothing more to follow from here.')];

        return ['title' => $v->type?->name . ' ' . $v->voucher_number, 'blocks' => $blocks, 'basis' => 'Read from this document, the service prices and the documents made from it. Nothing is changed.'];
    }
}
