<?php

namespace App\Services\Menus;

use App\Models\Location;
use App\Models\Menus\Chef;
use App\Models\Menus\OpenClaim;
use App\Models\Menus\OpenShift;
use App\Models\Menus\Shift;
use App\Models\Menus\Station;
use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The open shift board. A manager posts a shift nobody holds yet, or a chef gives one of theirs back (it stays theirs until someone else takes it). Any chef who is free and set up for
 * the station may claim it; a manager awards one claim (or, when Menus settings say so, the first chef who is free gets it at once). The shift then becomes that chef's, published, and the chef is told.
 * A claim is checked when it is made and again when it is awarded: day off, overlapping shift, private chef job, the station.
 */
class RotaBoard
{
    private const MIN_HOURS = 1;
    private const MAX_HOURS = 16;

    public static function installed(): bool
    {
        return Schema::hasTable('menus_open_shifts') && Schema::hasTable('menus_open_claims');
    }

    public function __construct(private RotaService $rota, private RotaNotices $notices)
    {
    }

    private function tz(): string
    {
        return (string) config('app.timezone', 'Africa/Nairobi');
    }

    private function started(OpenShift $o): bool
    {
        return $o->span()[0]->lte(Carbon::now($this->tz()));
    }

    /** Post a shift on the board (a manager). @param array{location_id?: mixed, station_id?: mixed, date?: mixed, starts_at?: mixed, ends_at?: mixed, note?: mixed} $d */
    public function post(array $d, ?User $by = null, ?Shift $release = null): OpenShift
    {
        $loc = Location::find((int) ($d['location_id'] ?? 0));
        if (! $loc) {
            throw new BooksException('Choose the branch the shift is at.');
        }
        try {
            $day = Carbon::parse((string) ($d['date'] ?? ''), $this->tz())->startOfDay();
        } catch (\Throwable) {
            throw new BooksException('Choose the day.');
        }
        if ($day->lt(Carbon::now($this->tz())->startOfDay())) {
            throw new BooksException('Choose today or a day to come.');
        }
        $from = substr(trim((string) ($d['starts_at'] ?? '')), 0, 5);
        $to = substr(trim((string) ($d['ends_at'] ?? '')), 0, 5);
        foreach ([$from, $to] as $t) {
            if (! preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $t)) {
                throw new BooksException('Enter the times like 08:30.');
            }
        }
        $hours = (strtotime("2000-01-01 {$to}") - strtotime("2000-01-01 {$from}")) / 3600;
        if ($hours <= 0) {
            throw new BooksException('The shift must finish after it starts, on the same day.');
        }
        if ($hours < self::MIN_HOURS || $hours > self::MAX_HOURS) {
            throw new BooksException('A shift is between '.self::MIN_HOURS.' and '.self::MAX_HOURS.' hours long.');
        }
        $station = ! empty($d['station_id']) ? (int) $d['station_id'] : null;
        if ($station && KitchenService::installed() && ! Station::whereKey($station)->exists()) {
            throw new BooksException('That kitchen station does not exist.');
        }
        $o = OpenShift::create(['location_id' => $loc->id, 'station_id' => $station, 'shift_date' => $day->toDateString(), 'starts_at' => $from, 'ends_at' => $to, 'status' => 'open',
            'note' => filled($d['note'] ?? null) ? mb_substr(trim((string) $d['note']), 0, 200) : null, 'release_shift_id' => $release?->id, 'created_by' => $by?->id]);
        if ($o->span()[0]->lte(Carbon::now($this->tz()))) {
            $o->delete();
            throw new BooksException('That shift has started already.');
        }
        $this->notices->openPosted($o, $this->eligible($o, $release?->chef_id));

