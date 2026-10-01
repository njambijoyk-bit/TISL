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
    'account_reference'   => env('DARAJA_ACCOUNT_REFERENCE', 'ORDER'),
    'transaction_desc'    => env('DARAJA_TRANSACTION_DESC', 'Order Payment'),
    // TLS to Safaricom. Normally leave both unset. If this machine's PHP cannot verify Safaricom's certificate
    // (antivirus / a proxy re-signing HTTPS, or no CA bundle), point DARAJA_CA_BUNDLE at a cacert.pem.
    // DARAJA_VERIFY_SSL=false switches verification off but is only honoured when APP_ENV=local, so it can never reach production.
    'ca_bundle'           => env('DARAJA_CA_BUNDLE'),
    'verify_ssl'          => env('DARAJA_VERIFY_SSL', true),
];
