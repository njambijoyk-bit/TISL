<?php

/**
 * Makes the database a browser check runs against: a sqlite file with the tables sign-in needs and a few people to sign in as. Usage: php tests/e2e/boot.php /tmp/tisl-e2e.sqlite
 * (Then tests/e2e/serve.sh starts the server on port 8000.) It is for checks only: it builds only what the sign-in and security pages touch.
 */
$file = $argv[1] ?? '/tmp/tisl-e2e.sqlite';
@unlink($file);
touch($file);
foreach ((require __DIR__.'/env.php') + ['DB_DATABASE' => $file] as $k => $v) {
    putenv("{$k}={$v}");
    $_ENV[$k] = $v;
    $_SERVER[$k] = $v;
}
require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

Illuminate\Support\Facades\Cache::flush();   // rate-limit counters from an earlier run would lock the next one out

(new class {
    use Tests\Feature\Concerns\CreatesSecurityTables;

    public function go(): void
    {
        $this->createSecurityTables();
    }
})->go();

foreach (Tests\Support\E2eSeed::people() as $p) {
    App\Models\User::forceCreate($p + ['password' => Illuminate\Support\Facades\Hash::make('purple-giraffe-lantern-77')]);
}
echo "ready: {$file}\n";
