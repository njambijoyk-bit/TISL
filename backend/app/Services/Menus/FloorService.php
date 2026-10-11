<?php

namespace App\Services\Menus;

use App\Models\Menus\Area;
use App\Models\Menus\MenuOrder;
use App\Models\Menus\Table;
use App\Models\Menus\Ticket;
use App\Services\Books\BooksException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * The floor: areas and tables with their place on the plan, who is seated, and what state each table is in. A table's state is mostly worked out from what is happening
 * (a tab with food still to be made is "ordered", one with everything served is "eating", a bill asked for is "bill", a table that is being paid by phone is "paying",
 * a reservation in the Bookings calendar shows "reserved"); only seated, cleaning and free are kept. Merging joins tables for a big party; the party's tab sits on the main table.
 */
class FloorService
{
    private static ?bool $installed = null;

    public static function installed(): bool
    {
        if (app()->runningUnitTests()) {
            return Schema::hasTable('menus_tables') && Schema::hasColumn('menus_orders', 'table_id');
        }

        return self::$installed ??= Schema::hasTable('menus_tables') && Schema::hasColumn('menus_orders', 'table_id');
    }

    public function __construct(private MenuOrderNotices $notices)
    {
    }

    // ── laying out the floor ─────────────────────────────────────────────

    public function saveArea(array $d, ?int $id = null): Area
    {
        $a = $id ? Area::findOrFail($id) : new Area(['is_active' => true]);
        $name = trim((string) ($d['name'] ?? $a->name));
        if ($name === '') {
            throw new BooksException('Give the area a name.');
        }
        $loc = (int) ($d['location_id'] ?? $a->location_id);
        if (! $loc || ! DB::table('locations')->where('id', $loc)->exists()) {
            throw new BooksException('Choose the branch this area is at.');
        }
        if (Area::where('location_id', $loc)->where('name', $name)->where('id', '!=', (int) $a->id)->exists()) {
            throw new BooksException("There is already an area called {$name} at that branch.");
        }
        $a->fill(['name' => $name, 'location_id' => $loc] + array_intersect_key($d, array_flip(['sort_order', 'is_active'])))->save();

        return $a->fresh();
    }

    public function deleteArea(Area $a): void
    {
        if ($a->tables()->exists()) {
            throw new BooksException('Move or remove the tables in this area first.');
        }
        $a->delete();
    }

    public function saveTable(array $d, ?int $id = null): Table
    {
        $t = $id ? Table::findOrFail($id) : new Table(['state' => 'free', 'is_active' => true, 'shape' => 'square', 'w' => 2, 'h' => 2]);
        $name = trim((string) ($d['name'] ?? $t->name));
        if ($name === '') {
            throw new BooksException('Give the table a name or number.');
        }
        $areaId = (int) ($d['area_id'] ?? $t->area_id);
        $area = Area::find($areaId) ?? throw new BooksException('Choose the area the table is in.');
        $seats = (int) ($d['seats'] ?? ($t->seats ?: 2));
        if ($seats < 1 || $seats > 60) {
            throw new BooksException('A table seats between 1 and 60.');
        }
        if (isset($d['shape']) && ! in_array($d['shape'], ['square', 'round'], true)) {
            throw new BooksException('A table is square or round.');
        }
        if (Table::whereIn('area_id', Area::where('location_id', $area->location_id)->pluck('id'))->where('name', $name)->where('id', '!=', (int) $t->id)->exists()) {
            throw new BooksException("There is already a table called {$name} at that branch.");
        }
        if (! empty($d['resource_id']) && (! Schema::hasTable('bookable_resources') || ! DB::table('bookable_resources')->where('id', $d['resource_id'])->where('type', 'table')->exists())) {
            throw new BooksException('That is not a bookable table in the Bookings calendar.');
        }
        foreach (['x', 'y'] as $k) {
            if (isset($d[$k]) && ((int) $d[$k] < 0 || (int) $d[$k] > 60)) {
                throw new BooksException('The table is off the plan.');
            }
        }
        foreach (['w', 'h'] as $k) {
            if (isset($d[$k]) && ((int) $d[$k] < 1 || (int) $d[$k] > 12)) {
                throw new BooksException('A table is 1 to 12 squares wide and tall.');
            }
        }
        if (! $t->exists) {
            $t->qr_token = Str::random(24);
        }
        $t->fill(['name' => $name, 'area_id' => $areaId, 'seats' => $seats] + array_intersect_key($d, array_flip(['shape', 'x', 'y', 'w', 'h', 'resource_id', 'sort_order', 'is_active'])))->save();

        return $t->fresh();
    }

