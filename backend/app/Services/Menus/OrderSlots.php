<?php

namespace App\Services\Menus;

use App\Models\Menus\Channel;
use App\Models\Menus\Menu;
use Illuminate\Support\Carbon;

/**
 * When can a customer have their order? Not before the kitchen could make it (now + preparation), then on every step of the channel's gap, for as many days as it allows, and only at
 * times when one of the channel's menus is being served.
 */
class OrderSlots
{
    /** Menus a channel shows. @return \Illuminate\Support\Collection<int, Menu> */
    public function menus(Channel $c)
    {
        return Menu::where('is_active', true)->when($c->menu_ids, fn ($q) => $q->whereIn('id', $c->menu_ids))->get();
    }

    /** The earliest time an order can be ready: now plus preparation, up to the next step. */
    public function earliest(Channel $c, Carbon $now): Carbon
    {
        $step = max(1, $c->slot_minutes);
        $t = $now->copy()->addMinutes($c->prep_minutes);
        $exact = $t->second === 0 && ($t->hour * 60 + $t->minute) % $step === 0;
        $t->second(0)->microsecond(0);
        if ($exact) {
            return $t;
        }

        return $t->addMinutes($step - (($t->hour * 60 + $t->minute) % $step));
    }

    /** Is any of these menus being served at this moment? */
    public function served($menus, Carbon $at): bool
    {
        return $menus->contains(fn (Menu $m) => MenuSchedule::serving($m, $at));
    }

    /**
     * @return array{asap: ?string, slots: array<int, string>} the earliest time if "as soon as possible" is on and something is served then, and every time that can be chosen (ISO, the shop's time zone)
     */
    public function forChannel(Channel $c, Carbon $now, int $limit = 400): array
    {
        $menus = $this->menus($c);
        $first = $this->earliest($c, $now);
        $out = [];
        $end = $now->copy()->addDays($c->max_days_ahead)->endOfDay();
        for ($t = $first->copy(); $t->lte($end) && count($out) < $limit; $t->addMinutes(max(5, $c->slot_minutes))) {
            if ($this->served($menus, $t)) {
                $out[] = $t->toIso8601String();
            }
        }

        return ['asap' => $c->allow_asap && $this->served($menus, $first) ? $first->toIso8601String() : null, 'slots' => $out];
    }

    /** Is this exact time one the customer may choose? */
    public function allows(Channel $c, Carbon $now, Carbon $at): bool
    {
        if ($at->lt($this->earliest($c, $now)) || $at->gt($now->copy()->addDays($c->max_days_ahead)->endOfDay())) {
            return false;
        }
        if ((($at->hour * 60 + $at->minute) % max(5, $c->slot_minutes)) !== 0 || $at->second !== 0) {
            return false;
        }

        return $this->served($this->menus($c), $at);
    }
}
