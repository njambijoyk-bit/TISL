<?php

namespace App\Services\Books;

use App\Models\Books\Ledger;
use App\Models\Books\VoucherType;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

/**
 * Voucher templates: a saved voucher shape, used any time or repeating on a schedule. What is saved is the form as it was (its entries, lines, narration), so using a template is putting
 * that back on the form for a person to finish and post. A repeating template never posts: when it falls due it leaves a DRAFT in the inbox, which a person opens, checks and posts.
 */
class VoucherTemplateService
{
    public const REPEATS = ['none', 'weekly', 'monthly', 'quarterly', 'yearly'];

    /** The starter set: name => [category, base type, narration, [ [side, [ledger names to try]], ... ]]. A ledger that is not in the chart is left for the person to pick. */
    private const STARTERS = [
        'Pay rent' => ['Premises', 'journal', 'Rent for the month', [['D', ['Office Rent', 'Rent Expense', 'Rent', 'Rent & Rates']], ['C', ['Cash', 'Bank', 'Cash at Bank']]]],
        'Pay electricity' => ['Premises', 'journal', 'Electricity bill', [['D', ['Electricity Expense', 'Electricity']], ['C', ['Cash', 'Bank', 'Cash at Bank']]]],
        'Pay water' => ['Premises', 'journal', 'Water bill', [['D', ['Water Expense', 'Water']], ['C', ['Cash', 'Bank', 'Cash at Bank']]]],
        'Staff meals' => ['Staff', 'journal', 'Staff meals and refreshments', [['D', ['Staff Meals', 'Staff Meals & Refreshments', 'Staff Welfare']], ['C', ['Cash', 'Bank']]]],
        'Pay a deposit' => ['Deposits', 'journal', 'Deposit paid (refundable)', [['D', ['Rent Deposit', 'Security Deposits Asset', 'Electricity Deposit']], ['C', ['Cash', 'Bank']]]],
        'Refund of a deposit' => ['Deposits', 'journal', 'Deposit refunded to us', [['D', ['Cash', 'Bank']], ['C', ['Rent Deposit', 'Security Deposits Asset', 'Electricity Deposit']]]],
        'Insurance prepayment' => ['Insurance', 'journal', 'Insurance paid in advance', [['D', ['Prepaid Insurance']], ['C', ['Cash', 'Bank']]]],
        'Bank charges' => ['Finance', 'journal', 'Bank charges', [['D', ['Bank Charges', 'Bank Service Charges']], ['C', ['Bank', 'Cash']]]],
        'Loan interest' => ['Finance', 'journal', 'Loan interest paid', [['D', ['Loan Interest', 'Interest Expense']], ['C', ['Bank', 'Cash']]]],
        'Petty cash top-up' => ['Cash', 'journal', 'Petty cash topped up', [['D', ['Petty Cash']], ['C', ['Cash', 'Bank']]]],
        'Disposal of an asset' => ['Assets', 'journal', 'Disposal of asset (delete the gain or loss line that does not apply)', [['D', ['Bank', 'Cash']], ['D', ['Accumulated Depreciation']], ['D', ['Loss on disposal of assets']], ['C', []], ['C', ['Gain on disposal of assets']]]],
        'Capital introduced' => ['Capital', 'journal', 'Capital introduced by the owners', [['D', ['Bank', 'Cash']], ['C', ['Capital', 'Capital Account', 'Owner\'s Capital']]]],
    ];

    public static function ready(): bool
    {
        return Schema::hasTable('voucher_templates') && Schema::hasTable('voucher_template_drafts');
    }

    /** Script 251: a deleted template goes to a trash and can be restored. Without it, deleting removes for good as before. */
    public static function hasTrash(): bool
    {
        return Schema::hasColumn('voucher_templates', 'deleted_at');
    }

    /** The templates in use (not in the trash). */
    private function live()
    {
        return DB::table('voucher_templates')->when(self::hasTrash(), fn ($q) => $q->whereNull('deleted_at'));
    }

