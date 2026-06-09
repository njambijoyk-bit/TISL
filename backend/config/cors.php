<?php

return [

    // Apply CORS to API routes only
    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    // Allow all request methods
    'allowed_methods' => ['*'],

    // 👇 This is where you add your React/Vite access points
    'allowed_origins' => [
        'https://bluearc-frontend-production.up.railway.app',
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:5175',
        'http://localhost:5176',
    ],

    // You can leave this empty unless you need regex patterns
    'allowed_origins_patterns' => [],

    // Allow all request headers
    'allowed_headers' => ['*'],

    // Optional: expose response headers
    'exposed_headers' => ['X-Mimi-Session-Token'],

    // How long browsers should cache preflight responses (in seconds)
    'max_age' => 0,

    // Only set to true if you’re using cookies or auth across origins
    'supports_credentials' => true,
];