        return $o->fresh();
    }

    /** A chef gives a published shift back to the board (or a manager does for them). It stays theirs until someone takes it. */
    public function release(Shift $shift, ?User $by = null): OpenShift
    {
        if ($shift->status !== 'published' || $shift->span()[0]->lte(Carbon::now($this->tz()))) {
            throw new BooksException('Only a published shift that has not started can be given back.');
        }
        if (OpenShift::where('release_shift_id', $shift->id)->where('status', 'open')->exists()) {
            throw new BooksException('That shift is on the board already.');
        }

        return $this->post(['location_id' => $shift->location_id, 'station_id' => $shift->station_id, 'date' => $shift->shift_date->toDateString(), 'starts_at' => $shift->starts_at, 'ends_at' => $shift->ends_at,
            'note' => $shift->note], $by, $shift);
    }

    /** Why this chef can not take the shift, or null if they can. */
    public function problem(OpenShift $o, Chef $chef): ?string
    {
        try {
            if ($o->release_shift_id && (int) Shift::whereKey($o->release_shift_id)->value('chef_id') === (int) $chef->id) {
                return 'This is your own shift, given back.';
            }
            if ($o->station_id && $chef->station_ids && ! in_array((int) $o->station_id, array_map('intval', $chef->station_ids), true)) {
                return "{$chef->display_name} is not set up for that station.";
            }
            [$a, $b] = $o->span();
            $this->rota->assertCanWork($chef, $a, $b);

            return null;
        } catch (BooksException $e) {
            return $e->getMessage();
        }
    }

    /** The chefs who could take it right now. @return \Illuminate\Support\Collection<int, Chef> */
    private function eligible(OpenShift $o, ?int $except = null)
    {
        return Chef::where('is_active', true)->when($except, fn ($q) => $q->where('id', '!=', $except))->get()->filter(fn (Chef $c) => $this->problem($o, $c) === null)->values();
    }

    /** A chef claims an open shift. With approval off and the chef free, it is theirs at once. */
    public function claim(OpenShift $o, Chef $chef, ?string $note = null): OpenShift
    {
        if ($o->status !== 'open' || $this->started($o)) {
            throw new BooksException('That shift is not open any more.');
        }
        if ($why = $this->problem($o, $chef)) {
            throw new BooksException($why);
        }
        if (OpenClaim::where('open_id', $o->id)->where('chef_id', $chef->id)->whereIn('status', ['requested'])->exists()) {
            throw new BooksException('You have claimed this one already.');
        }
        OpenClaim::updateOrCreate(['open_id' => $o->id, 'chef_id' => $chef->id], ['status' => 'requested', 'note' => filled($note) ? mb_substr(trim($note), 0, 200) : null, 'decided_by' => null, 'decided_at' => null]);
        if (! MenusSettings::all()['rota_claims_need_approval']) {
            return $this->fill($o->fresh(), $chef, null);
        }
        $this->notices->claimAsked($o, $chef);

        return $o->fresh();
    }

    public function withdraw(OpenShift $o, Chef $chef): void
    {
        $c = OpenClaim::where('open_id', $o->id)->where('chef_id', $chef->id)->where('status', 'requested')->first();
        if (! $c) {
            throw new BooksException('You have no claim on this shift.');
        }
        $c->update(['status' => 'withdrawn']);
    }

    /** A manager awards the shift to one of the chefs who claimed it. */
    public function award(OpenShift $o, Chef $chef, ?User $by = null): OpenShift
    {
        $c = OpenClaim::where('open_id', $o->id)->where('chef_id', $chef->id)->where('status', 'requested')->first();
        if ($o->status !== 'open' || $this->started($o)) {
            throw new BooksException('That shift is not open any more.');
        }
        if (! $c) {
            throw new BooksException('That chef has not claimed this shift.');
        }

        return $this->fill($o, $chef, $by);
    }

    /** The shift becomes the chef's (published, they are told); a shift that was given back is taken off the chef who gave it. Checked again; if it no longer fits nothing changes. */
    private function fill(OpenShift $o, Chef $chef, ?User $by): OpenShift
    {
        if ($why = $this->problem($o, $chef)) {
            throw new BooksException($why);
        }
        $new = DB::transaction(function () use ($o, $chef, $by) {
            if ($o->release_shift_id && ($old = Shift::find($o->release_shift_id))) {
                $this->rota->deleteShift($old);   // the chef who gave it back is told it is gone
            }
            $r = $this->rota->saveShift(['chef_id' => $chef->id, 'location_id' => $o->location_id, 'station_id' => $o->station_id, 'date' => $o->shift_date->toDateString(), 'starts_at' => $o->starts_at, 'ends_at' => $o->ends_at, 'note' => $o->note], null, $by);
            $shift = $r['shift'];
            $shift->update(['status' => 'published', 'published_at' => now()]);
            $o->update(['status' => 'filled', 'filled_shift_id' => $shift->id, 'filled_chef_id' => $chef->id]);
            OpenClaim::where('open_id', $o->id)->where('chef_id', $chef->id)->update(['status' => 'awarded', 'decided_by' => $by?->id, 'decided_at' => now()]);
            OpenClaim::where('open_id', $o->id)->where('status', 'requested')->update(['status' => 'declined', 'decided_by' => $by?->id, 'decided_at' => now()]);

            return $shift;
        });
        $this->notices->openFilled($o->fresh(), $new, $chef);

        return $o->fresh();
    }

    public function cancel(OpenShift $o): OpenShift
    {
        if ($o->status !== 'open') {
            throw new BooksException('This shift is not open any more.');
        }
        $o->update(['status' => 'cancelled']);
        OpenClaim::where('open_id', $o->id)->where('status', 'requested')->update(['status' => 'declined', 'decided_at' => now()]);

        return $o->fresh();
    }

    /** Open shifts that have started can no longer be taken. @return int how many ran out */
    public function expire(?Carbon $now = null): int
    {
        if (! self::installed()) {
            return 0;
        }
        $n = 0;
        foreach (OpenShift::where('status', 'open')->where('shift_date', '<=', ($now ?? Carbon::now($this->tz()))->toDateString())->get() as $o) {
            if ($o->span()[0]->lte($now ?? Carbon::now($this->tz()))) {
                $o->update(['status' => 'expired']);
                OpenClaim::where('open_id', $o->id)->where('status', 'requested')->update(['status' => 'declined', 'decided_at' => now()]);
                $n++;
            }
        }

        return $n;
    }

    /**
     * The board for the screen: open shifts (and ones filled in the last week). A manager sees who claimed; a chef sees whether they can take it and why not.
     *
     * @param callable|null $scope narrows the open shifts to the branches the person may see
     * @return array<int, array<string, mixed>>
     */
    public function rows(?Chef $me, bool $manager, ?callable $scope = null): array
    {
        if (! self::installed()) {
            return [];
        }
        $q = OpenShift::where(fn ($w) => $w->where('status', 'open')->orWhere(fn ($x) => $x->where('status', 'filled')->where('updated_at', '>=', now()->subDays(7))))->orderBy('shift_date')->orderBy('starts_at');
        if ($scope) {
            $scope($q);
        }
        $chefs = Chef::pluck('display_name', 'id');
        $stations = KitchenService::installed() ? Station::pluck('name', 'id') : collect();
        $claims = OpenClaim::whereIn('open_id', (clone $q)->pluck('id'))->get()->groupBy('open_id');
        $out = [];
        foreach ($q->limit(100)->get() as $o) {
            $mine = $me ? ($claims[$o->id] ?? collect())->first(fn ($c) => (int) $c->chef_id === (int) $me->id && $c->status === 'requested') : null;
            $why = $me && $o->status === 'open' ? $this->problem($o, $me) : null;
            $out[] = ['id' => $o->id, 'date' => $o->shift_date->toDateString(), 'starts_at' => substr((string) $o->starts_at, 0, 5), 'ends_at' => substr((string) $o->ends_at, 0, 5), 'hours' => $o->hours(),
                'location_id' => $o->location_id, 'station_id' => $o->station_id, 'station' => $o->station_id ? ($stations[$o->station_id] ?? null) : null, 'note' => $o->note, 'status' => $o->status,
                'given_back_by' => $o->release_shift_id ? ($chefs[Shift::whereKey($o->release_shift_id)->value('chef_id')] ?? null) : null, 'filled_by' => $o->filled_chef_id ? ($chefs[$o->filled_chef_id] ?? null) : null,
                'claimed' => (bool) $mine, 'can_claim' => $me && $o->status === 'open' && ! $mine && $why === null, 'cannot_because' => $mine ? null : $why,
                'claims' => $manager ? ($claims[$o->id] ?? collect())->where('status', 'requested')->map(fn ($c) => ['chef_id' => $c->chef_id, 'chef' => $chefs[$c->chef_id] ?? null, 'note' => $c->note])->values()->all() : [],
                'can_cancel' => $manager && $o->status === 'open'];
        }

        return $out;
    }
}
