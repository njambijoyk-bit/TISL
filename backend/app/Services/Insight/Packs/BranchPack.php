<?php

namespace App\Services\Insight\Packs;

use App\Models\User;
use App\Services\Books\RestatedBase;
use App\Services\Insight\InsightPack;
use App\Services\Insight\Lookback;
use App\Services\Insight\LoyaltyData;
use Illuminate\Support\Facades\DB;

/** Branch against branch: what each makes in sales over the window, against the window before. */
class BranchPack implements InsightPack
{
    public function key(): string { return 'branch.compare'; }

    public function title(): string { return 'How do the branches compare?'; }

    public function module(): ?string { return null; }

    public function permission(): string { return 'books.view'; }

    public function contexts(): array { return ['branches']; }

    public function applies(array $context): bool { return true; }

    public function answer(array $context, Lookback $lb, User $user, int $example = 0): array
    {
        $b = LoyaltyData::baseCode();
        $days = max(1, (int) $lb->from->diffInDays($lb->to) + 1);
        $pf = $lb->from->copy()->subDays($days); $pt = $lb->from->copy()->subDay();
        $q = fn ($from, $to) => RestatedBase::join(DB::table('vouchers as v')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id'))->leftJoin('locations as l', 'l.id', '=', 'v.location_id')
            ->where('v.status', 'posted')->whereIn('t.base_type', ['sales', 'cash_sale'])->whereBetween('v.date', [$from->toDateString(), $to->toDateString()])
            ->groupBy('v.location_id', 'l.name')->selectRaw('v.location_id as id, COALESCE(l.name, \'No branch\') as name, COUNT(*) as n, COALESCE(SUM(' . RestatedBase::total('v', 'cu') . '),0) as total')->get()->keyBy('id');
        $now = $q($lb->from, $lb->to); $prev = $q($pf, $pt);
        if ($now->isEmpty() && $prev->isEmpty()) {
            return ['title' => 'Branches', 'blocks' => [['type' => 'note', 'text' => 'No sales in this window or the one before.']], 'basis' => 'Read from sales.'];
        }
        $tot = (float) $now->sum('total');
        $rows = $now->sortByDesc('total')->map(function ($r) use ($prev, $tot) {
            $p = (float) ($prev[$r->id]->total ?? 0);

            return [$r->name, (string) $r->n, number_format((float) $r->total, 2), $tot > 0 ? number_format($r->total / $tot * 100, 1) . '%' : '—', number_format($r->n ? $r->total / $r->n : 0, 2), $p > 0 ? (($r->total >= $p ? '+' : '') . number_format(($r->total - $p) / $p * 100, 1) . '%') : 'new'];
        })->values()->all();
        $blocks = [['type' => 'table', 'title' => $lb->label() . ' against the ' . $days . ' days before', 'columns' => ['Branch', 'Sales', 'Revenue (' . $b . ')', 'Share', 'Average sale', 'Change'], 'rows' => $rows]];
        if ($now->count() > 1) {
            $top = $now->sortByDesc('total')->first(); $low = $now->sortBy('total')->first();
            $blocks[] = ['type' => 'verdict', 'tone' => 'info', 'text' => $top->name . ' leads with ' . number_format($top->total / max($tot, 0.01) * 100, 0) . '% of sales; ' . $low->name . ' is smallest at ' . number_format($low->total / max($tot, 0.01) * 100, 0) . '%. ' . ($top->total > 0 && $low->total > 0 ? $top->name . ' makes ' . number_format($top->total / $low->total, 1) . '× what ' . $low->name . ' does.' : '')];
        }

        return ['title' => 'Branches', 'blocks' => $blocks, 'basis' => 'Read from sales and cash sales by branch. Costs are not split by branch here, so this is revenue, not profit.'];
    }
}
