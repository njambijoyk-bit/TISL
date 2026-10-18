<?php

namespace App\Services\Menus;

use App\Models\Menus\DishRecipe;
use App\Models\Menus\PrepRun;
use App\Models\Menus\PrepTimer;
use App\Models\UnitOfMeasure;
use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;

/**
 * The clock on a batch (Menus, Prepared food): start it with the recipe and the size and it says how long it should take (the recipe's time by batch size, or the minutes typed) and when it is
 * ready, counting down on the production screen ("simmer 90 min, ready 12:40"). Making the batch finishes the timer and times the batch from when it started. A timer takes nothing off the
 * shelf: only the batch does that. One recipe can have several timers running (two pots).
 */
class PrepTimers
{
    public function __construct(private PrepProduction $production, private RecipeTimes $times)
    {
    }

    /** Has script 214 been run (and 198 before it)? */
    public static function installed(): bool
    {
        return Schema::hasTable('menus_prep_timers') && PrepProduction::installed();
    }

    /**
     * @param array{minutes?: mixed, chef_id?: ?int, note?: ?string, unit_id?: ?int} $o `minutes`: how long, when the recipe has no time for a batch this size
     */
    public function start(DishRecipe $recipe, int $locationId, float $planned, array $o = [], ?User $by = null, ?Carbon $now = null): PrepTimer
    {
        if (! self::installed()) {
            throw new BooksException('Run database script 214_menus_timers.sql first.');
        }
        $this->production->check($recipe);
        if ($planned <= 0) {
            throw new BooksException('Say how big the batch is (more than nothing).');
        }
        $in = ! empty($o['unit_id']) ? UnitOfMeasure::find((int) $o['unit_id']) : null;
        $inUnit = $in && $recipe->yield_unit_id && (int) $in->id !== (int) $recipe->yield_unit_id ? $in->convertTo($recipe->yieldUnit, $planned) : $planned;
        $minutes = $this->times->expected($recipe, $planned, $in);
        if (isset($o['minutes']) && $o['minutes'] !== '' && $o['minutes'] !== null) {
            $typed = (int) $o['minutes'];
            if ($typed < 1 || $typed > 6000) {
                throw new BooksException('The minutes must be between 1 and 6000.');
            }
            $minutes = $typed;   // what was typed beats the recipe's own time
        }
        if (! $minutes) {
            throw new BooksException("{$recipe->title()} has no time for a batch this size: type how many minutes it takes (or add the time to the recipe).");
        }
        $note = isset($o['note']) && trim((string) $o['note']) !== '' ? mb_substr(trim((string) $o['note']), 0, 120) : null;
        $now ??= Carbon::now((string) config('app.timezone', 'Africa/Nairobi'));

        return PrepTimer::create(['recipe_id' => $recipe->id, 'location_id' => $locationId, 'planned_qty' => round($inUnit, 4), 'expected_minutes' => $minutes, 'started_at' => $now, 'ready_at' => $now->copy()->addMinutes($minutes),
            'chef_id' => ! empty($o['chef_id']) ? (int) $o['chef_id'] : null, 'status' => 'running', 'note' => $note, 'started_by' => $by?->id]);
    }

    /** The batches on the stove at a branch, the one ready first at the top. @return array<int, array<string, mixed>> */
    public function running(int $locationId, ?Carbon $now = null): array
    {
        if (! self::installed()) {
            return [];
        }
        $now ??= Carbon::now((string) config('app.timezone', 'Africa/Nairobi'));

        return PrepTimer::with(['recipe.yieldUnit', 'chef'])->where('location_id', $locationId)->where('status', 'running')->orderBy('ready_at')->get()->map(function (PrepTimer $t) use ($now) {
            $left = (int) $now->diffInSeconds($t->ready_at, false);

            return ['id' => (int) $t->id, 'recipe_id' => (int) $t->recipe_id, 'recipe' => $t->recipe?->title(), 'unit' => $t->recipe?->yieldUnit?->code ?? 'portions', 'planned' => (float) $t->planned_qty, 'minutes' => (int) $t->expected_minutes,
                'note' => $t->note, 'chef' => $t->chef?->display_name, 'chef_id' => $t->chef_id ? (int) $t->chef_id : null, 'started_at' => $t->started_at->toIso8601String(), 'ready_at' => $t->ready_at->toIso8601String(),
                'ready_time' => $t->ready_at->format('H:i'), 'seconds_left' => $left, 'overdue' => $left < 0];
        })->values()->all();
    }

    /** The batch was made from this timer: it is done, and says which batch it became. */
    public function finish(int $timerId, PrepRun $run, ?Carbon $now = null): ?PrepTimer
    {
        $t = PrepTimer::whereKey($timerId)->where('status', 'running')->first();
        if (! $t) {
            return null;
        }
        $t->update(['status' => 'done', 'run_id' => $run->id, 'finished_at' => $now ?? now()]);

        return $t;
    }

    /** Switch a timer off without making anything (the pot was tipped out, or it was started by mistake). */
    public function cancel(int $timerId): PrepTimer
    {
        $t = PrepTimer::whereKey($timerId)->first() ?? throw new BooksException('That timer could not be found.');
        if ($t->status === 'running') {
            $t->update(['status' => 'cancelled', 'finished_at' => now()]);
        }

        return $t;
    }
}
