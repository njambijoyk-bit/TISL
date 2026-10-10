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

    // How long the security log keeps lines, in days, by how serious they are (0 = forever)
    'log' => [
        'keep_days' => ['info' => 90, 'notice' => 180, 'warning' => 365, 'alert' => 730],
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
        // signing in with a passkey (nobody is named, so counted per address), and adding, proving with and removing them while signed in (per person)
        'passkey' => ['ip' => [[30, 1], [200, 60]]],
        'passkey_manage' => ['user' => [[30, 15], [100, 60]]],
        // trying recovery codes while signed in (counted per person; a code is 49 bits, so a handful of tries an hour is plenty for a real person), and asking the sign-in page for a seal phrase (per address)
        'recovery' => ['user' => [[5, 15], [15, 60]]],
        'seal' => ['ip' => [[60, 1], [300, 60]]],
    ],

    // Headers added to every response (see Http/Middleware/SecurityHeaders). HSTS is only sent over HTTPS; switch it off if the site must also be reached over plain HTTP.
    'headers' => [
        'enabled' => (bool) env('SECURITY_HEADERS', true),
        'hsts' => (bool) env('SECURITY_HSTS', true),
        'hsts_seconds' => 31536000,
    ],

    // The sign-in code lives in a cookie scripts can not read (see Services/Security/SessionCookie). The website and the API must be on the same domain for a browser to send it
    // (the website at targetisl.co.ke, the API at api.targetisl.co.ke). SECURITY_COOKIE_SESSIONS=false goes back to handing the code to the page, which then keeps it itself.
    'cookie' => [
        'enabled' => (bool) env('SECURITY_COOKIE_SESSIONS', true),
        'secure' => env('SECURITY_COOKIE_SECURE') === null ? null : filter_var(env('SECURITY_COOKIE_SECURE'), FILTER_VALIDATE_BOOLEAN),   // null: https whenever the request or APP_URL is
        'same_site' => env('SECURITY_COOKIE_SAMESITE', 'lax'),
        'names' => ['user' => 'tisl_session', 'applicant' => 'tisl_applicant'],
    ],

    // Passkeys (WebAuthn). The RP ID is the domain a passkey is made for and can never change without orphaning every passkey: it is the website's registrable domain, so the shop and the API
    // can sit on subdomains of it. Only the origins listed here (exact addresses, subdomains are NOT accepted) may ask for or answer a passkey.
    // For development set PASSKEY_RP_ID=localhost and PASSKEY_ORIGINS=http://localhost:5173.
    'passkeys' => [
        'rp_id' => env('PASSKEY_RP_ID', 'targetisl.co.ke'),
        'rp_name' => env('PASSKEY_RP_NAME', 'TISL'),
        'origins' => array_values(array_filter(array_map('trim', explode(',', (string) env('PASSKEY_ORIGINS', 'https://targetisl.co.ke,https://www.targetisl.co.ke'))))),
        'challenge_seconds' => 120,   // a question to a device is good for two minutes, once
        'timeout_ms' => 120000,
        'max_per_person' => 10,
    ],

    // Who must sign in with a passkey (Services/Security/PasskeyPolicy). These are only the starting values: once the owner changes one on the Security screen, the screen's value is used.
    // mode: off (nothing happens) | log (nobody is stopped; each sign-in that would have been held is written to the security log) | enforce (from `enforce_from` on, a person without the passkeys the rule asks for gets a session that can only add or use one).
    // The rule is for staff who hold one of the roles or any of the permissions below (people who can move money or change who may do what). `owner_roles` need two passkeys, and with `owner_device_bound` both must be tied to the device (not copied to a cloud account).
    // SECURITY_POLICY_OFF=true is the emergency way out for a lock-out: it puts the whole rule to sleep from the server's settings, whatever the screen says.
    'policy' => [
        'kill_switch' => (bool) env('SECURITY_POLICY_OFF', false),
        'passkeys' => [
            'mode' => env('SECURITY_PASSKEY_MODE', 'off'),
            'enforce_from' => env('SECURITY_PASSKEY_ENFORCE_FROM'),   // a date, 2026-12-01; empty = not set yet (people are only reminded)
            'roles' => ['super_admin', 'admin'],
            'permissions' => ['payroll.run', 'books.post', 'access.manage', 'access.roles', 'security.manage', 'system.restore'],
            'owner_roles' => ['super_admin'],
            'owner_device_bound' => true,
        ],
    ],

    // Email a person when a kind of browser they have not signed in from before signs in (with a button that signs everyone out). Off with SECURITY_NEW_SIGN_IN_EMAIL=false.
    'new_sign_in_email' => (bool) env('SECURITY_NEW_SIGN_IN_EMAIL', true),

    // Tell the person (email and bell) when a passkey is added, removed or switched off, or recovery codes are made or used. Off with SECURITY_ALERTS_EMAIL=false.
    'alerts_email' => (bool) env('SECURITY_ALERTS_EMAIL', true),

    'password' => [
        'min_length' => (int) env('SECURITY_PASSWORD_MIN', 10),
        'max_length' => 128,
        // words no password may contain (the person's own name, email and phone are added for each check)
        'banned_words' => ['tisl'],
    ],
];
