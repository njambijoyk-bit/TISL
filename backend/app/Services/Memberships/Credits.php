<?php

namespace App\Services\Memberships;

use App\Models\Memberships\CreditEntry;
use App\Models\Memberships\Membership;
use App\Services\Books\BooksException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Credits (class passes). A plan with the Credits benefit grants a number of credits each paid period; they are spent on things that take credits (an offering priced in credits) and either
 * expire at the end of the period they were granted for or roll over. The ledger keeps every grant, spend, expiry, give-back and staff adjustment; a spend takes from the grant that expires
 * first. Credits can only be spent while the member is in good standing.
 */
class Credits
{
    public static function installed(): bool
    {
        return Schema::hasTable('membership_credits');
    }

    public static function register(MembershipBenefits $r): void
    {
        $r->register('credits', 'Credits (class passes)', 'memberships', [self::class, 'validate'], [self::class, 'describe'], fn (Membership $m, array $c) => app(self::class)->grantPeriod($m, $c));
    }

    /** @param array<string, mixed> $c @return array<string, mixed> */
    public static function validate(array $c): array
    {
        $n = (int) ($c['amount'] ?? 0);
        if ($n < 1 || $n > 1000) {
            throw new BooksException('Give 1 to 1000 credits each period.');
        }

        return ['amount' => $n, 'rollover' => (bool) ($c['rollover'] ?? false)];
    }

    /** @param array<string, mixed> $c */
    public static function describe(array $c): string
    {
        $n = (int) ($c['amount'] ?? 0);

        return $n.' credit'.($n === 1 ? '' : 's').' each period'.(! empty($c['rollover']) ? ', unused ones roll over' : ', use them within the period');
    }

    /** The credits for the period the member has just paid: once per period, whatever number of times this is asked. @param array<string, mixed> $c */
    public function grantPeriod(Membership $m, array $c): void
    {
        if (! self::installed() || ! $m->period_from) {
            return;
        }
        $key = $m->id.':'.$m->period_from->toDateString();
        if (CreditEntry::where('membership_id', $m->id)->where('period_key', $key)->exists()) {
            return;
        }
        $n = (int) ($c['amount'] ?? 0);
        if ($n < 1) {
            return;
        }
        CreditEntry::create(['membership_id' => $m->id, 'user_id' => $m->member_user_id, 'kind' => 'grant', 'delta' => $n, 'remaining' => $n, 'period_key' => $key, 'expires_at' => ! empty($c['rollover']) ? null : $m->paid_until?->copy()->startOfDay(),
            'note' => 'Credits for the period from '.$m->period_from->format('j M Y'), 'created_at' => now()]);
    }

    private function usable(int $userId, ?Carbon $now = null)
    {
        $now ??= now();

        return CreditEntry::where('user_id', $userId)->where('kind', 'grant')->where('remaining', '>', 0)->where(fn ($w) => $w->whereNull('expires_at')->orWhere('expires_at', '>', $now))
            ->orderByRaw('expires_at IS NULL')->orderBy('expires_at')->orderBy('id');
    }

    /** What the person can spend now: nothing unless they hold a membership in good standing. */
    public function balance(int $userId, ?Carbon $now = null): int
    {
        if (! self::installed() || ! MemberStanding::membership($userId)) {
            return 0;
        }

        return (int) $this->usable($userId, $now)->sum('remaining');
    }

    /** Credits the person has but cannot use right now (their membership is paused or lapsed). */
    public function held(int $userId): int
    {
        return self::installed() ? (int) $this->usable($userId)->sum('remaining') - $this->balance($userId) : 0;
    }

    public function spend(int $userId, int $n, string $sourceType, int $sourceId, ?string $note = null, ?int $by = null): CreditEntry
    {
        if ($n < 1) {
            throw new BooksException('Spend at least one credit.');
        }
        if (! MemberStanding::membership($userId)) {
            throw new BooksException('Credits come with a membership in good standing.');
        }

        return DB::transaction(function () use ($userId, $n, $sourceType, $sourceId, $note, $by) {
            $grants = $this->usable($userId)->lockForUpdate()->get();
            if ((int) $grants->sum('remaining') < $n) {
                throw new BooksException('You need '.$n.' credit'.($n === 1 ? '' : 's').' and have '.(int) $grants->sum('remaining').'.');
            }
            $left = $n;
            $alloc = [];
            foreach ($grants as $g) {
                if ($left < 1) {
                    break;
                }
                $take = min($left, (int) $g->remaining);
                $g->update(['remaining' => (int) $g->remaining - $take]);
                $alloc[] = ['grant_id' => $g->id, 'n' => $take];
                $left -= $take;
            }

            return CreditEntry::create(['membership_id' => $grants->first()->membership_id, 'user_id' => $userId, 'kind' => 'spend', 'delta' => -$n, 'allocations' => $alloc, 'source_type' => $sourceType, 'source_id' => $sourceId,
                'note' => $note ? mb_substr($note, 0, 200) : null, 'by_user_id' => $by, 'created_at' => now()]);
        });
    }