    // ── the schedule ─────────────────────────────────────────────────────

    /** The first due date after $from for a repeat (a day past the end of a short month falls on the month's last day). */
    public static function nextDue(Carbon $from, string $every, ?int $day): ?Carbon
    {
        $from = $from->copy()->startOfDay();
        $clamp = fn (Carbon $m) => $m->copy()->day(min(max($day ?: $from->day, 1), $m->daysInMonth));

        return match ($every) {
            'weekly' => $from->copy()->addWeek()->startOfWeek()->addDays(max(min($day ?: $from->dayOfWeekIso, 7), 1) - 1),
            'monthly' => $clamp($from->copy()->startOfMonth()->addMonthNoOverflow()),
            'quarterly' => $clamp($from->copy()->startOfMonth()->addMonthsNoOverflow(3)),
            'yearly' => $clamp($from->copy()->startOfMonth()->addYearNoOverflow()),
            default => null,
        };
    }

    /** The first date a new schedule is due: this period's day if it is still ahead, else the next one. */
    public static function firstDue(Carbon $today, string $every, ?int $day): ?Carbon
    {
        if ($every === 'none') {
            return null;
        }
        $base = match ($every) {
            'weekly' => $today->copy()->startOfWeek()->addDays(max(min($day ?: 1, 7), 1) - 1),
            default => $today->copy()->startOfMonth()->day(min(max($day ?: $today->day, 1), $today->daysInMonth)),
        };

        return $base->gte($today->copy()->startOfDay()) ? $base : self::nextDue($base, $every, $day);
    }

    // ── templates ────────────────────────────────────────────────────────

    public function all(): array
    {
        return $this->live()->orderBy('category')->orderBy('name')->get()->map(fn ($t) => $this->shape($t))->all();
    }

    private function shape($t): array
    {
        return ['id' => (int) $t->id, 'name' => $t->name, 'category' => $t->category, 'form' => $t->form, 'voucher_type_id' => $t->voucher_type_id ? (int) $t->voucher_type_id : null, 'base_type' => $t->base_type,
            'form_state' => is_string($t->form_state) ? json_decode($t->form_state, true) : $t->form_state, 'repeat_every' => $t->repeat_every, 'repeat_day' => $t->repeat_day ? (int) $t->repeat_day : null,
            'next_due_on' => $t->next_due_on, 'last_made_on' => $t->last_made_on, 'is_active' => (bool) $t->is_active, 'is_starter' => (bool) $t->is_starter];
    }

    /** @param array $in name, category, form, voucher_type_id, form_state, repeat_every, repeat_day */
    public function save(array $in, ?User $by, ?int $id = null): array
    {
        $every = $in['repeat_every'] ?? 'none';
        if (! in_array($every, self::REPEATS, true)) {
            throw ValidationException::withMessages(['repeat_every' => 'Choose none, weekly, monthly, quarterly or yearly.']);
        }
        $name = trim((string) $in['name']);
        $same = DB::table('voucher_templates')->where('name', $name)->when($id, fn ($q) => $q->where('id', '!=', $id))->first();
        if ($same) {
            throw ValidationException::withMessages(['name' => ! empty($same->deleted_at) ? 'A deleted template has that name. Restore it, or delete it for good, in Configuration, Voucher templates.' : 'There is a template called that already.']);
        }
        $day = ! empty($in['repeat_day']) ? (int) $in['repeat_day'] : null;
        $type = ! empty($in['voucher_type_id']) ? VoucherType::find($in['voucher_type_id']) : null;
        $row = ['name' => $name, 'category' => $in['category'] ?? null, 'form' => $in['form'] ?? 'voucher', 'voucher_type_id' => $type?->id, 'base_type' => $type?->base_type ?? ($in['base_type'] ?? null),
            'form_state' => json_encode($in['form_state'] ?? null), 'repeat_every' => $every, 'repeat_day' => $every === 'none' ? null : $day, 'is_active' => (bool) ($in['is_active'] ?? true), 'updated_at' => now()];
        $before = $id ? DB::table('voucher_templates')->where('id', $id)->first() : null;
        // a schedule that is new or changed starts counting from today
        $row['next_due_on'] = $every === 'none' ? null : (($before && $before->repeat_every === $every && (int) $before->repeat_day === (int) $day && $before->next_due_on) ? $before->next_due_on : self::firstDue(today(), $every, $day)?->toDateString());
        if ($id) {
            DB::table('voucher_templates')->where('id', $id)->update($row);
        } else {
            $id = (int) DB::table('voucher_templates')->insertGetId($row + ['is_starter' => 0, 'created_by' => $by?->id, 'created_at' => now()]);
        }

        return $this->shape(DB::table('voucher_templates')->where('id', $id)->first());
    }

