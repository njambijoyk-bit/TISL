<?php

namespace App\Services\Menus;

use App\Models\Menus\Dish;
use App\Models\Menus\MenuOrder;
use App\Models\Menus\Station;
use App\Models\Menus\Ticket;
use App\Services\Books\BooksException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The kitchen screens. When an order may be started (paid, or to be paid on arrival) each dish goes to the station that makes it and every station gets one ticket for that order.
 * A chef starts and finishes tickets; the order moves to "preparing" with the first start and to "ready" (and the customer is told) when every ticket is ready.
 * An installation that has not run script 137 yet has no tickets at all and works as before (the orders board alone).
 */
class KitchenService
{
    private static ?bool $ready = null;

    public static function installed(): bool
    {
        if (app()->runningUnitTests()) {
            return Schema::hasTable('menus_tickets') && Schema::hasTable('menus_stations') && Schema::hasColumn('menus_order_lines', 'ticket_id');
        }

        return self::$ready ??= Schema::hasTable('menus_tickets') && Schema::hasTable('menus_stations') && Schema::hasColumn('menus_order_lines', 'ticket_id');
    }

    public function __construct(private DishInfo $info)
    {
    }

    /** The station that makes a dish at a branch: the one named on the dish if it is on and works there, else the branch's "everything else" station. */
    public function stationFor(?Dish $dish, int $locationId): ?Station
    {
        $works = fn ($q) => $q->where('is_active', true)->where(fn ($w) => $w->whereNull('location_id')->orWhere('location_id', $locationId));
        if ($dish?->station_id && ($s = Station::where('id', $dish->station_id)->where($works)->first())) {
            return $s;
        }

        return Station::where($works)->where('is_default', true)->orderByRaw('location_id IS NULL')->first();
    }

    /** Make the tickets for an order (once). @return int how many tickets */
    public function fire(MenuOrder $o): int
    {
        if (! self::installed() || Ticket::where('order_id', $o->id)->exists()) {
            return 0;
        }
        $o->loadMissing('lines');
        $groups = [];
        foreach ($o->lines as $line) {
            $station = $this->stationFor(Dish::find($line->dish_id), (int) $o->location_id);
            if ($station) {
                $groups[$station->id][] = $line->id;
            }
        }

        return DB::transaction(function () use ($o, $groups) {
            foreach ($groups as $stationId => $lineIds) {
                $t = Ticket::create(['order_id' => $o->id, 'station_id' => $stationId, 'status' => 'new', 'due_at' => $o->fulfil_at]);
                \App\Models\Menus\MenuOrderLine::whereIn('id', $lineIds)->update(['ticket_id' => $t->id]);
            }

            return count($groups);
        });
    }

    public function start(Ticket $t): Ticket
    {
        if ($t->status !== 'new') {
            throw new BooksException($t->status === 'started' ? 'That ticket is already started.' : 'That ticket is not waiting to be started.');
        }
        $t->update(['status' => 'started', 'started_at' => now()]);
        $o = MenuOrder::find($t->order_id);
        if ($o && in_array($o->status, ['placed', 'accepted'], true)) {
            $o->update(['status' => 'preparing', 'accepted_at' => $o->accepted_at ?? now()]);
        }

        return $t->fresh();
    }

    public function ready(Ticket $t): Ticket
    {
        if (! in_array($t->status, ['new', 'started'], true)) {
            throw new BooksException('That ticket is not being made.');
        }
        $t->update(['status' => 'ready', 'started_at' => $t->started_at ?? now(), 'ready_at' => now()]);
        $this->orderMaybeReady(MenuOrder::findOrFail($t->order_id));

        return $t->fresh();
    }

    /** Take it back: a ready ticket becomes started again, a started one becomes new. */
    public function recall(Ticket $t): Ticket
    {
        $o = MenuOrder::findOrFail($t->order_id);
        if ($t->status === 'ready') {
            if (in_array($o->status, ['out', 'completed'], true)) {
                throw new BooksException('The order has already left the kitchen.');
            }
            $t->update(['status' => 'started', 'ready_at' => null]);
            if ($o->status === 'ready') {
                $o->update(['status' => 'preparing', 'ready_at' => null]);
            }
        } elseif ($t->status === 'started') {
            $t->update(['status' => 'new', 'started_at' => null]);
        } else {
            throw new BooksException('Nothing to take back.');
        }

        return $t->fresh();
    }

    /** All tickets ready (and nothing without a ticket still to make): the order is ready and the customer is told. */
    private function orderMaybeReady(MenuOrder $o): void
    {
        if (! in_array($o->status, ['placed', 'accepted', 'preparing'], true)) {
            return;
        }
        $open = Ticket::where('order_id', $o->id)->whereNotIn('status', ['ready', 'cancelled'])->exists();
        $loose = $o->lines()->whereNull('ticket_id')->exists();
        if (! $open && ! $loose) {
            app(MenuOrderService::class)->advance($o, 'ready');
        }
    }

