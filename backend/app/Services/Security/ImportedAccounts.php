<?php

namespace App\Services\Security;

use App\Models\User;
use Illuminate\Support\Facades\Hash;

/**
 * Login accounts made or updated by a spreadsheet import.
 *
 * A file never touches the password of a person who already has an account (the old imports did, resetting it to a default everybody knew: whoever could import could take over any account).
 * A new person gets the password in the file when it passes the password rules, otherwise one nobody knows; either way they must choose their own at first sign-in
 * (or use "Forgot password").
 */
final class ImportedAccounts
{
    /** @param array<string, mixed> $attributes everything except the password */
    public static function upsert(string $email, array $attributes, ?string $givenPassword = null): User
    {
        $user = User::firstOrNew(['email' => $email]);
        $isNew = ! $user->exists;
        $user->fill($attributes);
        if ($isNew) {
            $given = trim((string) $givenPassword);
            $usable = $given !== '' && PasswordPolicy::problem($given, [$user->name, $email, $user->phone]) === null;
            $user->forceFill(['password' => Hash::make($usable ? $given : PasswordPolicy::random()), 'force_password_change' => true, 'password_changed_at' => now()]);
        }
        $user->save();

        return $user;
    }
}
