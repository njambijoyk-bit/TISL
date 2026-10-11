<?php

namespace App\Services\Menus;

use App\Models\AttendanceDay;
use App\Models\Menus\Chef;
use App\Models\Menus\OvertimeEntry;
use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;

/**
 * The overtime approval step. When Menus settings ask for it, a chef's overtime is not paid until a manager has approved it: each day with overtime becomes an entry (worked out from the rota
 * or from attendance, as chosen), pending until decided. Payroll then pays only what was approved (never more than was worked), and a payroll run can not be approved while any entry
 * for it is still waiting. If the hours change after approval, an entry that grew goes back to waiting; one that shrank is simply paid at the smaller figure. Chefs only: other staff are not affected.
 */
class RotaOvertime
{
    public static function installed(): bool
    {
        return Schema::hasTable('menus_overtime');
    }

    public function __construct(private RotaPay $pay, private RotaNotices $notices)
    {
    }

    private function tz(): string
    {
        return (string) config('app.timezone', 'Africa/Nairobi');
    }

    /** Is a manager's approval needed before a chef's overtime is paid? */
    public function required(): bool
    {
        return self::installed() && (bool) MenusSettings::all()['rota_overtime_needs_approval'];
    }

    /** The overtime a day gives before any approval, by the source chosen in the settings. */
    public function raw(int $userId, string $date, ?AttendanceDay $row): int
    {
        if ($this->pay->appliesTo($userId)) {   // the setting says rota and this person is a chef
            return $this->pay->dayOvertime($userId, $date, $row);
        }

        return (int) ($row?->overtime_minutes ?? 0);
    }

    /**
     * The overtime minutes payroll may pay for a verified day: all of it when no approval is needed (or the person is not a chef), otherwise only what a manager approved.
     */
    public function payable(int $userId, string $date, ?AttendanceDay $row): int
    {
        $raw = $this->raw($userId, $date, $row);
        if ($raw <= 0 || ! $this->required()) {
            return $raw;
        }
        $chef = Chef::where('user_id', $userId)->value('id');
        if (! $chef) {
            return $raw;   // approval is for chefs
        }
        $e = OvertimeEntry::where('chef_id', $chef)->where('work_date', $date)->where('status', 'approved')->first();

        return $e ? min($raw, (int) $e->minutes) : 0;
    }

    /**
     * Make an entry for every chef day with overtime in a stretch (a day that is over, signed in and out). Safe to repeat. New ones are pending; one that was approved and grew goes back to pending.
     *
     * @return int how many entries are new or went back to waiting
     */
    public function sync(Carbon $from, Carbon $to, bool $notify = false): int
    {
        if (! self::installed() || ! Schema::hasTable('attendance_days')) {
            return 0;
        }
        $now = Carbon::now($this->tz());
        $changed = 0;
        foreach (Chef::whereNotNull('user_id')->get() as $c) {
            $rows = AttendanceDay::where('user_id', $c->user_id)->whereBetween('work_date', [$from->toDateString(), $to->toDateString()])->whereNotNull('sign_in_at')->whereNotNull('sign_out_at')->get();
            foreach ($rows as $r) {
                $date = $r->work_date->toDateString();
                if (Carbon::parse($date, $this->tz())->endOfDay()->gte($now)) {
                    continue;   // the day is not over
                }
                $m = $this->raw((int) $c->user_id, $date, $r);
                $e = OvertimeEntry::where('chef_id', $c->id)->where('work_date', $date)->first();
                if ($m <= 0) {
                    if ($e && $e->status !== 'approved') {
                        $e->delete();   // the hours no longer give overtime: nothing to decide
                    } elseif ($e) {
                        $e->update(['minutes' => 0]);
                    }
                    continue;
                }
                if (! $e) {
                    OvertimeEntry::create(['chef_id' => $c->id, 'work_date' => $date, 'minutes' => $m, 'status' => 'pending']);
                    $changed++;
                } elseif ((int) $e->minutes !== $m) {
                    $grew = $m > (int) $e->minutes;
                    $e->update(['minutes' => $m] + ($e->status === 'approved' && $grew ? ['status' => 'pending', 'decided_by' => null, 'decided_at' => null, 'note' => 'Hours changed after approval'] : []));
                    $changed += $e->status === 'pending' && $grew ? 1 : 0;
                }
            }
        }
        if ($notify && $changed > 0 && $this->required()) {
            $this->notices->overtimeWaiting($changed);
        }

        return $changed;
    }

    /** How many entries in a stretch still wait for a decision (payroll for that stretch must wait). */
    public function pendingCount(Carbon $from, Carbon $to): int
    {
        if (! $this->required()) {
            return 0;
        }

        return OvertimeEntry::where('status', 'pending')->where('minutes', '>', 0)->whereBetween('work_date', [$from->toDateString(), $to->toDateString()])->count();
    }

    /** A manager approves or rejects an entry. Nobody decides their own overtime while another manager could. */
    public function decide(OvertimeEntry $e, bool $approve, ?string $note, ?User $by, bool $otherManagers): OvertimeEntry
    {
        $chef = Chef::find($e->chef_id);
        if ($chef && $by && (int) $chef->user_id === (int) $by->id && $otherManagers) {
            throw new BooksException('Someone else has to decide your own overtime.');
        }
        if ($e->minutes <= 0) {
            throw new BooksException('There is no overtime on that day any more.');
        }
        $e->update(['status' => $approve ? 'approved' : 'rejected', 'decided_by' => $by?->id, 'decided_at' => now(), 'note' => filled($note) ? mb_substr(trim((string) $note), 0, 300) : null]);

        return $e->fresh();
    }

    /** @return array<int, array<string, mixed>> the entries of a stretch (for one chef when $onlyChef is set) */
    public function rows(Carbon $from, Carbon $to, ?int $onlyChef = null): array
    {
        if (! self::installed()) {
            return [];
        }
        $names = Chef::pluck('display_name', 'id');

        return OvertimeEntry::whereBetween('work_date', [$from->toDateString(), $to->toDateString()])->where('minutes', '>', 0)->when($onlyChef, fn ($q) => $q->where('chef_id', $onlyChef))
            ->orderByRaw("CASE status WHEN 'pending' THEN 0 ELSE 1 END")->orderBy('work_date')->orderBy('chef_id')->get()
            ->map(fn (OvertimeEntry $e) => ['id' => $e->id, 'chef_id' => $e->chef_id, 'chef' => $names[$e->chef_id] ?? null, 'date' => $e->work_date->toDateString(), 'hours' => round($e->minutes / 60, 2), 'status' => $e->status,
                'status_label' => OvertimeEntry::STATUSES[$e->status] ?? $e->status, 'note' => $e->note])->values()->all();
    }
}
