<?php

/**
 * The settings a throw-away server for browser checks runs with. Everything comes from the environment (this project has no .env), so a check never touches a real database.
 * Used by boot.php (makes the database) and serve.sh (starts the server).
 */
return [
    'APP_ENV' => 'local',
    'APP_DEBUG' => 'false',
    'APP_KEY' => 'base64:'.base64_encode(str_repeat('e', 32)),
    'APP_URL' => 'http://localhost:8000',
    'FRONTEND_URL' => 'http://localhost:5177',
    'DB_CONNECTION' => 'sqlite',
    'CACHE_STORE' => 'file',
    'SESSION_DRIVER' => 'file',
    'QUEUE_CONNECTION' => 'sync',
    'MAIL_MAILER' => 'log',
    'BCRYPT_ROUNDS' => '4',
    'LOG_CHANNEL' => 'stderr',
];
