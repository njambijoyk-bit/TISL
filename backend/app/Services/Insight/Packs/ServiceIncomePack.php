<?php

namespace App\Services\Insight\Packs;

use App\Models\Booking;
use App\Models\Currency;
use App\Models\Service;
use App\Models\ServiceVariant;
use App\Models\User;
use App\Services\Books\RestatedBase;
use App\Services\Insight\InsightPack;
use App\Services\Insight\Lookback;
use App\Services\Insight\LoyaltyData;
use Illuminate\Support\Facades\DB;

/** A service (how its quotes and sales did) or one booking (what it brought in against the listed price). */
class ServiceIncomePack implements InsightPack
{
    public function key(): string { return 'service.income'; }

    public function title(): string { return 'What did this service earn?'; }

    public function module(): ?string { return null; }

    public function roles(): array { return ['super_admin', 'admin', 'manager', 'finance']; }

    public function contexts(): array { return ['service', 'booking']; }

    public function applies(array $context): bool
    {
        return ($context['type'] ?? '') === 'booking' ? Booking::whereKey($context['id'] ?? 0)->exists() : Service::whereKey($context['id'] ?? 0)->exists();
    }

    public function answer(array $context, Lookback $lb, User $user, int $example = 0): array
    {
        return ($context['type'] ?? '') === 'booking' ? $this->booking((int) $context['id']) : $this->service((int) $context['id'], $lb);
    }

    private function booking(int $id): array
    {
        $b = Booking::with(['customer', 'resource'])->findOrFail($id);
        $base = LoyaltyData::baseCode();
        $cur = $b->currency_id ? (Currency::find($b->currency_id)?->code ?? $base) : $base;
        $variant = $b->service_variant_id ? ServiceVariant::find($b->service_variant_id) : null;
        $voucher = fn ($vid) => $vid ? DB::table('vouchers as v')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')->where('v.id', $vid)->first(['v.voucher_number', 'v.status', 't.name as type', 'v.total_amount', 'v.base_total']) : null;
        $rows = []; $income = 0.0;
        foreach (['order_voucher_id' => 'Booking order', 'upfront_voucher_id' => 'Paid up front', 'invoice_voucher_id' => 'Invoice', 'fee_voucher_id' => 'Fees'] as $col => $label) {
            $v = $voucher($b->$col);
            if ($v) {
                $rows[] = [$label . ' ' . $v->voucher_number, $v->status, number_format((float) $v->total_amount, 2)];
                if (in_array($col, ['invoice_voucher_id', 'fee_voucher_id'], true) && $v->status === 'posted') { $income += (float) $v->total_amount; }
            }
        }
        $blocks = [['type' => 'facts', 'title' => 'Booking ' . $b->number . ' — ' . $b->status, 'rows' => array_values(array_filter([
            ['Customer', trim(($b->customer?->first_name ?? '') . ' ' . ($b->customer?->last_name ?? '')) ?: '—'],
            ['When', $b->starts_at?->format('Y-m-d H:i') . ($b->ends_at ? ' to ' . $b->ends_at->format('H:i') : '')],
            ['Priced at', $cur . ' ' . number_format((float) $b->price, 2), $variant ? 'listed: ' . $cur . ' ' . number_format((float) $variant->price, 2) : null],
            $b->deposit_amount ? ['Deposit', $cur . ' ' . number_format((float) $b->deposit_amount, 2), (string) $b->deposit_status] : null,
        ]))]];
        if ($rows) {
            $blocks[] = ['type' => 'table', 'title' => 'What it generated', 'columns' => ['Document', 'Status', 'Amount'], 'rows' => $rows];
        }
        $listed = $variant ? (float) $variant->price : 0;
        $tone = $b->status === 'cancelled' ? 'warn' : 'info';
        $blocks[] = ['type' => 'verdict', 'tone' => $tone, 'text' => $b->status === 'cancelled'
            ? 'Cancelled' . ($b->cancelled_late ? ' late' : '') . ($b->deposit_status ? ' — deposit ' . $b->deposit_status : '') . '. Income from it: ' . $cur . ' ' . number_format($income, 2) . '.'
            : 'Income so far: ' . $cur . ' ' . number_format($income, 2) . ' against ' . $cur . ' ' . number_format((float) $b->price, 2) . ' priced' . ($listed > 0 && abs((float) $b->price - $listed) > 0.005 ? ($b->price < $listed ? ', which is ' . number_format((1 - $b->price / $listed) * 100, 1) . '% under the list price' : ', which is above the list price') : '') . '.'];

        return ['title' => 'Booking ' . $b->number, 'blocks' => $blocks, 'basis' => 'Read from this booking and the documents it produced. Nothing is changed.'];
    }