    /** A new QR code for a table (the old printout stops working): for a code that was photographed and shared. */
    public function renewQr(Table $t): Table
    {
        $t->update(['qr_token' => Str::random(24)]);

        return $t->fresh();
    }

    public function deleteTable(Table $t): void
    {
        if ($this->tabOf($t) || Table::where('merged_into', $t->id)->exists()) {
            throw new BooksException('This table has a tab or other tables joined to it.');
        }
        $t->delete();
    }

    /** Where tables sit on the plan (drag and drop). @param array<int, array{id: int, x: int, y: int, w?: int, h?: int}> $places */
    public function saveLayout(array $places): void
    {
        DB::transaction(function () use ($places) {
            foreach ($places as $p) {
                $this->saveTable(array_intersect_key($p, array_flip(['x', 'y', 'w', 'h'])), (int) $p['id']);
            }
        });
    }

    // ── the floor now ────────────────────────────────────────────────────

    /** The open tab at a table (or at a table joined to it). */
    public function tabOf(Table $t): ?MenuOrder
    {
        if ($t->merged_into && ($main = Table::find($t->merged_into))) {
            $t = $main;   // a joined table shares the party's tab
        }
        $ids = Table::where('merged_into', $t->id)->pluck('id')->push($t->id)->all();

        return MenuOrder::with('lines')->whereIn('table_id', $ids)->whereIn('payment', ['open', 'pending'])->whereNotIn('status', ['cancelled', 'completed'])->orderBy('id')->first();
    }

    /** @return array{areas: array, now: string} */
    public function floor(int $locationId, ?Carbon $now = null): array
    {
        $now ??= now();
        $areas = Area::with('tables')->where('location_id', $locationId)->where('is_active', true)->orderBy('sort_order')->orderBy('name')->get();
        $joined = Table::whereNotNull('merged_into')->get()->groupBy('merged_into');

        return ['now' => $now->toIso8601String(), 'areas' => $areas->map(fn (Area $a) => [
            'id' => $a->id, 'name' => $a->name, 'tables' => $a->tables->where('is_active', true)->map(fn (Table $t) => $this->card($t, $now, $joined[$t->id] ?? collect()))->values()->all(),
        ])->values()->all()];
    }

    /** One table as the floor shows it. */
    public function card(Table $t, ?Carbon $now = null, $joined = null): array
    {
        $now ??= now();
        $joined ??= Table::where('merged_into', $t->id)->get();
        $tab = $t->merged_into ? null : $this->tabOf($t);
        $reserved = ($t->merged_into || $tab || $t->state !== 'free') ? null : $this->reservation($t, $now);

        return ['id' => $t->id, 'name' => $t->name, 'seats' => $t->seats + $joined->sum('seats'), 'shape' => $t->shape, 'x' => $t->x, 'y' => $t->y, 'w' => $t->w, 'h' => $t->h,
            'state' => $this->state($t, $tab, $reserved), 'guests' => $t->guests, 'merged_into' => $t->merged_into, 'joined' => $joined->pluck('name')->values()->all(), 'qr_token' => $t->qr_token, 'resource_id' => $t->resource_id,
            'since' => ($tab?->placed_at ?? $t->seated_at)?->toIso8601String(), 'minutes' => ($tab?->placed_at ?? $t->seated_at) ? (int) ($tab?->placed_at ?? $t->seated_at)->diffInMinutes($now) : null,
            'tab' => $tab ? ['id' => $tab->id, 'label' => $tab->label, 'total' => (float) $tab->total, 'payment' => $tab->payment, 'service' => $tab->service, 'short_no' => $tab->short_no] : null, 'reservation' => $reserved];
    }

