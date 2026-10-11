<?php

namespace App\Services\Menus;

use App\Models\AttendanceDay;
use App\Models\Menus\Chef;
use App\Models\Menus\OvertimeEntry;
use App\Models\User;
use App\Services\Attendance\AttendanceService;
use App\Services\Books\BooksException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;

/**
 * The overtime approval step. When Menus settings ask for it, overtime is not paid until a manager has approved it: each day with overtime becomes an entry (worked out from the rota
 * or from attendance, as chosen), pending until decided. Payroll then pays only what was approved (never more than was worked), and a payroll run can not be approved while any entry
 * for it is still waiting. If the hours change after approval, an entry that grew goes back to waiting; one that shrank is simply paid at the smaller figure.
 * Chefs are always covered. Other staff with attendance are covered too when the setting for them is on (and script 149 has been run): their overtime comes from attendance, and it is
 * approved by someone who may mark that person's attendance (their manager or an assigned marker), as well as holding menus.manage.
 */
class RotaOvertime
{
    public static function installed(): bool
    {
        return Schema::hasTable('menus_overtime');
    }

    /** Entries belong to a person (script 149), so other staff can have them. Before that script they belong to chefs only. */
    public static function byUser(): bool
    {
        return self::installed() && Schema::hasColumn('menus_overtime', 'user_id');
    }

    public function __construct(private RotaPay $pay, private RotaNotices $notices)
    {
    }

    private function tz(): string
    {
        return (string) config('app.timezone', 'Africa/Nairobi');
    }

    /** Is a manager's approval needed before overtime is paid? */
    public function required(): bool
    {
        return self::installed() && (bool) MenusSettings::all()['rota_overtime_needs_approval'];
    }

    /** Does the approval step cover other staff as well as chefs? */
    public function coversStaff(): bool
    {
        return $this->required() && self::byUser() && (bool) MenusSettings::all()['rota_overtime_staff'];
    }

    /** Is this person's overtime held for approval? A chef's always is; other staff's only when the setting says so. */
    public function covers(int $userId): bool
    {
        if (! $this->required()) {
            return false;
        }

        return Chef::where('user_id', $userId)->exists() || ($this->coversStaff() && Schema::hasTable('employees') && \App\Models\Employee::where('user_id', $userId)->exists());
    }

    /** The overtime a day gives before any approval: the rota's for a chef when the setting says so, otherwise what attendance recorded. */
    public function raw(int $userId, string $date, ?AttendanceDay $row): int
    {
        if ($this->pay->appliesTo($userId)) {   // the setting says rota and this person is a chef
            return $this->pay->dayOvertime($userId, $date, $row);
        }

        return (int) ($row?->overtime_minutes ?? 0);
    }

    /** The overtime minutes payroll may pay for a verified day: all of it when no approval is needed for this person, otherwise only what a manager approved (never more than was worked). */
    public function payable(int $userId, string $date, ?AttendanceDay $row): int
    {
        $raw = $this->raw($userId, $date, $row);
        if ($raw <= 0 || ! $this->covers($userId)) {
            return $raw;
        }
        $q = OvertimeEntry::where('work_date', $date)->where('status', 'approved');
        $e = self::byUser() ? $q->where('user_id', $userId)->first() : $q->where('chef_id', (int) Chef::where('user_id', $userId)->value('id'))->first();

        return $e ? min($raw, (int) $e->minutes) : 0;
    }

    /** @return array<int, array{user_id: int, chef_id: ?int}> the people whose overtime is held for approval */
    private function people(): array
    {
        $out = [];
        foreach (Chef::whereNotNull('user_id')->get() as $c) {
            $out[(int) $c->user_id] = ['user_id' => (int) $c->user_id, 'chef_id' => (int) $c->id];
        }
        if ($this->coversStaff() && Schema::hasTable('employees')) {
            foreach (\App\Models\Employee::whereNotNull('user_id')->whereNull('termination_date')->pluck('user_id') as $uid) {
                $out[(int) $uid] ??= ['user_id' => (int) $uid, 'chef_id' => null];
            }
        }

        return $out;
    }