    /** Staff marked the whole order ready from the board: every ticket is. */
    public function orderReady(MenuOrder $o): void
    {
        if (self::installed()) {
            Ticket::where('order_id', $o->id)->whereIn('status', ['new', 'started'])->update(['status' => 'ready', 'ready_at' => now(), 'started_at' => DB::raw('COALESCE(started_at, CURRENT_TIMESTAMP)')]);
        }
    }

    /** The order was cancelled: nothing more to make. */
    public function orderCancelled(MenuOrder $o): void
    {
        if (self::installed()) {
            Ticket::where('order_id', $o->id)->whereIn('status', ['new', 'started', 'ready'])->update(['status' => 'cancelled', 'cancelled_at' => now()]);
        }
    }

    // ── what the screens show ─────────────────────────────────────────────

    /**
     * One station's screen: what is to be made (oldest first), what is later today, and what was just finished.
     *
     * @return array{station: array, tickets: array, later: array, done: array, now: string}
     */
    public function screen(Station $s, ?Carbon $now = null, int $horizonMinutes = 45): array
    {
        $now ??= now();
        $make = Ticket::with('order', 'lines')->where('station_id', $s->id)->whereIn('status', ['new', 'started'])->orderBy('due_at')->orderBy('id')->get()
            ->filter(fn (Ticket $t) => $t->order && $t->order->open());
        $now_ = $make->filter(fn ($t) => $t->due_at->lte($now->copy()->addMinutes($horizonMinutes)));
        $done = Ticket::with('order', 'lines')->where('station_id', $s->id)->where('status', 'ready')->where('ready_at', '>=', $now->copy()->subMinutes(15))->orderByDesc('ready_at')->limit(12)->get();

        return ['station' => ['id' => $s->id, 'name' => $s->name, 'target_minutes' => $s->target_minutes], 'now' => $now->toIso8601String(),
            'tickets' => $now_->map(fn ($t) => $this->card($t, $s, $now))->values()->all(), 'later' => $make->diff($now_)->map(fn ($t) => $this->card($t, $s, $now))->values()->all(),
            'done' => $done->map(fn ($t) => $this->card($t, $s, $now))->values()->all()];
    }

    /** The pass: every order still being made, with how each station is getting on. */
    public function expo(?Carbon $now = null): array
    {
        $now ??= now();
        $orders = MenuOrder::with('lines')->whereIn('status', ['placed', 'accepted', 'preparing', 'ready'])->whereNotIn('payment', ['pending', 'failed'])->orderBy('fulfil_at')->limit(80)->get();
        $tickets = Ticket::with('station')->whereIn('order_id', $orders->pluck('id'))->where('status', '!=', 'cancelled')->get()->groupBy('order_id');

        return ['now' => $now->toIso8601String(), 'orders' => $orders->map(fn (MenuOrder $o) => [
            'id' => $o->id, 'number' => $o->number, 'name' => $o->name, 'order_type' => $o->order_type, 'status' => $o->status, 'asap' => $o->asap, 'due_at' => $o->fulfil_at->toIso8601String(), 'notes' => $o->notes,
            'minutes' => (int) $o->created_at->diffInMinutes($now), 'stations' => ($tickets[$o->id] ?? collect())->map(fn ($t) => ['station' => $t->station?->name, 'status' => $t->status])->values()->all(),
            'unrouted' => $o->lines->whereNull('ticket_id')->count(),
        ])->values()->all()];
    }

    private function card(Ticket $t, Station $s, Carbon $now): array
    {
        $o = $t->order;
        $waited = (int) $o->created_at->diffInMinutes($now);

        return ['id' => $t->id, 'status' => $t->status, 'order_id' => $o->id, 'number' => $o->number, 'name' => explode(' ', trim($o->name))[0], 'order_type' => $o->order_type, 'asap' => $o->asap,
            'due_at' => $t->due_at->toIso8601String(), 'waited' => $waited, 'late' => $t->status !== 'ready' && $waited >= $s->target_minutes, 'started_at' => $t->started_at?->toIso8601String(), 'notes' => $o->notes,
            'lines' => $t->lines->map(function ($l) {
                $dish = Dish::find($l->dish_id);
                $codes = $dish ? $this->info->profile($dish)['allergens'] : [];

                return ['quantity' => (int) $l->quantity, 'name' => $l->name, 'options' => array_column($l->options ?? [], 'name'), 'note' => $l->note, 'allergens' => array_map(fn ($c) => FoodTags::ALLERGENS[$c] ?? $c, $codes)];
            })->values()->all()];
    }
}
