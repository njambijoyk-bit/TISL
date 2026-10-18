<?php

namespace App\Services\Menus;

use App\Models\Menus\Tip;
use App\Models\Menus\TipEvent;
use Illuminate\Support\Facades\DB;

/**
 * The tips report (Menus, Tips, Report): for a period, and a branch if one is chosen, what was taken, what was handed over (and to whom), what is still waiting and how long the oldest has waited, who
 * the guests' tips were for (by who served), and every hand-over and take-back with who did it. A tip belongs to the day it was taken; a hand-over to the day it was made; a tip that was taken back
 * and handed over again counts once, as handed over, and its history shows both.
 */
class TipsReport
{
    /** @return array<string, mixed> */
    public function build(string $from, string $to, ?int $locationId = null): array
    {
        if (! Tip::installed()) {
            return ['ready' => false, 'from' => $from, 'to' => $to];
        }
        $scope = fn ($q) => $locationId ? $q->where('location_id', $locationId) : $q;
        $taken = $scope(Tip::query())->whereDate('created_at', '>=', $from)->whereDate('created_at', '<=', $to)->get();
        $handed = $scope(Tip::query())->where('status', Tip::ISSUED)->whereDate('issued_at', '>=', $from)->whereDate('issued_at', '<=', $to)->get();
        $waiting = $scope(Tip::query())->where('status', Tip::PENDING)->orderBy('created_at')->get();
        $events = TipEvent::query()->whereIn('tip_id', $scope(Tip::query())->select('id'))->whereDate('done_at', '>=', $from)->whereDate('done_at', '<=', $to)->orderByDesc('id')->get();
        $names = DB::table('users')->whereIn('id', $taken->pluck('served_by')->merge($handed->pluck('issued_to'))->merge($events->pluck('done_by'))->merge($events->pluck('to_user_id'))->filter()->unique()->all())->pluck('name', 'id');
        $reversed = $events->where('kind', TipEvent::REVERSED);

        $days = [];
        foreach ($taken as $t) {
            $d = $t->created_at->toDateString();
            $days[$d] ??= ['date' => $d, 'taken' => 0.0, 'tips' => 0, 'handed_over' => 0.0];
            $days[$d]['taken'] += (float) $t->amount;
            $days[$d]['tips']++;
        }
        foreach ($handed as $t) {
            $d = $t->issued_at->toDateString();
            $days[$d] ??= ['date' => $d, 'taken' => 0.0, 'tips' => 0, 'handed_over' => 0.0];
            $days[$d]['handed_over'] += (float) $t->amount;
        }
        ksort($days);

        $group = function ($rows, callable $name) {
            $out = [];
            foreach ($rows as $t) {
                $n = $name($t);
                $out[$n] ??= ['name' => $n, 'tips' => 0, 'amount' => 0.0];
                $out[$n]['tips']++;
                $out[$n]['amount'] += (float) $t->amount;
            }

            return collect($out)->map(fn ($r) => ['amount' => round($r['amount'], 2)] + $r)->sortByDesc('amount')->values()->all();
        };

        return [
            'ready' => true, 'from' => $from, 'to' => $to,
            'totals' => ['taken' => round((float) $taken->sum('amount'), 2), 'tips' => $taken->count(), 'handed_over' => round((float) $handed->sum('amount'), 2), 'handed_over_tips' => $handed->count(),
                'waiting' => round((float) $waiting->sum('amount'), 2), 'waiting_tips' => $waiting->count(), 'oldest_waiting_days' => $waiting->isEmpty() ? null : (int) $waiting->first()->created_at->startOfDay()->diffInDays(now()->startOfDay()),
                'taken_back' => round((float) $reversed->sum('amount'), 2), 'taken_back_times' => $reversed->count()],
            'by_day' => array_values(array_map(fn ($d) => ['taken' => round($d['taken'], 2), 'handed_over' => round($d['handed_over'], 2)] + $d, $days)),
            'by_server' => $group($taken, fn ($t) => $names[$t->served_by] ?? 'Not recorded'),
            'by_recipient' => $group($handed, fn ($t) => $t->issued_to_name ?: ($names[$t->issued_to] ?? 'Not recorded')),
            'history' => $events->take(100)->map(fn ($e) => ['kind' => $e->kind, 'amount' => (float) $e->amount, 'at' => $e->done_at?->toIso8601String(), 'by' => $names[$e->done_by] ?? null,
                'to' => $e->to_name ?: ($names[$e->to_user_id] ?? null), 'note' => $e->narration, 'journal_id' => $e->voucher_id])->values()->all(),
        ];
    }
}
