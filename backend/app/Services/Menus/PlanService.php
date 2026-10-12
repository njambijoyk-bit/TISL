<?php

namespace App\Services\Menus;

use App\Models\Location;
use App\Models\Menus\Dish;
use App\Models\Menus\Plan;
use App\Models\Menus\PlanDay;
use App\Models\Menus\Subscription;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Meal plans, the shop's side: a plan has a name, a price for each delivery day, the weekdays it delivers, how long its menu takes to come round (1 to 4 weeks) and how late a day may be skipped;
 * its menu says which dishes go out on each weekday of each week. Plans with subscribers can be switched off but not deleted, so nobody's paid weeks lose their meaning.
 */
class PlanService
{
    public static function installed(): bool
    {
        return Schema::hasTable('menus_plans') && Schema::hasTable('menus_plan_days') && Schema::hasTable('menus_subscriptions');
    }

    /**
     * @param array{name?: mixed, description?: mixed, photo?: mixed, location_id?: mixed, cycle_weeks?: mixed, day_price?: mixed, delivery_weekdays?: mixed, min_days?: mixed, cutoff_hours?: mixed, slot_from?: mixed, slot_to?: mixed, is_active?: mixed, sort_order?: mixed} $d
     */
    public function save(array $d, ?Plan $plan = null, ?int $by = null): Plan
    {
        $name = trim((string) ($d['name'] ?? $plan?->name ?? ''));
        if ($name === '' || mb_strlen($name) > 120) {
            throw new BooksException('Give the plan a name of up to 120 letters.');
        }
        $loc = Location::find((int) ($d['location_id'] ?? $plan?->location_id ?? 0));
        if (! $loc) {
            throw new BooksException('Choose the kitchen that cooks it.');
        }
        $cycle = (int) ($d['cycle_weeks'] ?? $plan?->cycle_weeks ?? 1);
        if ($cycle < 1 || $cycle > 4) {
            throw new BooksException('The menu repeats after 1 to 4 weeks.');
        }
        $price = round((float) ($d['day_price'] ?? $plan?->day_price ?? 0), 2);
        if ($price <= 0 || $price > 10000000) {
            throw new BooksException('Give the price for each delivery day.');
        }
        $days = array_values(array_unique(array_map('intval', is_array($d['delivery_weekdays'] ?? null) ? $d['delivery_weekdays'] : explode(',', (string) ($d['delivery_weekdays'] ?? $plan?->delivery_weekdays ?? '')))));
        if (! $days || array_diff($days, [1, 2, 3, 4, 5, 6, 7])) {
            throw new BooksException('Choose the days of the week the plan delivers.');
        }
        sort($days);
        $min = (int) ($d['min_days'] ?? $plan?->min_days ?? 1);
        if ($min < 1 || $min > count($days)) {
            throw new BooksException('The fewest delivery days a week is between 1 and the number of days the plan delivers.');
        }
        $cut = (int) ($d['cutoff_hours'] ?? $plan?->cutoff_hours ?? 24);
        if ($cut < 6 || $cut > 168) {
            throw new BooksException('A day can be skipped up to 6 to 168 hours before it.');
        }
        $from = substr(trim((string) ($d['slot_from'] ?? $plan?->slot_from ?? '12:00')), 0, 5);
        $to = substr(trim((string) ($d['slot_to'] ?? $plan?->slot_to ?? '14:00')), 0, 5);
        foreach ([$from, $to] as $t) {
            if (! preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $t)) {
                throw new BooksException('Enter the delivery window like 12:00 and 14:00.');
            }
        }
        if ($to <= $from) {
            throw new BooksException('The delivery window must end after it starts.');
        }
        $row = ['name' => $name, 'location_id' => $loc->id, 'cycle_weeks' => $cycle, 'day_price' => $price, 'delivery_weekdays' => implode(',', $days), 'min_days' => $min, 'cutoff_hours' => $cut,
            'slot_from' => $from, 'slot_to' => $to];
        if (MembershipRules::columns() && (array_key_exists('requires_membership', $d) || array_key_exists('membership_plan_ids', $d))) {
            $row['requires_membership'] = (bool) ($d['requires_membership'] ?? $plan?->requires_membership ?? false);
            $ids = array_values(array_unique(array_map('intval', (array) ($d['membership_plan_ids'] ?? $plan?->membership_plan_ids ?? []))));
            if ($ids && \Illuminate\Support\Facades\Schema::hasTable('membership_plans') && \App\Models\Memberships\Plan::whereIn('id', $ids)->count() !== count($ids)) {
                throw new BooksException('Choose membership plans that exist.');
            }
            $row['membership_plan_ids'] = $ids ?: null;
        }
        foreach (['description' => 3000, 'photo' => 255] as $k => $max) {
            if (array_key_exists($k, $d)) {
                $v = trim((string) $d[$k]);
                $row[$k] = $v === '' ? null : mb_substr($v, 0, $max);
            }
        }
        if (array_key_exists('is_active', $d)) {
            $row['is_active'] = (bool) $d['is_active'];
        }
        if (array_key_exists('sort_order', $d)) {
            $row['sort_order'] = (int) $d['sort_order'];
        }
        $plan ??= new Plan(['created_by' => $by, 'slug' => $this->slug($name)]);
        $plan->fill($row)->save();