    private function service(int $id, Lookback $lb): array
    {
        $s = Service::findOrFail($id);
        $base = LoyaltyData::baseCode();
        $variants = ServiceVariant::where('service_id', $id)->get();
        $vids = $variants->pluck('id');
        $rate = RestatedBase::rate('v', 'cu');
        $lines = DB::table('voucher_items as i')->join('vouchers as v', 'v.id', '=', 'i.voucher_id')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')->leftJoin('currencies as cu', 'cu.id', '=', 'v.currency_id')
            ->where('i.service_id', $id)->where('v.status', 'posted')->whereBetween('v.date', [$lb->from->toDateString(), $lb->to->toDateString()])->where('i.is_header', false);
        $by = fn (array $types) => (clone $lines)->whereIn('t.base_type', $types)->selectRaw("COUNT(DISTINCT v.id) as docs, COALESCE(SUM(i.quantity),0) as q, COALESCE(SUM(i.amount * {$rate}),0) as amt")->first();
        $quotes = $by(['quotation']); $orders = $by(['sales_order']); $sales = $by(['sales', 'cash_sale']);
        $blocks = [['type' => 'table', 'title' => 'Listed packages', 'columns' => ['Package', 'Price', 'Compare-at'], 'rows' => $variants->map(fn ($v) => [$v->name ?: 'Standard', number_format((float) $v->price, 2), $v->compare_at_price ? number_format((float) $v->compare_at_price, 2) : '—'])->all()]];
        $blocks[] = ['type' => 'table', 'title' => 'The chain in ' . $lb->label(), 'columns' => ['Stage', 'Documents', 'Value (' . $base . ')'], 'rows' => [
            ['Quoted', (string) $quotes->docs, number_format((float) $quotes->amt, 2)], ['Ordered', (string) $orders->docs, number_format((float) $orders->amt, 2)], ['Invoiced / sold', (string) $sales->docs, number_format((float) $sales->amt, 2)]]];

        $bk = Booking::whereIn('service_variant_id', $vids)->whereBetween('starts_at', [$lb->from->toDateString() . ' 00:00:00', $lb->to->toDateString() . ' 23:59:59'])->get();
        $inc = $bk->isEmpty() ? 0.0 : (float) DB::table('vouchers')->whereIn('id', $bk->pluck('invoice_voucher_id')->filter())->where('status', 'posted')->sum('base_total');
        if ($bk->isNotEmpty()) {
            $blocks[] = ['type' => 'facts', 'title' => 'Bookings', 'rows' => [['Booked', (string) $bk->count(), $bk->where('status', 'completed')->count() . ' completed, ' . $bk->where('status', 'cancelled')->count() . ' cancelled'], ['Invoiced from bookings', $base . ' ' . number_format($inc, 2)]]];
        }
        $conv = $quotes->docs > 0 ? $sales->docs / $quotes->docs * 100 : null;
        $avg = $sales->q > 0 ? (float) $sales->amt / (float) $sales->q : null;
        $listed = $variants->avg('price');
        $text = $conv !== null ? number_format(min($conv, 100), 0) . ' invoiced or sold for every 100 quotes' : 'No quotes for this service in the window';
        if ($avg !== null && $listed > 0) {
            $text .= '; it sells for ' . $base . ' ' . number_format($avg, 2) . ' on average against a list of ' . number_format((float) $listed, 2) . ' (' . ($avg >= $listed ? '+' : '') . number_format(($avg / $listed - 1) * 100, 1) . '%)';
        }
        $blocks[] = ['type' => 'verdict', 'tone' => ($sales->amt > 0 ? 'good' : 'info'), 'text' => ucfirst($text) . '. Altogether it brought in ' . $base . ' ' . number_format((float) $sales->amt + $inc, 2) . ' in the window.'];

        return ['title' => $s->name, 'blocks' => $blocks, 'basis' => 'Read from quotes, orders, invoices and bookings over ' . $lb->label() . '.'];
    }
}
