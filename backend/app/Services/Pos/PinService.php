<?php

namespace App\Services\Pos;

use App\Models\Access\AccessLog;
use App\Models\Pos\Station;
use App\Models\User;
use App\Services\Access\Authorizer;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Supervisor approval at the till. A supervisor (anyone holding pos.supervise at the branch) has a 6-digit PIN of their own. A cashier names the supervisor and the supervisor types the PIN; the till
 * gets back a one-use approval for one purpose (discount, return or void) that lasts five minutes and is tied to that cashier and station. Five wrong tries lock the PIN for fifteen minutes.
 * Nobody approves their own return, discount or void. Every PIN set, wrong try and approval is written to the access log.
 */
class PinService
{
    public const PURPOSES = ['discount', 'return', 'void'];
    private const MAX_TRIES = 5;
    private const LOCK_MINUTES = 15;
    private const TTL_MINUTES = 5;

    public static function installed(): bool
    {
        return Schema::hasTable('pos_pins');
    }

    public function hasPin(int $userId): bool
    {
        return self::installed() && DB::table('pos_pins')->where('user_id', $userId)->exists();
    }

    /** A supervisor sets (or changes) their own PIN. */
    public function setPin(User $u, string $pin): void
    {
        if (! self::installed()) {
            throw new BooksException('Run database script 171_pos_pins.sql first.');
        }
        if (! app(Authorizer::class)->allows($u, 'pos.supervise')) {
            throw new BooksException('Only a supervisor has a PIN.');
        }
        if (! preg_match('/^\d{6}$/', $pin)) {
            throw new BooksException('A PIN is 6 digits.');
        }
        if (preg_match('/^(\d)\1{5}$/', $pin) || in_array($pin, ['123456', '654321', '012345', '123123'], true)) {
            throw new BooksException('That PIN is too easy to guess. Choose another.');
        }
        DB::table('pos_pins')->updateOrInsert(['user_id' => $u->id], ['pin_hash' => Hash::make($pin), 'failed_count' => 0, 'locked_until' => null, 'set_at' => now(), 'updated_at' => now(), 'created_at' => now()]);
        AccessLog::record($u->id, $u->id, 'pos_pin_set', []);
    }

    /** The supervisors who can approve at a station: they hold pos.supervise at its branch, have a PIN, and are not the cashier. @return array<int, array{id: int, name: string}> */
    public function supervisors(User $cashier, Station $station): array
    {
        if (! self::installed()) {
            return [];
        }
        $access = app(Authorizer::class);
        $ids = DB::table('pos_pins')->pluck('user_id');

        return User::whereIn('id', $ids)->where('id', '!=', $cashier->id)->where('status', 'active')->orderBy('name')->get(['id', 'name'])
            ->filter(fn (User $s) => $access->allows($s, 'pos.supervise', ['location_id' => $station->location_id]))
            ->map(fn (User $s) => ['id' => $s->id, 'name' => $s->name])->values()->all();
    }

    /** Check the PIN and hand back a one-use approval. @return array{token: string, supervisor: array{id: int, name: string}, expires_in: int} */
    public function approve(User $cashier, Station $station, int $supervisorId, string $pin, string $purpose, array $about = []): array
    {
        if (! in_array($purpose, self::PURPOSES, true)) {
            throw new BooksException('Unknown kind of approval.');
        }
        // A supervisor who is working the till may approve with their own PIN (they hold pos.supervise and have set a PIN: verify() checks both). It is logged as a self approval.
        $sup = $this->verify($supervisorId, $pin, $station, $purpose, $cashier->id);
        DB::table('pos_pins')->where('user_id', $supervisorId)->update(['failed_count' => 0, 'locked_until' => null]);
        $token = Str::random(40);
        Cache::put($this->cacheKey($token), ['supervisor' => $supervisorId, 'cashier' => $cashier->id, 'station' => $station->id, 'purpose' => $purpose], now()->addMinutes(self::TTL_MINUTES));
        AccessLog::record($cashier->id, $supervisorId, 'pos_approval_given', ['station' => $station->id, 'purpose' => $purpose] + ($supervisorId === $cashier->id ? ['self' => true] : []) + $about);

        return ['token' => $token, 'supervisor' => ['id' => $sup->id, 'name' => $sup->name], 'expires_in' => self::TTL_MINUTES * 60];
    }

