<?php

namespace App\Services\Insight\Packs;

use App\Models\Currency;
use App\Models\Customer;
use App\Models\CustomerTier;
use App\Models\User;
use App\Services\Books\RestatedBase;
use App\Services\Insight\InsightPack;
use App\Services\Insight\Lookback;
use App\Services\Insight\LoyaltyData;
use Illuminate\Support\Facades\DB;

/**
 * A customer: what they buy, what discounts they get (personal, tier, type, promos) against what they actually take, how that compares with
 * their peers, whether their tier still fits their spending, and what they owe. A sales rep sees only customers assigned to them, and not what they owe.
 */
class CustomerDiscountPack implements InsightPack
{
    public function key(): string { return 'customer.discounts'; }

    public function title(): string { return 'Are this customer\'s discounts right for them?'; }

    public function module(): ?string { return null; }

    public function permission(): string { return 'insight.view'; }

    public function contexts(): array { return ['customer']; }

    public function applies(array $context): bool
    {
        return Customer::whereKey($context['id'] ?? 0)->exists();
    }

    public function answer(array $context, Lookback $lb, User $user, int $example = 0): array
    {
        $c = Customer::findOrFail($context['id']);
        // a sales rep's customers only; everyone else not allowed is told "not found" by the registry's caller
        if ($user->dataScope() !== 'all' && (int) $c->assigned_sales_rep !== (int) $user->id) {
            throw new \Symfony\Component\HttpKernel\Exception\NotFoundHttpException('Not found.');
        }
        $b = LoyaltyData::baseCode();
        $name = trim($c->first_name . ' ' . $c->last_name);

        $rows = fn ($customerId) => RestatedBase::join(DB::table('vouchers as v')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id'))
            ->where('v.status', 'posted')->whereIn('t.base_type', ['sales', 'cash_sale'])->whereBetween('v.date', [$lb->from->toDateString(), $lb->to->toDateString()])
            ->when($customerId, fn ($q) => $q->where('v.customer_id', $customerId));
        $mine = $rows($c->id)->selectRaw('COUNT(*) as n, COALESCE(SUM(' . RestatedBase::total('v', 'cu') . '),0) as total')->first();
        $disc = DB::table('voucher_items as i')->join('vouchers as v', 'v.id', '=', 'i.voucher_id')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')
            ->leftJoin('currencies as cu', 'cu.id', '=', 'v.currency_id')
            ->where('v.status', 'posted')->whereIn('t.base_type', ['sales', 'cash_sale'])->where('v.customer_id', $c->id)->whereBetween('v.date', [$lb->from->toDateString(), $lb->to->toDateString()])
            ->where('i.discount_amount', '>', 0)->groupBy('i.discount_source')
            ->selectRaw("COALESCE(i.discount_source, 'other') as src, SUM(i.discount_amount * " . RestatedBase::rate('v', 'cu') . ') as amt')->pluck('amt', 'src')->map(fn ($v) => (float) $v)->all();
        $revenue = (float) $mine->total; $orders = (int) $mine->n; $given = array_sum($disc);
        $gross = $revenue + $given;

        $tier = CustomerTier::where('slug', $c->tier)->first();
        $personal = (float) $c->discount_percentage; $tierPct = (float) ($tier?->discount_percentage ?? 0); $typePct = (float) $c->type_discount_percentage;
        $allowed = min($personal + $tierPct + $typePct, 30);

        $blocks = [['type' => 'facts', 'title' => $name, 'rows' => array_values(array_filter([
            ['Tier', ($tier?->name ?? $c->tier ?? '—'), $tier ? '× ' . number_format((float) $tier->loyalty_points_multiplier, 2) . ' points' : null],
            ['Lifetime', $b . ' ' . number_format((float) $c->total_spent, 2), number_format((int) $c->total_orders) . ' orders'],
            ['In the window (' . $lb->label() . ')', $b . ' ' . number_format($revenue, 2), $orders . ' sale(s)' . ($orders ? ', average ' . $b . ' ' . number_format($revenue / $orders, 2) : '')],
        ]))]];

        $blocks[] = ['type' => 'table', 'title' => 'Discounts they are entitled to', 'columns' => ['Kind', 'Percent'], 'rows' => [
            ['Personal', number_format($personal, 2) . '%'], ['Tier (' . ($tier?->name ?? '—') . ')', number_format($tierPct, 2) . '%'], ['Customer type (' . ($c->customer_type ?: '—') . ')', number_format($typePct, 2) . '%'],
            ['Together (capped at 30%)', number_format($allowed, 2) . '%'],
        ]];
        if ($orders > 0) {
            $eff = $gross > 0 ? $given / $gross * 100 : 0;
            $peer = $this->peerPct($c, $lb);
            $blocks[] = ['type' => 'facts', 'title' => 'What they actually took', 'rows' => array_values(array_filter([
                ['Discounts taken', $b . ' ' . number_format($given, 2), number_format($eff, 2) . '% of what they would have paid'],
                ...array_map(fn ($k, $v) => ['  of which ' . $k, $b . ' ' . number_format($v, 2)], array_keys($disc), array_values($disc)),
                $peer !== null ? ['Other customers on this tier', number_format($peer, 2) . '%', $eff > $peer + 2 ? 'this customer takes more than their peers' : ($eff < $peer - 2 ? 'less than their peers' : 'about the same')] : null,
            ]))];
        }

        // tier fit
        $days = max(1, (int) $lb->from->diffInDays($lb->to));
        $yearly = $revenue * 365 / $days;
        $tiers = CustomerTier::where('is_active', true)->orderBy('sort_order')->get();
        $money = app(\App\Services\CurrencyConversionService::class);
        $baseCur = $money->getBaseCurrency();
        $thr = fn ($t) => $t->min_spent && $t->currency_id ? $money->convert((float) $t->min_spent, Currency::find($t->currency_id) ?? $baseCur, $baseCur) : (float) $t->min_spent;
        $rowsT = $tiers->map(fn ($t) => [$t->name . ($t->slug === $c->tier ? ' (now)' : ''), number_format((float) $t->discount_percentage, 2) . '%', '× ' . number_format((float) $t->loyalty_points_multiplier, 2),
            $b . ' ' . number_format($thr($t), 0) . ' / ' . (int) $t->min_orders . ' orders', ($c->total_spent >= $thr($t) && $c->total_orders >= (int) $t->min_orders) ? 'yes' : 'no', $yearly >= $thr($t) ? 'yes' : 'no'])->all();
        $blocks[] = ['type' => 'table', 'title' => 'Tiers and who they fit', 'columns' => ['Tier', 'Discount', 'Points', 'Needs (spend / orders)', 'Lifetime qualifies', 'Current pace qualifies'], 'rows' => $rowsT];
        $best = $tiers->filter(fn ($t) => $yearly >= $thr($t))->last();
        $cur = $tiers->firstWhere('slug', $c->tier);
        if ($orders > 0 && $best && $cur && $best->id !== $cur->id) {
            $up = $best->sort_order > $cur->sort_order;
            $blocks[] = ['type' => 'verdict', 'tone' => $up ? 'info' : 'warn', 'text' => 'At the pace of this window (about ' . $b . ' ' . number_format($yearly, 0) . ' a year) they fit ' . $best->name . ', not ' . $cur->name . ($up ? ': they may deserve a higher tier.' : ': their buying has slowed, so the ' . number_format((float) $cur->discount_percentage, 0) . '% tier discount is more than their spend now earns. Tiers are usually kept for the year, so this is a point to watch rather than act on.')];
        } elseif ($orders === 0) {
            $blocks[] = ['type' => 'note', 'text' => 'No sales to this customer in the window, so there is nothing to judge their discounts against.'];
        }

        // what they owe (not for sales reps)
        if ($user->hasPermission('books.view')) {
            $ledger = \App\Models\Books\Ledger::where('customer_id', $c->id)->first();
            if ($ledger) {
                $owed = app(\App\Services\Books\LedgerService::class)->balance($ledger->id);
                $blocks[] = ['type' => 'facts', 'title' => 'Account', 'rows' => [[$owed > 0 ? 'They owe' : ($owed < 0 ? 'We owe them (credit)' : 'Balance'), $b . ' ' . number_format(abs($owed), 2)]]];
            }
        }

        return ['title' => $name, 'subtitle' => 'Discounts against what they buy', 'blocks' => $blocks, 'basis' => 'Read from this customer\'s sales, the tiers and discount tables over ' . $lb->label() . '. Nothing is changed.'];
    }

    /** The share of what customers on the same tier would have paid that they took in discounts, in the window. */
    private function peerPct(Customer $c, Lookback $lb): ?float
    {
        $r = DB::table('voucher_items as i')->join('vouchers as v', 'v.id', '=', 'i.voucher_id')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')->join('customers as cu2', 'cu2.id', '=', 'v.customer_id')
            ->leftJoin('currencies as cu', 'cu.id', '=', 'v.currency_id')
            ->where('v.status', 'posted')->whereIn('t.base_type', ['sales', 'cash_sale'])->where('cu2.tier', $c->tier)->where('v.customer_id', '!=', $c->id)->whereBetween('v.date', [$lb->from->toDateString(), $lb->to->toDateString()])
            ->selectRaw('COALESCE(SUM(i.discount_amount * ' . RestatedBase::rate('v', 'cu') . '),0) as d, COALESCE(SUM(i.amount * ' . RestatedBase::rate('v', 'cu') . '),0) as a')->first();

        return $r && ((float) $r->a + (float) $r->d) > 0 ? (float) $r->d / ((float) $r->a + (float) $r->d) * 100 : null;
    }
}
