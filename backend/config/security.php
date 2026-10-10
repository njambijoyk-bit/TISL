<?php

/**
 * Sign-in security (docs/SECURITY_PLAN.md). Every number can be changed in .env without touching code.
 *
 * A session is one signed-in browser (one token). It ends when it has been idle too long, or when it is simply too old; whichever comes first. Staff are held to a shorter leash than customers.
 */
return [
    'session' => [
        // minutes a session may sit unused before it ends: it slides forward every time it is used
        'idle_minutes' => [
            'staff' => (int) env('SECURITY_IDLE_STAFF_MINUTES', 720),            // 12 hours
            'customer' => (int) env('SECURITY_IDLE_CUSTOMER_MINUTES', 43200),    // 30 days
            'other' => (int) env('SECURITY_IDLE_OTHER_MINUTES', 10080),          // 7 days (vendors, drivers, applicants)
        ],
        // days after which a session ends however busy it is: the person signs in again
        'max_days' => [
            'staff' => (int) env('SECURITY_MAX_STAFF_DAYS', 14),
            'customer' => (int) env('SECURITY_MAX_CUSTOMER_DAYS', 90),
            'other' => (int) env('SECURITY_MAX_OTHER_DAYS', 30),
        ],
        // how often a busy session's end is pushed forward (minutes): fewer writes
        'slide_every_minutes' => 5,
    ],

    // What happens after wrong passwords. Nobody's account is ever locked by a stranger: the wait is counted for one email from one address, so it is the typist who waits, not the owner of the email.
    'login' => [
        // wrong passwords in a row (one email, one address) before the first wait
        'free_tries' => (int) env('SECURITY_LOGIN_FREE_TRIES', 4),
        // seconds to wait after the next wrong ones: the first wait, the second, and so on (the last one repeats)
        'wait_seconds' => [30, 60, 300, 900, 1800],
        // a quiet spell this long forgets the count
        'forget_after_minutes' => (int) env('SECURITY_LOGIN_FORGET_MINUTES', 60),
        // wrong passwords for one email from anywhere in an hour: from this many on, it is written to the security log as an attack
        'per_email_alert' => (int) env('SECURITY_LOGIN_PER_EMAIL_ALERT', 30),
    ],

    // How fast anyone may knock on the doors that take a password, a code or an email address. Each entry is [attempts, minutes]; the first list is counted per email AND address (so a stranger can only block their own address, never the real person), the second per address alone. Going over answers "wait N seconds" and writes a line in the security log.
    'rate_limits' => [
        'sign_in' => ['email_ip' => [[10, 1], [30, 60]], 'ip' => [[30, 1], [200, 60]]],
        'sign_up' => ['email_ip' => [[5, 60]],           'ip' => [[10, 1], [30, 60]]],
        'forgot'  => ['email_ip' => [[3, 15], [8, 60]],  'ip' => [[10, 15], [30, 60]]],
        'reset'   => ['email_ip' => [[10, 15]],          'ip' => [[20, 15], [60, 60]]],
        'force'   => ['email_ip' => [[10, 15]],          'ip' => [[20, 15], [60, 60]]],
        // someone already signed in, guessing a current password or a phone code: counted per person
        'guess'   => ['user' => [[8, 15], [30, 60]]],
    ],

    'password' => [
        'min_length' => (int) env('SECURITY_PASSWORD_MIN', 10),
        'max_length' => 128,
        // words no password may contain (the person's own name, email and phone are added for each check)
        'banned_words' => ['tisl'],
    ],
];