    private function state(Table $t, ?MenuOrder $tab, ?array $reserved): string
    {
        if ($t->merged_into) {
            return 'merged';
        }
        if ($tab) {
            if ($tab->payment === 'pending') {
                return 'paying';
            }
            if ($t->bill_asked_at) {
                return 'bill';
            }

            return Ticket::where('order_id', $tab->id)->whereIn('status', ['new', 'started'])->exists() ? 'ordered' : 'eating';
        }

        return $t->state === 'free' ? ($reserved ? 'reserved' : 'free') : $t->state;
    }

    /** A confirmed reservation for the table in the Bookings calendar, from a little before now to the next hour. */
    private function reservation(Table $t, Carbon $now): ?array
    {
        if (! $t->resource_id || ! Schema::hasTable('bookings')) {
            return null;
        }
        $b = DB::table('bookings')->where('resource_id', $t->resource_id)->where('status', 'confirmed')->where('starts_at', '<=', $now->copy()->addHour())->where('ends_at', '>', $now)->orderBy('starts_at')->first();

        return $b ? ['at' => Carbon::parse($b->starts_at)->toIso8601String(), 'people' => (int) $b->people, 'name' => DB::table('customers')->where('id', $b->customer_id)->value('name')] : null;
    }

    // ── what staff do ────────────────────────────────────────────────────

    public function seat(Table $t, int $guests): Table
    {
        $this->assertUsable($t);
        if ($this->tabOf($t)) {
            throw new BooksException('This table already has a tab.');
        }
        if ($guests < 1 || $guests > 200) {
            throw new BooksException('How many guests?');
        }
        $t->update(['state' => 'seated', 'guests' => $guests, 'seated_at' => now(), 'bill_asked_at' => null]);

        return $t->fresh();
    }

    /** The table is cleaned (or nobody came): it is free again. */
    public function clear(Table $t): Table
    {
        if ($this->tabOf($t)) {
            throw new BooksException('This table still has a tab: pay or cancel it first.');
        }
        $t->update(['state' => 'free', 'guests' => null, 'seated_at' => null, 'bill_asked_at' => null]);

        return $t->fresh();
    }

    public function askBill(Table $t): Table
    {
        $tab = $this->tabOf($t) ?? throw new BooksException('There is no tab at this table.');
        if (! $t->bill_asked_at) {
            $t->update(['bill_asked_at' => now()]);
            $this->notices->billAsked($t, $tab);
        }

        return $t->fresh();
    }

    /** Join tables for a big party: the others become part of this one (they must be empty). @param int[] $ids */
    public function merge(Table $main, array $ids): Table
    {
        $this->assertUsable($main);
        $others = Table::whereIn('id', $ids)->where('id', '!=', $main->id)->get();
        if ($others->isEmpty()) {
            throw new BooksException('Choose the tables to join.');
        }
        foreach ($others as $o) {
            $this->assertUsable($o);
            $area = fn (Table $x) => Area::where('id', $x->area_id)->value('location_id');
            if ($area($o) !== $area($main)) {
                throw new BooksException("{$o->name} is at another branch.");
            }
            if ($this->tabOf($o) || Table::where('merged_into', $o->id)->exists()) {
                throw new BooksException("{$o->name} has a tab or other tables joined to it.");
            }
        }
        Table::whereIn('id', $others->pluck('id'))->update(['merged_into' => $main->id]);

        return $main->fresh();
    }

    public function unmerge(Table $main): Table
    {
        if ($this->tabOf($main)) {
            throw new BooksException('Pay or move the tab before separating the tables.');
        }
        Table::where('merged_into', $main->id)->update(['merged_into' => null]);

        return $main->fresh();
    }

    public function assertUsable(Table $t): void
    {
        if (! $t->is_active) {
            throw new BooksException("{$t->name} is switched off.");
        }
        if ($t->merged_into) {
            throw new BooksException("{$t->name} is joined to another table: use that one.");
        }
    }

    /** The address a table's QR code opens. */
    public function qrUrl(Table $t): string
    {
        return rtrim((string) config('app.frontend_url'), '/').'/menu/table/'.$t->qr_token;
    }

    /** The QR code as an SVG picture, for printing. */
    public function qrSvg(Table $t): string
    {
        return \App\Services\Codes\CodeFactory::make('qr', $this->qrUrl($t), ['level' => 'M'])->svg(['unit' => 6]);
    }

    public function locationOf(Table $t): int
    {
        return (int) Area::where('id', $t->area_id)->value('location_id');
    }
}
