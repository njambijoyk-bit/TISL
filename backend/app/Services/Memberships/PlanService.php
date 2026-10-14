<?php

namespace App\Services\Memberships;

use App\Models\Location;
use App\Models\Memberships\Plan;
use App\Models\Memberships\PlanBenefit;
use App\Services\Books\BooksException;
use App\Services\Books\TradingAccounts;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/** Membership plans: what each costs per period, the joining fee, trial and grace, the branches it covers and the benefits it gives. */
class PlanService
{
    private const MAX_COUNT = ['day' => 730, 'week' => 104, 'month' => 60, 'year' => 10];

    public function __construct(private MembershipBenefits $benefits)
    {
    }

    public static function installed(): bool
    {
        return Schema::hasTable('membership_plans') && Schema::hasTable('membership_plan_benefits');
    }

    private function members(Plan $p): int
    {
        return Schema::hasTable('memberships') ? (int) DB::table('memberships')->where('plan_id', $p->id)->whereNotIn('status', ['cancelled', 'ended', 'lapsed'])->count() : 0;
    }

    /** @return array<string, mixed> */
    public function row(Plan $p, bool $withBenefits = true): array
    {
        $out = ['id' => $p->id, 'name' => $p->name, 'slug' => $p->slug, 'summary' => $p->summary, 'description' => $p->description, 'cover' => $p->cover, 'period_unit' => $p->period_unit, 'period_count' => $p->period_count,
            'period_label' => $this->periodLabel($p), 'price' => (float) $p->price, 'joining_fee' => (float) $p->joining_fee, 'ledger_id' => $p->ledger_id, 'joining_ledger_id' => $p->joining_ledger_id, 'trial_days' => $p->trial_days, 'grace_days' => $p->grace_days,
            'auto_renew' => (bool) $p->auto_renew, 'capacity' => $p->capacity, 'all_branches' => (bool) $p->all_branches, 'branch_ids' => $p->branch_ids ?? [], 'status' => $p->status, 'status_label' => Plan::STATUSES[$p->status] ?? $p->status,
            'sort_order' => $p->sort_order, 'members' => $this->members($p)];
        if ($withBenefits) {
            $out['benefits'] = $p->benefits->map(fn (PlanBenefit $b) => ['id' => $b->id, 'type' => $b->type, 'label' => $this->benefits->label($b->type), 'config' => $b->config ?? [], 'description' => $this->benefits->describe($b->type, $b->config ?? []), 'available' => $this->benefits->has($b->type)])->values()->all();
        }

        return $out;
    }

    /** The end (not included) of a period of this plan that starts on $from. */
    public static function periodEnd(\Illuminate\Support\Carbon $from, Plan $p): \Illuminate\Support\Carbon
    {
        $n = max(1, (int) $p->period_count);
        $f = $from->copy()->startOfDay();

        return match ($p->period_unit) {
            'day' => $f->addDays($n),
            'week' => $f->addWeeks($n),
            'year' => $f->addYearsNoOverflow($n),
            default => $f->addMonthsNoOverflow($n),
        };
    }

    public function periodLabel(Plan $p): string
    {
        $n = (int) $p->period_count;
        if ($n === 1) {
            return ['day' => 'daily', 'week' => 'weekly', 'month' => 'monthly', 'year' => 'yearly'][$p->period_unit] ?? $p->period_unit;
        }
        if ($p->period_unit === 'month' && $n === 3) {
            return 'quarterly';
        }

        return "every {$n} {$p->period_unit}s";
    }

    /** @return array<int, array<string, mixed>> */
    public function list(?string $status = null, ?string $q = null): array
    {
        if (! self::installed()) {
            return [];
        }
        $rows = Plan::with('benefits')->when($status, fn ($w) => $w->where('status', $status))->when($q, fn ($w) => $w->where('name', 'like', '%'.str_replace(['%', '_'], ['\\%', '\\_'], trim($q)).'%'))->orderBy('sort_order')->orderBy('name')->get();

        return $rows->map(fn (Plan $p) => $this->row($p))->all();
    }

    private function slug(string $name): string
    {
        $base = Str::slug($name) ?: 'plan';
        $slug = $base;
        for ($i = 2; in_array($slug, ['join', 'my', 'plans'], true) || Plan::where('slug', $slug)->exists(); $i++) {
            $slug = "{$base}-{$i}";
        }

        return $slug;
    }

    private function money(mixed $v, string $what): float
    {
        $n = round((float) $v, 2);
        if ($n < 0 || $n > 10000000) {
            throw new BooksException("Give a {$what} between 0 and 10,000,000.");
        }

        return $n;
    }

