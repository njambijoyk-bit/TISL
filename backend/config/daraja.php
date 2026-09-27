<?php

return [
    'env'                 => env('DARAJA_ENV', 'sandbox'),
    'consumer_key'        => env('DARAJA_CONSUMER_KEY'),
    'consumer_secret'     => env('DARAJA_CONSUMER_SECRET'),
    'shortcode'           => env('DARAJA_SHORTCODE'),
    'passkey'             => env('DARAJA_PASSKEY'),
    'callback_url'        => env('DARAJA_CALLBACK_URL'),
    // Optional shared secret. When set, the callback URL must end with ?token=<this value>
    // and callbacks without it are ignored.
    'callback_token'      => env('DARAJA_CALLBACK_TOKEN'),
    'account_reference'   => env('DARAJA_ACCOUNT_REFERENCE', 'TISL'),
    'transaction_desc'    => env('DARAJA_TRANSACTION_DESC', 'Order Payment'),
];