    /** Put back what a spend took (the thing it paid for was cancelled). Credits that have expired meanwhile come back for 30 days. */
    public function giveBack(string $sourceType, int $sourceId, ?string $note = null): int
    {
        if (! self::installed()) {
            return 0;
        }
        $spend = CreditEntry::where('kind', 'spend')->where('source_type', $sourceType)->where('source_id', $sourceId)->orderByDesc('id')->first();
        if (! $spend || CreditEntry::where('kind', 'refund')->where('source_type', $sourceType)->where('source_id', $sourceId)->where('created_at', '>=', $spend->created_at)->exists()) {
            return 0;
        }

        return DB::transaction(function () use ($spend, $sourceType, $sourceId, $note) {
            $back = 0;
            $late = 0;
            foreach ($spend->allocations ?? [] as $a) {
                $g = CreditEntry::lockForUpdate()->find($a['grant_id']);
                if ($g && ($g->expires_at === null || $g->expires_at->gt(now()))) {
                    $g->update(['remaining' => (int) $g->remaining + (int) $a['n']]);
                } else {
                    $late += (int) $a['n'];
                }
                $back += (int) $a['n'];
            }
            if ($late > 0) {
                CreditEntry::create(['membership_id' => $spend->membership_id, 'user_id' => $spend->user_id, 'kind' => 'grant', 'delta' => 0, 'remaining' => $late, 'expires_at' => now()->addDays(30), 'note' => 'Credits given back after they had expired', 'created_at' => now()]);
            }
            CreditEntry::create(['membership_id' => $spend->membership_id, 'user_id' => $spend->user_id, 'kind' => 'refund', 'delta' => $back, 'source_type' => $sourceType, 'source_id' => $sourceId, 'note' => $note ? mb_substr($note, 0, 200) : 'Given back', 'created_at' => now()]);

            return $back;
        });
    }

    /** Staff add or take away credits, with a reason. */
    public function adjust(Membership $m, int $delta, string $reason, ?int $by = null): CreditEntry
    {
        $reason = trim($reason);
        if ($delta === 0 || abs($delta) > 1000) {
            throw new BooksException('Enter a number of credits between 1 and 1000, positive to add or negative to take away.');
        }
        if ($reason === '') {
            throw new BooksException('Say why the credits are changed.');
        }
        if ($delta > 0) {
            return CreditEntry::create(['membership_id' => $m->id, 'user_id' => $m->member_user_id, 'kind' => 'adjust', 'delta' => $delta, 'remaining' => $delta, 'note' => mb_substr($reason, 0, 200), 'by_user_id' => $by, 'created_at' => now()]);
        }
        if ($this->usable($m->member_user_id)->sum('remaining') < -$delta) {
            throw new BooksException('The member has fewer credits than that.');
        }

        return DB::transaction(function () use ($m, $delta, $reason, $by) {
            $left = -$delta;
            foreach ($this->usable($m->member_user_id)->lockForUpdate()->get() as $g) {
                if ($left < 1) {
                    break;
                }
                $take = min($left, (int) $g->remaining);
                $g->update(['remaining' => (int) $g->remaining - $take]);
                $left -= $take;
            }

            return CreditEntry::create(['membership_id' => $m->id, 'user_id' => $m->member_user_id, 'kind' => 'adjust', 'delta' => $delta, 'note' => mb_substr($reason, 0, 200), 'by_user_id' => $by, 'created_at' => now()]);
        });
    }

    /** Credits whose time has run out, and those of memberships that have ended, are written off. Part of the hourly job. @return int credits expired */
    public function expire(?Carbon $now = null): int
    {
        if (! self::installed()) {
            return 0;
        }
        $now ??= now();
        $ended = Membership::whereIn('status', ['cancelled', 'ended'])->pluck('id');
        $n = 0;
        foreach (CreditEntry::where('kind', 'grant')->where('remaining', '>', 0)->where(fn ($w) => $w->where(fn ($x) => $x->whereNotNull('expires_at')->where('expires_at', '<=', $now))->orWhereIn('membership_id', $ended))->get() as $g) {
            CreditEntry::create(['membership_id' => $g->membership_id, 'user_id' => $g->user_id, 'kind' => 'expire', 'delta' => -(int) $g->remaining, 'note' => 'Credits expired', 'created_at' => $now]);
            $n += (int) $g->remaining;
            $g->update(['remaining' => 0]);
        }

        return $n;
    }

    /** @return array<int, array<string, mixed>> */
    public function ledger(int $userId, int $limit = 40): array
    {
        if (! self::installed()) {
            return [];
        }

        return CreditEntry::where('user_id', $userId)->where(fn ($w) => $w->where('delta', '!=', 0)->orWhere('kind', 'grant'))->orderByDesc('id')->limit($limit)->get()
            ->map(fn (CreditEntry $e) => ['id' => $e->id, 'kind' => $e->kind, 'delta' => $e->delta, 'note' => $e->note, 'expires_at' => $e->kind === 'grant' && $e->remaining > 0 ? $e->expires_at?->toIso8601String() : null, 'at' => $e->created_at?->toIso8601String()])->values()->all();
    }

    /** @return array{balance: int, held: int, ledger: array<int, array<string, mixed>>} */
    public function summary(int $userId): array
    {
        return ['balance' => $this->balance($userId), 'held' => $this->held($userId), 'ledger' => $this->ledger($userId)];
    }
}
