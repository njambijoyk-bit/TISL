<?php

namespace App\Services\Menus;

use App\Models\Menus\Chef;
use App\Models\Menus\Shift;
use App\Models\Menus\Swap;
use App\Models\Menus\Station;
use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Swapping shifts. A chef hands a published shift that has not started to a colleague (cover), or trades it for one of the colleague's. The colleague says yes or no; then a manager approves
 * (unless Menus settings let a swap the colleague agreed to go straight through). Everything is checked when it is asked and checked again when it is made: the colleague must be free
 * (no day off, no overlapping shift, no private chef job) for the shift they take, and for a trade each chef must be free for the other's shift. A swap whose shift has started simply runs out.
 */
class RotaSwaps
{
    public static function installed(): bool
    {
        return Schema::hasTable('menus_swaps');
    }

    public function __construct(private RotaService $rota, private RotaNotices $notices)
    {
    }

    private function tz(): string
    {
        return (string) config('app.timezone', 'Africa/Nairobi');
    }

    /** Has this shift not started yet, and has the chef been told about it (published)? */
    private function swappable(Shift $s, ?Carbon $now = null): bool
    {
        return $s->status === 'published' && $s->span()[0]->gt(($now ?? Carbon::now($this->tz())));
    }

    /**
     * A chef (or a manager for them) asks a colleague to take a shift.
     *
     * @param array{shift_id?: mixed, to_chef_id?: mixed, return_shift_id?: mixed, note?: mixed} $d
     */
    public function ask(array $d, ?User $by = null): Swap
    {
        $shift = Shift::find((int) ($d['shift_id'] ?? 0));
        if (! $shift || ! $this->swappable($shift)) {
            throw new BooksException('Only a published shift that has not started can be swapped.');
        }
        $from = Chef::find($shift->chef_id);
        $to = Chef::find((int) ($d['to_chef_id'] ?? 0));
        if (! $from || ! $to || ! $to->is_active) {
            throw new BooksException('Choose a colleague who is working with us.');
        }
        if ($from->id === $to->id) {
            throw new BooksException('Choose someone other than yourself.');
        }
        $back = null;
        if (! empty($d['return_shift_id'])) {
            $back = Shift::find((int) $d['return_shift_id']);
            if (! $back || (int) $back->chef_id !== (int) $to->id || ! $this->swappable($back)) {
                throw new BooksException('The shift offered in return must be one of your colleague\'s, published and not started.');
            }
        }
        if (Swap::whereIn('status', ['asked', 'agreed'])->where(fn ($q) => $q->whereIn('shift_id', array_filter([$shift->id, $back?->id]))->orWhereIn('return_shift_id', array_filter([$shift->id, $back?->id])))->exists()) {
            throw new BooksException('One of those shifts is already part of a swap that has not been settled.');
        }
        $this->checkBoth($shift, $from, $to, $back);
        $swap = Swap::create(['shift_id' => $shift->id, 'from_chef_id' => $from->id, 'to_chef_id' => $to->id, 'return_shift_id' => $back?->id, 'note' => filled($d['note'] ?? null) ? mb_substr(trim((string) $d['note']), 0, 300) : null,
            'status' => 'asked', 'requested_by' => $by?->id]);
        $this->notices->swapAsked($swap, $shift, $from, $to, $back);

        return $swap->fresh();
    }

    /** Can each chef take the other's shift as things stand? @throws BooksException */
    private function checkBoth(Shift $shift, Chef $from, Chef $to, ?Shift $back): void
    {
        $this->rota->assertCanHold($to, $shift, $back ? [$back->id] : []);
        if ($back) {
            $this->rota->assertCanHold($from, $back, [$shift->id]);
        }
    }

    /** The colleague answers. Yes: it waits for a manager (or goes through, when the settings say so). */
    public function respond(Swap $swap, Chef $me, bool $accept, ?string $note = null): Swap
    {
        if ($swap->status !== 'asked') {
            throw new BooksException('This swap has been answered already.');
        }
        if ((int) $swap->to_chef_id !== (int) $me->id) {
            throw new BooksException('This swap was asked of someone else.');
        }
        $shift = Shift::find($swap->shift_id);
        if (! $shift || ! $this->swappable($shift)) {
            $swap->update(['status' => 'expired']);
            throw new BooksException('That shift has started or changed: the swap has run out.');
        }
        if (! $accept) {
            $swap->update(['status' => 'declined', 'answered_at' => now(), 'decision_note' => $note ? mb_substr(trim($note), 0, 300) : null]);
            $this->notices->swapAnswered($swap, false);

            return $swap->fresh();
        }
        $swap->update(['status' => 'agreed', 'answered_at' => now()]);
        $this->notices->swapAnswered($swap, true);
        if (! MenusSettings::all()['rota_swaps_need_approval']) {
            return $this->apply($swap->fresh(), null);
        }
        $this->notices->swapNeedsApproval($swap, $shift);

        return $swap->fresh();
    }

