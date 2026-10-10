<?php

namespace Tests\Support;

/** The people a browser check signs in as (all with the password purple-giraffe-lantern-77). */
final class E2eSeed
{
    public static function people(): array
    {
        return [
            ['name' => 'Amina Wanjiru', 'email' => 'amina@example.com', 'role' => 'customer'],
            ['name' => 'Baraka Otieno', 'email' => 'baraka@example.com', 'role' => 'customer'],
            ['name' => 'Chege Admin', 'email' => 'admin@example.com', 'role' => 'admin'],        // staff the passkey rule is for
            ['name' => 'Wanjiku Owner', 'email' => 'owner@example.com', 'role' => 'super_admin'], // the owner: needs two passkeys
            ['name' => 'Otieno Driver', 'email' => 'logistics@example.com', 'role' => 'logistics'], // staff the rule is not for
        ];
    }
}
