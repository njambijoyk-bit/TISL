<?php

namespace App\Services\Memberships;

use App\Models\Location;
use App\Models\Memberships\Checkin;
use App\Models\Memberships\Membership;
use App\Models\Memberships\Plan;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Codes\CodeFactory;
use App\Services\Codes\CodeResolvers;
use App\Services\Codes\Signed;
use Illuminate\Support\Facades\Schema;

/**
 * The member card and checking members in. The card is a signed code `mem.USERID.SIGNATURE` (see Signed): it belongs to the person, so it keeps working through renewals and plan changes,
 * and is checked without the database. Scanning it at a door or desk lets the person in when they hold a membership in good standing whose plan covers that branch; every scan is logged,
 * let in or turned away, with the reason. A second scan of the same person at the same branch within 10 minutes is the same visit.
 */
class MemberCheckIn
{
    public const TYPE = 'mem';

    private const REASONS = ['pending' => 'The membership has not been paid yet.', 'paused' => 'The membership is paused.', 'lapsed' => 'The membership has lapsed: a payment is missing.',
        'cancelled' => 'The membership has ended.', 'ended' => 'The membership has ended.'];

    public function __construct(private Credits $credits)
    {
    }

    public static function installed(): bool
    {
        return Schema::hasTable('membership_checkins') && MembershipService::installed();
    }

    /** What the card means: a phone camera opens the member's own page; staff scanning it check the member in at the branch they are at. */
    public static function register(CodeResolvers $r): void
    {
        $r->register(self::TYPE, 'Member card', fn (string $id) => '/membership/my', fn (string $id, User $by, array $ctx) => app(self::class)->check((int) $id, isset($ctx['location_id']) ? (int) $ctx['location_id'] : null, $by, 'card'), 'memberships.checkin');
    }

    public static function code(int $userId): string
    {
        return Signed::make(self::TYPE, $userId);
    }

    public static function qrSvg(int $userId): string
    {
        return CodeFactory::make('qr', Signed::url(self::TYPE, $userId), ['level' => 'M'])->svg(['unit' => 6]);
    }

    /** The person a scanned or typed card stands for, or null when it is not a genuine member card. */
    public static function find(string $scanned): ?int
    {
        $v = Signed::verify($scanned, self::TYPE);

        return $v && ctype_digit($v['id']) ? (int) $v['id'] : null;
    }

    /** @return array<string, mixed> */
    public function check(int $userId, ?int $locationId, ?User $by = null, string $method = 'card'): array
    {
        if (! self::installed()) {
            throw new BooksException('Run database script 167_memberships_checkins.sql first.');
        }
        $u = User::find($userId) ?? throw new BooksException('That card belongs to nobody we know.');
        if ($locationId && ! Location::whereKey($locationId)->exists()) {
            throw new BooksException('Choose the branch you are checking people in at.');
        }
        $m = Membership::where('member_user_id', $u->id)->whereIn('status', Membership::GOOD)->orderByDesc('id')->first()
            ?? Membership::where('member_user_id', $u->id)->orderByDesc('id')->first();
        $plan = $m ? Plan::find($m->plan_id) : null;
        $reason = null;
        $ok = true;
        if (! $m) {
            [$ok, $reason] = [false, 'No membership.'];
        } elseif (! in_array($m->status, Membership::GOOD, true)) {
            [$ok, $reason] = [false, self::REASONS[$m->status] ?? 'The membership is not active.'];
            if ($m->status === 'paused' && $m->paused_until) {
                $reason = 'The membership is paused until '.$m->paused_until->format('j M').'.';
            }
        } elseif ($locationId && $plan && ! $plan->all_branches && ! in_array($locationId, array_map('intval', (array) ($plan->branch_ids ?? [])), true)) {
            [$ok, $reason] = [false, 'This plan is not valid at this branch.'];
        }
        $repeat = false;
        $row = null;
        if ($ok) {
            $row = Checkin::where('user_id', $u->id)->where('result', 'ok')->where('location_id', $locationId)->where('created_at', '>=', now()->subMinutes(10))->orderByDesc('id')->first();
            $repeat = (bool) $row;
        }
        $row ??= Checkin::create(['membership_id' => $m?->id, 'user_id' => $u->id, 'location_id' => $locationId, 'result' => $ok ? 'ok' : 'denied', 'reason' => $reason, 'method' => $method === 'manual' ? 'manual' : 'card',
            'by_user_id' => $by?->id, 'created_at' => now()]);

        return ['ok' => $ok, 'repeat' => $repeat, 'reason' => $reason, 'warning' => $ok && $m?->status === 'past_due' ? 'Their payment is late: remind them to pay.' : null, 'name' => $u->name, 'user_id' => $u->id,
            'number' => $m?->number, 'plan' => $plan?->name, 'status' => $m?->status, 'status_label' => $m ? (Membership::STATUSES[$m->status] ?? $m->status) : null, 'last_day' => $m?->paid_until?->copy()->subDay()->toDateString(),
            'credits' => Credits::installed() && $ok ? $this->credits->balance($u->id) : null, 'visits_30_days' => Checkin::where('user_id', $u->id)->where('result', 'ok')->where('created_at', '>=', now()->subDays(30))->count(),
            'checkin_id' => $row->id, 'at' => $row->created_at?->toIso8601String()];
    }

    /** @return array<int, array<string, mixed>> the latest check-ins, of a branch or of a person */
    public function recent(?int $locationId = null, ?int $userId = null, int $limit = 50, ?array $locationIds = null): array
    {
        if (! self::installed()) {
            return [];
        }
        $rows = Checkin::query()->when($locationId, fn ($q) => $q->where('location_id', $locationId))->when($locationIds !== null, fn ($q) => $q->whereIn('location_id', $locationIds))->when($userId, fn ($q) => $q->where('user_id', $userId))->orderByDesc('id')->limit($limit)->get();
        $names = User::whereIn('id', $rows->pluck('user_id'))->pluck('name', 'id');
        $branches = Location::whereIn('id', $rows->pluck('location_id')->filter())->pluck('name', 'id');

        return $rows->map(fn (Checkin $c) => ['id' => $c->id, 'name' => $names[$c->user_id] ?? '?', 'user_id' => $c->user_id, 'branch' => $branches[$c->location_id] ?? null, 'result' => $c->result, 'reason' => $c->reason, 'method' => $c->method,
            'at' => $c->created_at?->toIso8601String()])->values()->all();
    }

    /** The member's own card. @return array<string, mixed>|null */
    public function card(User $u): ?array
    {
        $m = Membership::where('member_user_id', $u->id)->orderByDesc('id')->first();
        if (! $m) {
            return null;
        }
        $plan = Plan::find($m->plan_id);

        return ['name' => $u->name, 'number' => $m->number, 'plan' => $plan?->name, 'status' => $m->status, 'status_label' => Membership::STATUSES[$m->status] ?? $m->status, 'last_day' => $m->paid_until?->copy()->subDay()->toDateString(),
            'code' => self::code($u->id), 'svg' => self::qrSvg($u->id), 'branches' => $plan && ! $plan->all_branches ? Location::whereIn('id', (array) ($plan->branch_ids ?? []))->orderBy('name')->pluck('name')->all() : null];
    }
}