    /** Delete: into the trash when there is one (its drafts wait there with it), else for good. */
    public function delete(int $id, ?User $by = null): void
    {
        if (self::hasTrash()) {
            DB::table('voucher_templates')->where('id', $id)->update(['deleted_at' => now(), 'deleted_by' => $by?->id, 'is_active' => 0, 'updated_at' => now()]);

            return;
        }
        $this->purge($id);
    }

    /** Delete for good, with its drafts. */
    public function purge(int $id): void
    {
        DB::transaction(function () use ($id) {
            DB::table('voucher_template_drafts')->where('template_id', $id)->delete();
            DB::table('voucher_templates')->where('id', $id)->delete();
        });
    }

    /** Bring a deleted template back. It comes back paused, so nothing starts repeating until it is switched on. */
    public function restore(int $id): void
    {
        if (self::hasTrash()) {
            DB::table('voucher_templates')->where('id', $id)->update(['deleted_at' => null, 'deleted_by' => null, 'is_active' => 0, 'updated_at' => now()]);
        }
    }

    /** Pause or resume a template. Resuming a repeating one counts its schedule from today. */
    public function setActive(int $id, bool $active): void
    {
        $t = DB::table('voucher_templates')->where('id', $id)->first();
        if (! $t) {
            return;
        }
        $next = $t->next_due_on;
        if ($active && $t->repeat_every !== 'none' && (! $next || Carbon::parse($next)->lt(today()))) {
            $next = self::firstDue(today(), $t->repeat_every, $t->repeat_day ? (int) $t->repeat_day : null)?->toDateString();
        }
        DB::table('voucher_templates')->where('id', $id)->update(['is_active' => $active ? 1 : 0, 'next_due_on' => $next, 'updated_at' => now()]);
    }

    /** The templates in the trash. */
    public function trash(): array
    {
        return self::hasTrash() ? DB::table('voucher_templates')->whereNotNull('deleted_at')->orderByDesc('deleted_at')->get()->map(fn ($t) => $this->shape($t) + ['deleted_at' => $t->deleted_at])->all() : [];
    }

    /** The starter templates that are not in use (never added, or deleted), by name. */
    public function startersMissing(): array
    {
        $have = $this->live()->pluck('name')->all();

        return array_values(array_diff(array_keys(self::STARTERS), $have));
    }

