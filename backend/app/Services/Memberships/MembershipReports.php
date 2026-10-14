<?php

namespace App\Services\Memberships;

use App\Models\Location;
use App\Models\Memberships\Checkin;
use App\Models\Memberships\CreditEntry;
use App\Models\Memberships\Membership;
use App\Models\Memberships\MembershipEvent;
use App\Models\Memberships\Period;
use App\Models\Memberships\Plan;
use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Memberships in numbers: who is a member now and on which plan, the money that recurs each month, who joined and who left in a period, what was invoiced and collected, who is late,
 * whose membership ends soon, check-ins and credits. Read-only. Money figures from plans are before tax; money from invoices is the invoice total (tax included).
 */
class MembershipReports
{
    private const LEFT = ['cancelled', 'ended', 'lapsed', 'refunded'];

    public function __construct(private PlanService $plans)
    {
    }

    private function tz(): string
    {
        return (string) config('app.timezone', 'Africa/Nairobi');
    }

    /** @return array{0: Carbon, 1: Carbon} the range, whole days, the end included */
    public function range(?string $from, ?string $to): array
    {
        try {
            $t = $to ? Carbon::parse($to, $this->tz())->endOfDay() : Carbon::now($this->tz())->endOfDay();
            $f = $from ? Carbon::parse($from, $this->tz())->startOfDay() : $t->copy()->subDays(29)->startOfDay();
        } catch (\Throwable) {
            throw new BooksException('Choose valid dates.');
        }
        if ($f->gt($t)) {
            throw new BooksException('The start must be on or before the end.');
        }
        if ($f->diffInDays($t) > 731) {
            throw new BooksException('Choose at most two years.');
        }

        return [$f, $t];
    }

    /** What a plan brings in a month, before tax: a month is a twelfth of a year (30.44 days) for plans counted in days or weeks. */
    public function monthly(Plan $p): float
    {
        $n = max(1, (int) $p->period_count);
        $price = (float) $p->price;

        return round(match ($p->period_unit) {
            'day' => $price * 30.4375 / $n,
            'week' => $price * 30.4375 / 7 / $n,
            'year' => $price / 12 / $n,
            default => $price / $n,
        }, 2);
    }

