<?php

/**
 * Mimi's local layer: answers from our own knowledge and database before any outside AI is asked. See docs/MIMI_LOCAL_LAYER_GUIDE.html.
 *   mode      off     the old behaviour, untouched
 *             shadow  the local layer works out its answer and writes it to the log; the person still gets the old reply (the safe way to start)
 *             on      the local layer answers; the outside AI is a fallback under the rules below
 *   fallback  what may happen when the local layer is not confident, per kind of account
 *             local_only  say it isn't written down yet, ask nobody
 *             ai_public   ask an outside AI with the redacted question and public store information only
 *             ai_scoped   the old full prompt (customers and guests only; staff are capped at ai_public)
 */
return [
    'mode' => env('MIMI_LOCAL_MODE', 'shadow'),

    'fallback' => [
        'guest' => env('MIMI_FALLBACK_GUEST', 'ai_public'),
        'customer' => env('MIMI_FALLBACK_CUSTOMER', 'ai_public'),
        'staff' => env('MIMI_FALLBACK_STAFF', 'local_only'),
        'other' => env('MIMI_FALLBACK_OTHER', 'local_only'),
    ],

    'knowledge' => resource_path('mimi/knowledge.html'),
    'synonyms' => resource_path('mimi/synonyms.php'),

    // draft entries (no data-reviewed) are served only while this is true; turn it off once the owner has signed the wording off
    'allow_drafts' => (bool) env('MIMI_LOCAL_ALLOW_DRAFTS', true),

    'thresholds' => ['answer' => 0.60, 'suggest' => 0.45, 'tie' => 0.04, 'shadow_margin' => 0.10],

    'support_email_fallback' => env('MIMI_SUPPORT_EMAIL', 'web@targetisl.co.ke'),
];
