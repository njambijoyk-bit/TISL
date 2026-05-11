<?php

return [
    'env'                 => env('DARAJA_ENV', 'sandbox'),
    'consumer_key'        => env('DARAJA_CONSUMER_KEY'),
    'consumer_secret'     => env('DARAJA_CONSUMER_SECRET'),
    'shortcode'           => env('DARAJA_SHORTCODE'),
    'passkey'             => env('DARAJA_PASSKEY'),
    'callback_url'        => env('DARAJA_CALLBACK_URL'),
    'account_reference'   => env('DARAJA_ACCOUNT_REFERENCE', 'TISL'),
    'transaction_desc'    => env('DARAJA_TRANSACTION_DESC', 'Order Payment'),
];