        return $plan->fresh();
    }

    private function slug(string $name): string
    {
        $base = Str::slug($name) ?: 'plan';
        $slug = $base;
        for ($i = 2; Plan::where('slug', $slug)->exists(); $i++) {
            $slug = "{$base}-{$i}";
        }

        return $slug;
    }

    /**
     * Replace a plan's menu. Each entry is a weekday of a week of the rotation with the dishes that go out that day. A day with no dishes is not delivered that week.
     *
     * @param array<int, array{week_no?: mixed, weekday?: mixed, dish_ids?: mixed}> $grid
     */
    public function saveMenu(Plan $plan, array $grid): int
    {
        $rows = [];
        foreach ($grid as $cell) {
            $week = (int) ($cell['week_no'] ?? 0);
            $wd = (int) ($cell['weekday'] ?? 0);
            if ($week < 1 || $week > $plan->cycle_weeks) {
                throw new BooksException("Week {$week} is outside this plan's {$plan->cycle_weeks}-week menu.");
            }
            if (! in_array($wd, $plan->weekdays(), true)) {
                throw new BooksException('The plan does not deliver on '.(Plan::DAYS[$wd] ?? 'that day').'.');
            }
            $ids = array_values(array_unique(array_map('intval', (array) ($cell['dish_ids'] ?? []))));
            if (count($ids) > 8) {
                throw new BooksException('A day can have at most 8 dishes.');
            }
            if ($ids && Dish::whereIn('id', $ids)->where('is_active', true)->count() !== count($ids)) {
                throw new BooksException('One of the dishes does not exist or is switched off.');
            }
            foreach ($ids as $i => $id) {
                $rows[] = ['plan_id' => $plan->id, 'week_no' => $week, 'weekday' => $wd, 'dish_id' => $id, 'sort_order' => $i, 'created_at' => now(), 'updated_at' => now()];
            }
        }
        DB::transaction(function () use ($plan, $rows) {
            PlanDay::where('plan_id', $plan->id)->delete();
            if ($rows) {
                PlanDay::insert($rows);
            }
        });

        return count($rows);
    }

    /** A plan with subscribers is switched off, not removed. */
    public function delete(Plan $plan): void
    {
        if (Subscription::where('plan_id', $plan->id)->whereIn('status', ['pending', 'active', 'paused'])->exists()) {
            throw new BooksException('This plan has subscribers: switch it off to stop new ones, and cancel or let the current ones end first.');
        }
        DB::transaction(function () use ($plan) {
            PlanDay::where('plan_id', $plan->id)->delete();
            if (Subscription::where('plan_id', $plan->id)->exists()) {
                $plan->update(['is_active' => false]);   // past subscribers keep their history
            } else {
                $plan->delete();
            }
        });
    }

    /** @return array<int, array<string, mixed>> the plans with their menus (the dishes by week and weekday) */
    public function rows(?callable $scope = null, bool $activeOnly = false): array
    {
        if (! self::installed()) {
            return [];
        }
        $q = Plan::orderBy('sort_order')->orderBy('name')->when($activeOnly, fn ($x) => $x->where('is_active', true));
        if ($scope) {
            $scope($q);
        }
        $plans = $q->get();
        $days = PlanDay::whereIn('plan_id', $plans->pluck('id'))->orderBy('sort_order')->orderBy('id')->get()->groupBy('plan_id');
        $dishes = Dish::whereIn('id', PlanDay::whereIn('plan_id', $plans->pluck('id'))->pluck('dish_id'))->get()->keyBy('id');
        $subs = Subscription::whereIn('plan_id', $plans->pluck('id'))->whereIn('status', ['pending', 'active', 'paused'])->selectRaw('plan_id, count(*) as n')->groupBy('plan_id')->pluck('n', 'plan_id');

        return $plans->map(fn (Plan $p) => ['id' => $p->id, 'name' => $p->name, 'slug' => $p->slug, 'description' => $p->description, 'photo' => $p->photo, 'location_id' => $p->location_id, 'cycle_weeks' => $p->cycle_weeks,
            'day_price' => (float) $p->day_price, 'delivery_weekdays' => $p->weekdays(), 'min_days' => $p->min_days, 'cutoff_hours' => $p->cutoff_hours, 'slot_from' => substr((string) $p->slot_from, 0, 5), 'slot_to' => substr((string) $p->slot_to, 0, 5),
            'requires_membership' => MembershipRules::columns() ? (bool) $p->requires_membership : false, 'membership_plan_ids' => MembershipRules::columns() ? array_map('intval', (array) ($p->membership_plan_ids ?? [])) : [],
            'is_active' => $p->is_active, 'sort_order' => $p->sort_order, 'subscribers' => (int) ($subs[$p->id] ?? 0),
            'menu' => ($days[$p->id] ?? collect())->groupBy(fn ($d) => $d->week_no.'-'.$d->weekday)->map(fn ($g) => ['week_no' => (int) $g->first()->week_no, 'weekday' => (int) $g->first()->weekday,
                'dishes' => $g->map(fn ($d) => ['id' => $d->dish_id, 'name' => $dishes[$d->dish_id]->name ?? '?'])->values()->all()])->values()->all()])->values()->all();
    }
}