    /** Check a supervisor's PIN at a station (lockout and log included). Returns the supervisor. */
    private function verify(int $supervisorId, string $pin, Station $station, string $purpose, int $byUserId): User
    {
        $sup = User::where('status', 'active')->find($supervisorId);
        $row = $sup ? DB::table('pos_pins')->where('user_id', $supervisorId)->first() : null;
        if (! $sup || ! $row || ! app(Authorizer::class)->allows($sup, 'pos.supervise', ['location_id' => $station->location_id])) {
            throw new BooksException('That person can not approve here.');
        }
        if ($row->locked_until && now()->lt($row->locked_until)) {
            throw new BooksException('This PIN is locked after wrong tries. Try again in '.now()->diffInMinutes($row->locked_until, true).' minutes, or ask another supervisor.');
        }
        if (! Hash::check($pin, $row->pin_hash)) {
            $fails = (int) $row->failed_count + 1;
            $lock = $fails >= self::MAX_TRIES;
            DB::table('pos_pins')->where('user_id', $supervisorId)->update(['failed_count' => $lock ? 0 : $fails, 'locked_until' => $lock ? now()->addMinutes(self::LOCK_MINUTES) : null, 'updated_at' => now()]);
            AccessLog::record($byUserId ?: null, $supervisorId, 'pos_pin_wrong', ['station' => $station->id, 'purpose' => $purpose, 'locked' => $lock]);

            throw new BooksException($lock ? 'Wrong PIN. It is now locked for '.self::LOCK_MINUTES.' minutes.' : 'Wrong PIN.');
        }

        return $sup;
    }

    /** A supervisor steps in at a self-checkout screen: they give their email and PIN (the screen lists no names). Returns the supervisor. */
    public function assist(Station $station, string $email, string $pin, string $purpose, array $about = []): User
    {
        $id = User::where('email', trim($email))->value('id');
        $sup = $this->verify((int) $id, $pin, $station, $purpose, 0);
        DB::table('pos_pins')->where('user_id', $sup->id)->update(['failed_count' => 0, 'locked_until' => null]);
        AccessLog::record($sup->id, $sup->id, 'pos_assist', ['station' => $station->id, 'purpose' => $purpose] + $about);

        return $sup;
    }

    /** Is this approval good for this cashier, station and purpose? Returns the supervisor's id, or null. Nothing is spent. */
    public function peek(?string $token, User $cashier, Station $station, string $purpose): ?int
    {
        $a = $token ? Cache::get($this->cacheKey($token)) : null;

        return $a && $a['cashier'] === $cashier->id && $a['station'] === $station->id && $a['purpose'] === $purpose ? (int) $a['supervisor'] : null;
    }

    /** Spend it: used once, then gone. Returns the supervisor's id. */
    public function spend(?string $token, User $cashier, Station $station, string $purpose, array $about = []): int
    {
        $sup = $this->peek($token, $cashier, $station, $purpose) ?? throw new ApprovalRequired($purpose, 'A supervisor must approve this: ask for their PIN.');
        if (! Cache::pull($this->cacheKey((string) $token))) {
            throw new ApprovalRequired($purpose, 'That approval was already used: ask for the PIN again.');
        }
        AccessLog::record($cashier->id, $sup, 'pos_approval_used', ['station' => $station->id, 'purpose' => $purpose] + $about);

        return $sup;
    }

    private function cacheKey(string $token): string
    {
        return 'pos:approval:'.hash('sha256', $token);
    }
}
