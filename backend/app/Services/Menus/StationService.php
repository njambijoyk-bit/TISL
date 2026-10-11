<?php

namespace App\Services\Menus;

use App\Models\Menus\Dish;
use App\Models\Menus\Station;
use App\Models\Menus\Ticket;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;

/** The kitchen's stations (Menus → Settings → Kitchen stations). */
class StationService
{
    /** @param array{name?: string, location_id?: ?int, target_minutes?: int, is_default?: bool, is_active?: bool, sort_order?: int} $d */
    public function save(array $d, ?int $id = null): Station
    {
        $s = $id ? Station::findOrFail($id) : new Station(['target_minutes' => 15, 'is_active' => true]);
        $name = array_key_exists('name', $d) ? trim((string) $d['name']) : (string) $s->name;
        if ($name === '') {
            throw new BooksException('Give the station a name.');
        }
        $target = (int) ($d['target_minutes'] ?? $s->target_minutes);
        if ($target < 1 || $target > 240) {
            throw new BooksException('A ticket may wait between 1 and 240 minutes before it is late.');
        }
        $location = array_key_exists('location_id', $d) ? ($d['location_id'] ?: null) : $s->location_id;
        if ($location && ! DB::table('locations')->where('id', $location)->exists()) {
            throw new BooksException('That branch does not exist.');
        }
        if (Station::where('name', $name)->where('id', '!=', (int) $s->id)->where('location_id', $location)->exists()) {
            throw new BooksException("There is already a station called {$name}.");
        }

        return DB::transaction(function () use ($s, $name, $target, $location, $d) {
            $s->fill(['name' => $name, 'target_minutes' => $target, 'location_id' => $location] + array_intersect_key($d, array_flip(['is_default', 'is_active', 'sort_order'])));
            if (! $s->is_active) {
                $s->is_default = false;
            }
            $s->save();
            if ($s->is_default) {   // one station per branch takes "everything else"
                Station::where('id', '!=', $s->id)->where('location_id', $s->location_id)->update(['is_default' => false]);
            }

            return $s->fresh();
        });
    }

    public function delete(Station $s): void
    {
        if (Ticket::where('station_id', $s->id)->whereIn('status', ['new', 'started'])->exists()) {
            throw new BooksException('This station still has tickets to make. Finish them first, or switch the station off.');
        }
        DB::transaction(function () use ($s) {
            Dish::where('station_id', $s->id)->update(['station_id' => null]);
            $s->delete();
        });
    }
}
