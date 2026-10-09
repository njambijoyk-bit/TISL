<?php

return [
    // Fetching another company's export from here is limited to public https sites. Turn these on only for testing against your own machine.
    'allow_http' => (bool) env('EXCHANGE_ALLOW_HTTP', false),
    'allow_private_hosts' => (bool) env('EXCHANGE_ALLOW_PRIVATE_HOSTS', false),
    'fetch_timeout' => 120,
    'max_file_bytes' => 100 * 1024 * 1024,
];
