<?php

namespace App\Services\Security;

use App\Models\Security\AuthSeal;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

/**
 * The seal phrase: a few words the person chose, shown on the sign-in page only to a browser that has signed in as them before (see KnownDevice).
 * Asking for someone's phrase always gets the same shaped answer, with nothing in it unless this browser is that person's - so the page can not be used to find out who has an account or a phrase.
 * A flourish, and labelled as one: the protection is the passkey.
 */
final class SealPhrase
{
    private static ?bool $ready = null;

    public static function forget(): void
    {
        self::$ready = null;
    }

    public static function ready(): bool
    {
        return self::$ready ??= Schema::hasTable('auth_seals');
    }

    /** The phrase for the person with this email, if (and only if) this browser is known to be theirs. */
    public function showTo(Request $request, string $email): ?string
    {
        if (! self::ready() || $email === '') {
            return null;
        }
        $user = User::where('email', mb_strtolower(trim($email)))->first();
        if (! $user || ! KnownDevice::knows($request, $user)) {
            return null;
        }

        return AuthSeal::where('user_id', $user->id)->value('phrase');
    }

    public function get(User $user): ?string
    {
        return self::ready() ? AuthSeal::where('user_id', $user->id)->value('phrase') : null;
    }

    public function set(User $user, string $phrase): void
    {
        AuthSeal::updateOrCreate(['user_id' => $user->id], ['phrase' => $phrase]);
    }

    public function clear(User $user): void
    {
        AuthSeal::where('user_id', $user->id)->delete();
    }
}