    /**
     * Make an entry for every covered person's day with overtime in a stretch (a day that is over, signed in and out). Safe to repeat. New ones are pending; one that was approved and grew goes back to pending.
     *
     * @return int how many entries are new or went back to waiting
     */
    public function sync(Carbon $from, Carbon $to, bool $notify = false): int
    {
        if (! self::installed() || ! Schema::hasTable('attendance_days')) {
            return 0;
        }
        $now = Carbon::now($this->tz());
        $byUser = self::byUser();
        $changed = 0;
        foreach ($this->people() as $p) {
            if (! $byUser && ! $p['chef_id']) {
                continue;
            }
            $rows = AttendanceDay::where('user_id', $p['user_id'])->whereBetween('work_date', [$from->toDateString(), $to->toDateString()])->whereNotNull('sign_in_at')->whereNotNull('sign_out_at')->get();
            foreach ($rows as $r) {
                $date = $r->work_date->toDateString();
                if (Carbon::parse($date, $this->tz())->endOfDay()->gte($now)) {
                    continue;   // the day is not over
                }
                $m = $this->raw($p['user_id'], $date, $r);
                $q = OvertimeEntry::where('work_date', $date);
                $e = $byUser ? $q->where('user_id', $p['user_id'])->first() : $q->where('chef_id', $p['chef_id'])->first();
                if ($m <= 0) {
                    if ($e && $e->status !== 'approved') {
                        $e->delete();   // the hours no longer give overtime: nothing to decide
                    } elseif ($e) {
                        $e->update(['minutes' => 0]);
                    }
                    continue;
                }
                if (! $e) {
                    OvertimeEntry::create(['chef_id' => $p['chef_id'], 'work_date' => $date, 'minutes' => $m, 'status' => 'pending'] + ($byUser ? ['user_id' => $p['user_id']] : []));
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

    /** The person an entry is about. */
    private function userOf(OvertimeEntry $e): ?int
    {
        return ($e->user_id ?? null) ? (int) $e->user_id : ($e->chef_id ? (int) Chef::whereKey($e->chef_id)->value('user_id') : null);
    }

    /**
     * A manager approves or rejects an entry. Nobody decides their own overtime while another manager could, and an entry of someone who is not a chef is decided only by a person who may mark that
     * person's attendance.
     */
    public function decide(OvertimeEntry $e, bool $approve, ?string $note, ?User $by, bool $otherManagers): OvertimeEntry
    {
        $uid = $this->userOf($e);
        if ($by && $uid && $uid === (int) $by->id && $otherManagers) {
            throw new BooksException('Someone else has to decide your own overtime.');
        }
        if (! $e->chef_id && $by && $uid && AttendanceService::ready() && ! app(AttendanceService::class)->canMark($by, $uid)) {
            throw new BooksException('Only this person\'s manager or the person marking their attendance can decide their overtime.');
        }
        if ($e->minutes <= 0) {
            throw new BooksException('There is no overtime on that day any more.');
        }
        $e->update(['status' => $approve ? 'approved' : 'rejected', 'decided_by' => $by?->id, 'decided_at' => now(), 'note' => filled($note) ? mb_substr(trim((string) $note), 0, 300) : null]);

        return $e->fresh();
    }

    /**
     * The entries of a stretch (for one person when $onlyUser is set). A viewer sees chefs' entries, and other staff's only when they may mark that person's attendance.
     *
     * @return array<int, array<string, mixed>>
     */
    public function rows(Carbon $from, Carbon $to, ?int $onlyUser = null, ?User $viewer = null): array
    {
        if (! self::installed()) {
            return [];
        }
        $chefs = Chef::pluck('display_name', 'id');
        $byUser = self::byUser();
        $q = OvertimeEntry::whereBetween('work_date', [$from->toDateString(), $to->toDateString()])->where('minutes', '>', 0)
            ->orderByRaw("CASE status WHEN 'pending' THEN 0 ELSE 1 END")->orderBy('work_date')->orderBy('id');
        if ($onlyUser) {
            $byUser ? $q->where('user_id', $onlyUser) : $q->whereIn('chef_id', Chef::where('user_id', $onlyUser)->pluck('id'));
        }
        $entries = $q->get();
        $names = $byUser ? User::whereIn('id', $entries->pluck('user_id')->filter()->unique())->pluck('name', 'id') : collect();
        $out = [];
        foreach ($entries as $e) {
            $uid = $this->userOf($e);
            if (! $e->chef_id && $viewer && ! $onlyUser && $uid && AttendanceService::ready() && ! app(AttendanceService::class)->canMark($viewer, $uid)) {
                continue;   // another person's staff: not this viewer's to see
            }
            $out[] = ['id' => $e->id, 'chef_id' => $e->chef_id, 'user_id' => $uid, 'chef' => $e->chef_id ? ($chefs[$e->chef_id] ?? null) : ($names[$uid] ?? null), 'kind' => $e->chef_id ? 'chef' : 'staff', 'date' => $e->work_date->toDateString(),
                'hours' => round($e->minutes / 60, 2), 'status' => $e->status, 'status_label' => OvertimeEntry::STATUSES[$e->status] ?? $e->status, 'note' => $e->note];
        }

        return $out;
    }
}