    /** Add the starter templates that are not there yet. Returns the names made. */
    public function addStarters(?User $by, ?array $only = null): array
    {
        $made = [];
        $journal = VoucherType::where('base_type', VoucherType::JOURNAL)->where('is_active', true)->first();
        foreach (self::STARTERS as $name => [$category, $base, $narration, $sides]) {
            if ($only !== null && ! in_array($name, $only, true)) {
                continue;
            }
            $have = DB::table('voucher_templates')->where('name', $name)->first();
            if ($have && empty($have->deleted_at)) {
                continue;
            }
            if ($have) {   // deleted: the same one comes back (keeping any ledgers set on it), paused
                $this->restore((int) $have->id);
                $made[] = $name;

                continue;
            }
            $entries = [];
            foreach ($sides as [$side, $names]) {
                $found = Ledger::whereIn('name', $names)->pluck('id', 'name');
                $id = null;
                foreach ($names as $n) {   // the first of the names that is in the chart
                    $id ??= $found[$n] ?? null;
                }
                $entries[] = ['ledger_id' => $id ?: '', 'side' => $side, 'amount' => ''];
            }
            DB::table('voucher_templates')->insert(['name' => $name, 'category' => $category, 'form' => 'voucher', 'voucher_type_id' => $journal?->id, 'base_type' => $base,
                'form_state' => json_encode(['h' => ['narration' => $narration], 'lines' => [], 'entries' => $entries, 'tenders' => [], 'acct' => false]),
                'repeat_every' => 'none', 'is_active' => 1, 'is_starter' => 1, 'created_by' => $by?->id, 'created_at' => now(), 'updated_at' => now()]);
            $made[] = $name;
        }

        return $made;
    }

    // ── the drafts a schedule leaves ─────────────────────────────────────

    /**
     * For every active template whose repeat has come due, leave one draft (the latest date due) and move its schedule on past today. Nothing is posted. Returns how many drafts were made.
     */
    public function makeDue(?Carbon $today = null): int
    {
        $today = ($today ?? today())->copy()->startOfDay();
        $made = 0;
        foreach ($this->live()->where('is_active', 1)->where('repeat_every', '!=', 'none')->whereNotNull('next_due_on')->whereDate('next_due_on', '<=', $today)->get() as $t) {
            $due = Carbon::parse($t->next_due_on);
            $latest = $due->copy();
            $next = $due;
            while ($next && $next->lte($today)) {   // a long-missed schedule leaves one draft, for the latest date that was due
                $latest = $next->copy();
                $next = self::nextDue($next, $t->repeat_every, $t->repeat_day ? (int) $t->repeat_day : null);
            }
            DB::transaction(function () use ($t, $latest, $next, &$made) {
                $inserted = DB::table('voucher_template_drafts')->insertOrIgnore(['template_id' => $t->id, 'due_on' => $latest->toDateString(), 'form_state' => $t->form_state, 'status' => 'pending', 'created_at' => now(), 'updated_at' => now()]);
                $made += (int) $inserted;
                DB::table('voucher_templates')->where('id', $t->id)->update(['next_due_on' => $next?->toDateString(), 'last_made_on' => $latest->toDateString(), 'updated_at' => now()]);
            });
        }

        return $made;
    }

    /** @return array<int, array> the drafts waiting (or opened but not finished) with their template's name */
    public function drafts(array $statuses = ['pending', 'opened']): array
    {
        return DB::table('voucher_template_drafts as d')->join('voucher_templates as t', 't.id', '=', 'd.template_id')->when(self::hasTrash(), fn ($q) => $q->whereNull('t.deleted_at'))->whereIn('d.status', $statuses)
            ->orderBy('d.due_on')->get(['d.id', 'd.due_on', 'd.status', 'd.form_state', 't.id as template_id', 't.name', 't.category', 't.form', 't.voucher_type_id', 't.base_type'])
            ->map(fn ($d) => ['id' => (int) $d->id, 'due_on' => $d->due_on, 'status' => $d->status, 'template_id' => (int) $d->template_id, 'name' => $d->name, 'category' => $d->category, 'form' => $d->form,
                'voucher_type_id' => $d->voucher_type_id ? (int) $d->voucher_type_id : null, 'base_type' => $d->base_type, 'form_state' => is_string($d->form_state) ? json_decode($d->form_state, true) : $d->form_state])->all();
    }

    public function markDraft(int $id, string $status, ?User $by): void
    {
        DB::table('voucher_template_drafts')->where('id', $id)->update(['status' => $status, 'handled_by' => $by?->id, 'handled_at' => now(), 'updated_at' => now()]);
    }
}
