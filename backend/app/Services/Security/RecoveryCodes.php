<?php

namespace App\Services\Security;

use App\Models\Security\AuthRecoveryCode;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Recovery codes: the first way back for someone who has lost the device a passkey lives on.
 *
 * Ten codes are made at once and shown ONCE; what is kept is a keyed one-way fingerprint, so neither the database nor a backup holds a usable code. Each works one time.
 * Making a new set ends the old one. Using a code does not sign anyone in: it lets a session that already knows the password add a new passkey for a few minutes (see Sessions::recoveryFresh), and nothing else.
 * (The fingerprint is keyed with the app key, so changing APP_KEY ends every code: make new ones afterwards.)
 */
final class RecoveryCodes
{
    public const COUNT = 10;

    /** Letters and digits that are hard to mix up when written down (no 0 O 1 I L). 31 of them, 10 long: about 49 bits, far too many to guess within the speed limits. */
    private const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

    private static ?bool $ready = null;

    public static function forget(): void
    {
        self::$ready = null;
    }

    /** Has database script 126 been run? */
    public static function ready(): bool
    {
        return self::$ready ??= Schema::hasTable('auth_recovery_codes') && Schema::hasColumn('auth_sessions', 'recovery_at');
    }

    /** "k3m9x-q2hty" -> "K3M9XQ2HTY": case, spaces and dashes do not matter when typing one in. */
    public static function normalise(string $typed): string
    {
        return strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $typed) ?? '');
    }

    private function fingerprint(string $normalised): string
    {
        return hash_hmac('sha256', $normalised, (string) config('app.key'));
    }

    private function make(): string
    {
        $out = '';
        for ($i = 0; $i < 10; $i++) {
            $out .= self::ALPHABET[random_int(0, strlen(self::ALPHABET) - 1)];
        }

        return substr($out, 0, 5).'-'.substr($out, 5);
    }

    /**
     * A new set of ten, ending whatever was left of the old set. The codes are returned here and nowhere else.
     *
     * @return string[]
     */
    public function generate(User $user): array
    {
        $batch = (string) Str::ulid();
        $codes = [];
        DB::transaction(function () use ($user, $batch, &$codes) {
            AuthRecoveryCode::where('user_id', $user->id)->good()->update(['revoked_at' => now()]);
            while (count($codes) < self::COUNT) {
                $code = $this->make();
                if (in_array($code, $codes, true)) {
                    continue;
                }
                $codes[] = $code;
                AuthRecoveryCode::create(['user_id' => $user->id, 'batch' => $batch, 'code_hash' => $this->fingerprint(self::normalise($code))]);
            }
        });

        return $codes;
    }

    /** @return array{remaining: int, made_at: ?string} */
    public function status(User $user): array
    {
        $good = AuthRecoveryCode::where('user_id', $user->id)->good();

        return ['remaining' => (clone $good)->count(), 'made_at' => (clone $good)->max('created_at') ? (string) \Illuminate\Support\Carbon::parse((clone $good)->max('created_at'))->toIso8601String() : null];
    }

    /** Use a code: true once, for the person it was made for, if it is still good. Two people using the same code at the same moment: only one wins. */
    public function consume(User $user, string $typed, ?Request $request = null): bool
    {
        $normalised = self::normalise($typed);
        if (strlen($normalised) !== 10) {
            return false;
        }

        return AuthRecoveryCode::where('user_id', $user->id)->where('code_hash', $this->fingerprint($normalised))->good()
            ->update(['used_at' => now(), 'used_ip' => $request?->ip()]) === 1;
    }
}