    /** @return array<string, mixed> */
    public function summary(?string $from = null, ?string $to = null, ?int $planId = null): array
    {
        [$f, $t] = $this->range($from, $to);
        $plans = Plan::orderBy('name')->get()->keyBy('id');
        $scope = fn ($q) => $q->when($planId, fn ($w) => $w->where('plan_id', $planId));

        // now
        $live = $scope(Membership::query())->whereIn('status', Membership::LIVE)->get();
        $good = $live->whereIn('status', Membership::GOOD);
        $byStatus = collect(Membership::STATUSES)->map(fn ($label, $k) => ['status' => $k, 'label' => $label, 'count' => $live->where('status', $k)->count()])->filter(fn ($r) => $r['count'] > 0)->values()->all();
        $byPlan = $good->groupBy('plan_id')->map(function ($g, $pid) use ($plans) {
            $p = $plans[$pid] ?? null;
            $billed = $g->where('billing', 'invoice')->count();

            return ['plan_id' => (int) $pid, 'plan' => $p?->name ?? '?', 'period_label' => $p ? $this->plans->periodLabel($p) : null, 'members' => $g->count(), 'on_trial' => $g->where('status', 'trial')->count(),
                'late' => $g->where('status', 'past_due')->count(), 'given' => $g->where('billing', 'none')->count(), 'mrr' => $p ? round($this->monthly($p) * $billed, 2) : 0.0];
        })->sortByDesc('members')->values();

        // in the range
        $new = $scope(Membership::query())->whereBetween('started_on', [$f->toDateString(), $t->toDateString()])->count();
        $leftIds = MembershipEvent::whereIn('type', self::LEFT)->whereBetween('created_at', [$f, $t])->whereIn('membership_id', $scope(Membership::query())->select('id'))->distinct()->pluck('membership_id');
        $left = $leftIds->count();
        $atStart = max(0, $good->count() - $new + $left);
        $periods = Period::whereIn('membership_id', $scope(Membership::query())->select('id'));
        $invoiced = (float) (clone $periods)->whereBetween('invoiced_at', [$f, $t])->whereNotIn('status', ['void'])->sum('amount');
        $collected = (float) (clone $periods)->whereBetween('paid_at', [$f, $t])->sum('paid_amount');
        $refunded = (float) (clone $periods)->where('status', 'refunded')->whereBetween('updated_at', [$f, $t])->sum('amount');
        $owing = (clone $periods)->where('status', 'open')->get()->sum(fn (Period $p) => $p->owing());

        // the last six months, joined and left
        $trend = [];
        $start = Carbon::now($this->tz())->startOfMonth()->subMonths(5);
        for ($i = 0; $i < 6; $i++) {
            $a = $start->copy()->addMonths($i);
            $b = $a->copy()->endOfMonth();
            $trend[] = ['month' => $a->format('M Y'), 'joined' => $scope(Membership::query())->whereBetween('started_on', [$a->toDateString(), $b->toDateString()])->count(),
                'left' => MembershipEvent::whereIn('type', self::LEFT)->whereBetween('created_at', [$a, $b])->whereIn('membership_id', $scope(Membership::query())->select('id'))->distinct()->count('membership_id')];
        }

        return ['from' => $f->toDateString(), 'to' => $t->toDateString(), 'plan_id' => $planId, 'plans' => $plans->map(fn (Plan $p) => ['id' => $p->id, 'name' => $p->name])->values(),
            'now' => ['members' => $good->count(), 'mrr' => round($byPlan->sum('mrr'), 2), 'arpm' => $good->where('billing', 'invoice')->count() ? round($byPlan->sum('mrr') / $good->where('billing', 'invoice')->count(), 2) : 0.0,
                'by_status' => $byStatus, 'by_plan' => $byPlan->all(), 'owing' => round($owing, 2)],
            'range' => ['new' => $new, 'left' => $left, 'churn_pct' => $atStart > 0 ? round($left * 100 / $atStart, 1) : null, 'invoiced' => round($invoiced, 2), 'collected' => round($collected, 2), 'refunded' => round($refunded, 2)],
            'trend' => $trend, 'late' => $this->late($planId), 'ending' => $this->ending($planId), 'checkins' => $this->checkins($f, $t), 'credits' => $this->credits($f, $t)];
    }

    /** @return array<int, array<string, mixed>> members whose payment is late or who lapsed, with what they owe */
    private function late(?int $planId): array
    {
        $rows = Membership::whereIn('status', ['past_due', 'lapsed'])->when($planId, fn ($w) => $w->where('plan_id', $planId))->orderBy('paid_until')->limit(100)->get();
        $names = User::whereIn('id', $rows->pluck('member_user_id'))->pluck('name', 'id');
        $plans = Plan::whereIn('id', $rows->pluck('plan_id'))->pluck('name', 'id');
        $open = Period::whereIn('membership_id', $rows->pluck('id'))->where('status', 'open')->get()->groupBy('membership_id');

        return $rows->map(fn (Membership $m) => ['id' => $m->id, 'number' => $m->number, 'member' => $names[$m->member_user_id] ?? '?', 'plan' => $plans[$m->plan_id] ?? '?', 'status' => $m->status, 'status_label' => Membership::STATUSES[$m->status] ?? $m->status,
            'since' => $m->paid_until?->toDateString(), 'owing' => round(($open[$m->id] ?? collect())->sum(fn (Period $p) => $p->owing()), 2)])->values()->all();
    }