    /** A manager approves or declines a swap the colleague agreed to. */
    public function decide(Swap $swap, bool $approve, ?string $note = null, ?User $by = null): Swap
    {
        if ($swap->status !== 'agreed') {
            throw new BooksException($swap->status === 'asked' ? 'The colleague has not answered yet.' : 'This swap has been settled already.');
        }
        if (! $approve) {
            $swap->update(['status' => 'declined', 'decided_by' => $by?->id, 'decided_at' => now(), 'decision_note' => $note ? mb_substr(trim($note), 0, 300) : null]);
            $this->notices->swapDecided($swap, false);

            return $swap->fresh();
        }

        return $this->apply($swap, $by, $note);
    }

    /** Make the swap: the shift (and the one in return) change chef. Checked again; if anything no longer fits nothing changes. */
    private function apply(Swap $swap, ?User $by, ?string $note = null): Swap
    {
        $shift = Shift::find($swap->shift_id);
        $back = $swap->return_shift_id ? Shift::find($swap->return_shift_id) : null;
        $from = Chef::find($swap->from_chef_id);
        $to = Chef::find($swap->to_chef_id);
        $stale = ! $shift || ! $from || ! $to || (int) $shift->chef_id !== (int) $from->id || ! $this->swappable($shift)
            || ($swap->return_shift_id && (! $back || (int) $back->chef_id !== (int) $to->id || ! $this->swappable($back)));
        if ($stale) {
            $swap->update(['status' => 'expired']);
            throw new BooksException('The shifts have changed since this was asked: the swap has run out. Ask again.');
        }
        DB::transaction(function () use ($swap, $shift, $back, $from, $to, $by, $note) {
            $this->rota->saveShift(['chef_id' => $to->id], $shift, $by, $back ? [$back->id] : []);
            if ($back) {
                $this->rota->saveShift(['chef_id' => $from->id], $back, $by, [$shift->id]);
            }
            $swap->update(['status' => 'approved', 'decided_by' => $by?->id, 'decided_at' => now(), 'decision_note' => $note ? mb_substr(trim($note), 0, 300) : null]);
        });
        $this->notices->swapDecided($swap->fresh(), true);

        return $swap->fresh();
    }

    public function cancel(Swap $swap): Swap
    {
        if (! $swap->open()) {
            throw new BooksException('This swap has been settled already.');
        }
        $swap->update(['status' => 'cancelled']);

        return $swap->fresh();
    }

    /** Swaps whose shift has started can no longer happen. @return int how many ran out */
    public function expire(?Carbon $now = null): int
    {
        if (! self::installed()) {
            return 0;
        }
        $n = 0;
        foreach (Swap::whereIn('status', ['asked', 'agreed'])->get() as $sw) {
            $s = Shift::find($sw->shift_id);
            if (! $s || ! $this->swappable($s, $now)) {
                $sw->update(['status' => 'expired']);
                $n++;
            }
        }

        return $n;
    }

    /**
     * The swaps to show: all of them for a manager (limited by $scope), and only the ones that involve the chef for anyone else. Open ones, and the settled ones of the last 14 days.
     *
     * @param callable|null $scope narrows the shift ids to the branches the person may see
     * @return array<int, array<string, mixed>>
     */
    public function rows(?Chef $me, bool $manager, ?callable $scope = null): array
    {
        if (! self::installed()) {
            return [];
        }
        $q = Swap::where(fn ($w) => $w->whereIn('status', ['asked', 'agreed'])->orWhere('updated_at', '>=', now()->subDays(14)))->orderByRaw("CASE status WHEN 'agreed' THEN 0 WHEN 'asked' THEN 1 ELSE 2 END")->orderByDesc('id');
        if (! $manager) {
            $q->where(fn ($w) => $w->where('from_chef_id', $me?->id ?? 0)->orWhere('to_chef_id', $me?->id ?? 0));
        }
        $swaps = $q->limit(100)->get();
        $ids = $swaps->pluck('shift_id')->merge($swaps->pluck('return_shift_id'))->filter()->unique()->values();
        $shiftQ = Shift::whereIn('id', $ids);
        if ($scope) {
            $scope($shiftQ);
        }
        $shifts = $shiftQ->get()->keyBy('id');
        $chefs = Chef::pluck('display_name', 'id');
        $stations = KitchenService::installed() ? Station::pluck('name', 'id') : collect();
        $out = [];
        foreach ($swaps as $sw) {
            if (! $shifts->has($sw->shift_id)) {
                continue;   // a branch this person is not cleared for
            }
            $row = fn (?Shift $s) => $s ? $this->rota->shiftRow($s, $stations, $chefs) : null;
            $out[] = ['id' => $sw->id, 'status' => $sw->status, 'status_label' => Swap::STATUSES[$sw->status] ?? $sw->status, 'from_chef_id' => $sw->from_chef_id, 'from' => $chefs[$sw->from_chef_id] ?? null,
                'to_chef_id' => $sw->to_chef_id, 'to' => $chefs[$sw->to_chef_id] ?? null, 'shift' => $row($shifts[$sw->shift_id]), 'return_shift' => $row($sw->return_shift_id ? ($shifts[$sw->return_shift_id] ?? null) : null),
                'note' => $sw->note, 'decision_note' => $sw->decision_note,
                'can_respond' => $sw->status === 'asked' && $me && (int) $sw->to_chef_id === (int) $me->id, 'can_decide' => $manager && $sw->status === 'agreed',
                'can_cancel' => $sw->open() && ($manager || ($me && (int) $sw->from_chef_id === (int) $me->id))];
        }

        return $out;
    }
}
