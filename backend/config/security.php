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

    'login' => [
        // wrong passwords allowed for one email from one address in 15 minutes, then a wait
        'per_email_and_ip' => (int) env('SECURITY_LOGIN_PER_EMAIL_IP', 5),
        // wrong passwords for one email from anywhere in an hour: more than this warns the account's owner
        'per_email' => (int) env('SECURITY_LOGIN_PER_EMAIL', 30),
        // wrong passwords from one address, any email, in 10 minutes
        'per_ip' => (int) env('SECURITY_LOGIN_PER_IP', 40),
    ],

    'password' => [
        'min_length' => (int) env('SECURITY_PASSWORD_MIN', 10),
    ],
];