    /** @return array<int, array<string, mixed>> memberships that end within 14 days and will not renew (cancelled at the end, given for a time, or a plan that does not renew) */
    private function ending(?int $planId): array
    {
        $until = Carbon::now($this->tz())->addDays(14)->toDateString();
        $noRenew = Plan::where('auto_renew', false)->pluck('id');
        $rows = Membership::whereIn('status', Membership::GOOD)->when($planId, fn ($w) => $w->where('plan_id', $planId))->whereNotNull('paid_until')->where('paid_until', '<=', $until)
            ->where(fn ($w) => $w->where('cancel_at_end', true)->orWhere('billing', 'none')->orWhereIn('plan_id', $noRenew))->orderBy('paid_until')->limit(100)->get();
        $names = User::whereIn('id', $rows->pluck('member_user_id'))->pluck('name', 'id');
        $plans = Plan::whereIn('id', $rows->pluck('plan_id'))->pluck('name', 'id');

        return $rows->map(fn (Membership $m) => ['id' => $m->id, 'number' => $m->number, 'member' => $names[$m->member_user_id] ?? '?', 'plan' => $plans[$m->plan_id] ?? '?', 'last_day' => $m->paid_until?->copy()->subDay()->toDateString(),
            'why' => $m->cancel_at_end ? 'Cancelled' : ($m->billing === 'none' ? 'Given for a time' : 'Plan does not renew')])->values()->all();
    }

    /** @return array<string, mixed>|null */
    private function checkins(Carbon $f, Carbon $t): ?array
    {
        if (! MemberCheckIn::installed()) {
            return null;
        }
        $q = Checkin::whereBetween('created_at', [$f, $t]);
        $branches = Location::pluck('name', 'id');

        return ['visits' => (clone $q)->where('result', 'ok')->count(), 'people' => (clone $q)->where('result', 'ok')->distinct()->count('user_id'), 'turned_away' => (clone $q)->where('result', 'denied')->count(),
            'by_branch' => (clone $q)->where('result', 'ok')->select('location_id', DB::raw('count(*) as n'))->groupBy('location_id')->orderByDesc('n')->get()->map(fn ($r) => ['branch' => $branches[$r->location_id] ?? 'No branch', 'visits' => (int) $r->n])->values()->all()];
    }

    /** @return array<string, int>|null */
    private function credits(Carbon $f, Carbon $t): ?array
    {
        if (! Credits::installed()) {
            return null;
        }
        $q = CreditEntry::whereBetween('created_at', [$f, $t]);

        return ['granted' => (int) (clone $q)->whereIn('kind', ['grant'])->sum('delta') + (int) (clone $q)->where('kind', 'adjust')->where('delta', '>', 0)->sum('delta'), 'spent' => -(int) (clone $q)->where('kind', 'spend')->sum('delta'),
            'given_back' => (int) (clone $q)->where('kind', 'refund')->sum('delta'), 'expired' => -(int) (clone $q)->where('kind', 'expire')->sum('delta')];
    }

    /** The members list as CSV rows (for a spreadsheet). @return array<int, array<int, string|float|int|null>> */
    public function csv(?int $planId = null, ?string $status = null): array
    {
        $rows = [['Number', 'Member', 'Email', 'Plan', 'Status', 'Billing', 'Started', 'Paid up to', 'Ends at period end', 'Owing']];
        $q = Membership::query()->when($planId, fn ($w) => $w->where('plan_id', $planId))->when($status, fn ($w) => $w->where('status', $status))->orderBy('id');
        $plans = Plan::pluck('name', 'id');
        foreach ($q->cursor() as $m) {
            $u = User::find($m->member_user_id);
            $owing = Period::where('membership_id', $m->id)->where('status', 'open')->get()->sum(fn (Period $p) => $p->owing());
            $rows[] = [$m->number, $u?->name, $u?->email, $plans[$m->plan_id] ?? '', Membership::STATUSES[$m->status] ?? $m->status, $m->billing, $m->started_on?->toDateString(), $m->paid_until?->copy()->subDay()->toDateString(),
                $m->cancel_at_end ? 'yes' : 'no', round($owing, 2)];
        }

        return $rows;
    }
}
