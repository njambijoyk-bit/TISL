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
        ];
    }
}
