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
        // the payment keys screen (the same tables as the unit tests build; script 116)
        Illuminate\Support\Facades\Schema::create('payment_settings', function ($t) { $t->unsignedTinyInteger('id')->primary(); $t->longText('mpesa_enc')->nullable(); $t->json('versions')->nullable(); $t->unsignedBigInteger('updated_by')->nullable(); $t->timestamps(); });
        Illuminate\Support\Facades\Schema::create('payment_setting_versions', function ($t) { $t->id(); $t->string('part', 20); $t->unsignedInteger('version_no'); $t->longText('snapshot_enc')->nullable(); $t->string('summary', 500)->nullable(); $t->json('changed_keys')->nullable(); $t->string('action', 20)->default('save'); $t->unsignedBigInteger('rolled_back_from')->nullable(); $t->boolean('tested_ok')->nullable(); $t->boolean('has_secrets')->default(false); $t->dateTime('secrets_purged_at')->nullable(); $t->unsignedBigInteger('secrets_purged_by')->nullable(); $t->unsignedBigInteger('created_by')->nullable(); $t->timestamp('created_at')->nullable(); $t->unique(['part', 'version_no']); });
        Illuminate\Support\Facades\Schema::create('payment_setting_logs', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->string('event', 40); $t->string('part', 20)->nullable(); $t->unsignedBigInteger('version_id')->nullable(); $t->string('summary', 500)->nullable(); $t->json('context')->nullable(); $t->string('ip', 45)->nullable(); $t->timestamp('created_at')->nullable(); });
        Illuminate\Support\Facades\Schema::create('employees', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->softDeletes(); $t->timestamps(); });   // (signing in as staff looks for the employee record)
    }
})->go();

foreach (Tests\Support\E2eSeed::people() as $p) {
    App\Models\User::forceCreate($p + ['password' => Illuminate\Support\Facades\Hash::make('purple-giraffe-lantern-77')]);
}
echo "ready: {$file}\n";