    /**
     * @param array<string, mixed> $d
     */
    public function save(array $d, ?Plan $p = null, ?int $by = null): Plan
    {
        if (! self::installed()) {
            throw new BooksException('Run database script 162_memberships.sql first.');
        }
        $new = ! $p;
        $p ??= new Plan(['status' => 'draft', 'created_by' => $by]);
        $get = fn (string $k, $default = null) => array_key_exists($k, $d) ? $d[$k] : ($p->exists ? $p->{$k} : $default);
        $name = trim((string) $get('name', ''));
        if ($name === '' || mb_strlen($name) > 120) {
            throw new BooksException('Give the plan a name of up to 120 letters.');
        }
        $unit = (string) $get('period_unit', 'month');
        if (! isset(Plan::UNITS[$unit])) {
            throw new BooksException('Choose day, week, month or year.');
        }
        $count = (int) $get('period_count', 1);
        if ($count < 1 || $count > self::MAX_COUNT[$unit]) {
            throw new BooksException('A period is 1 to '.self::MAX_COUNT[$unit]." {$unit}s.");
        }
        $price = $this->money($get('price', 0), 'price');
        $fee = $this->money($get('joining_fee', 0), 'joining fee');
        $ledger = $get('ledger_id') ? (int) $get('ledger_id') : null;
        $joinLedger = $get('joining_ledger_id') ? (int) $get('joining_ledger_id') : null;
        if (($price > 0 || ($fee > 0 && ! $joinLedger)) && ! $ledger) {
            throw new BooksException('Choose the sales account the membership is booked under.');
        }
        foreach (array_filter([$ledger, $joinLedger]) as $l) {
            if (($problem = TradingAccounts::problem($l, 'sales', 'service')) && TradingAccounts::problem($l, 'sales', 'product')) {
                throw new BooksException($problem);
            }
        }
        $trial = (int) $get('trial_days', 0);
        $grace = (int) $get('grace_days', 7);
        if ($trial < 0 || $trial > 365 || $grace < 0 || $grace > 90) {
            throw new BooksException('A trial is up to 365 days and the grace period up to 90 days.');
        }
        $cap = $get('capacity');
        $cap = $cap === null || $cap === '' ? null : (int) $cap;
        if ($cap !== null && $cap < 1) {
            throw new BooksException('The most members is 1 or more (or empty for no limit).');
        }
        if ($cap !== null && $p->exists && $cap < $this->members($p)) {
            throw new BooksException('There are more members on this plan than that.');
        }
        $all = (bool) $get('all_branches', true);
        $branches = array_values(array_unique(array_map('intval', (array) ($get('branch_ids') ?? []))));
        if ($all) {
            $branches = [];
        } elseif (! $branches || Location::whereIn('id', $branches)->count() !== count($branches)) {
            throw new BooksException('Choose the branches this plan covers, or tick all branches.');
        }
        $text = function (string $k, int $max) use ($d, $p) {
            if (! array_key_exists($k, $d)) {
                return $p->{$k};
            }
            $v = trim((string) $d[$k]);

            return $v === '' ? null : mb_substr($v, 0, $max);
        };

        return DB::transaction(function () use ($new, $p, $d, $name, $unit, $count, $price, $fee, $ledger, $joinLedger, $trial, $grace, $cap, $all, $branches, $text, $get) {
            $p->fill(['name' => $name, 'summary' => $text('summary', 300), 'description' => $text('description', 20000), 'cover' => $text('cover', 255), 'period_unit' => $unit, 'period_count' => $count, 'price' => $price, 'joining_fee' => $fee,
                'ledger_id' => $ledger, 'joining_ledger_id' => $joinLedger, 'trial_days' => $trial, 'grace_days' => $grace, 'auto_renew' => (bool) $get('auto_renew', true), 'capacity' => $cap, 'all_branches' => $all, 'branch_ids' => $branches ?: null,
                'sort_order' => (int) $get('sort_order', 0)]);
            if ($new) {
                $p->slug = $this->slug($name);
            }
            $p->save();
            if (array_key_exists('benefits', $d)) {
                $this->setBenefits($p, (array) $d['benefits']);
            }

            return $p->fresh('benefits');
        });
    }

    /** Replace the plan's benefits. One of each type. @param array<int, array{type?: mixed, config?: mixed}> $items */
    public function setBenefits(Plan $p, array $items): Plan
    {
        if (count($items) > 12) {
            throw new BooksException('A plan gives up to 12 benefits.');
        }
        $clean = [];
        foreach ($items as $i) {
            $type = (string) ($i['type'] ?? '');
            if (isset($clean[$type])) {
                throw new BooksException('A plan has one benefit of each kind: put the settings together.');
            }
            $clean[$type] = $this->benefits->validate($type, (array) ($i['config'] ?? []));
        }
        DB::transaction(function () use ($p, $clean) {
            PlanBenefit::where('plan_id', $p->id)->delete();
            $n = 0;
            foreach ($clean as $type => $config) {
                PlanBenefit::create(['plan_id' => $p->id, 'type' => $type, 'config' => $config, 'sort_order' => $n += 10]);
            }
        });

        return $p->fresh('benefits');
    }

    public function publish(Plan $p): Plan
    {
        if ($p->status === 'published') {
            throw new BooksException('It is published already.');
        }
        if (((float) $p->price > 0 || (float) $p->joining_fee > 0) && ! $p->ledger_id) {
            throw new BooksException('Choose the sales account before publishing.');
        }
        $p->update(['status' => 'published']);

        return $p->fresh('benefits');
    }

    public function unpublish(Plan $p): Plan
    {
        if ($p->status !== 'published') {
            throw new BooksException('Only a published plan can be taken back to draft.');
        }
        if ($this->members($p) > 0) {
            throw new BooksException('Members hold this plan: archive it instead, which stops new members and keeps the current ones.');
        }
        $p->update(['status' => 'draft']);

        return $p->fresh('benefits');
    }

    public function archive(Plan $p): Plan
    {
        $p->update(['status' => 'archived']);

        return $p->fresh('benefits');
    }

    public function restore(Plan $p): Plan
    {
        if ($p->status !== 'archived') {
            throw new BooksException('Only an archived plan can be restored.');
        }
        $p->update(['status' => 'draft']);

        return $p->fresh('benefits');
    }

    public function delete(Plan $p): void
    {
        if (Schema::hasTable('memberships') && DB::table('memberships')->where('plan_id', $p->id)->exists()) {
            throw new BooksException('This plan has had members: archive it instead.');
        }
        DB::transaction(function () use ($p) {
            PlanBenefit::where('plan_id', $p->id)->delete();
            $p->delete();
        });
    }
}
