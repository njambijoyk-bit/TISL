<?php

namespace Tests\Feature\Concerns;

use App\Services\Security\SecurityLog;
use App\Services\Security\Sessions;
use Illuminate\Support\Facades\Schema;

/** The tables sign-in security needs, hand-built for the in-memory test database (the real ones come from the migrations and database script 123). */
trait CreatesSecurityTables
{
    protected function createSecurityTables(): void
    {
        Schema::create('users', function ($t) {
            $t->id(); $t->string('name')->nullable(); $t->string('email')->unique(); $t->timestamp('email_verified_at')->nullable(); $t->string('password'); $t->string('remember_token', 100)->nullable();
            $t->string('phone')->nullable(); $t->string('role')->default('customer'); $t->string('status')->default('active'); $t->string('oauth_provider')->default('email');
            $t->timestamp('last_login_at')->nullable(); $t->string('last_login_ip')->nullable(); $t->string('last_login_user_agent')->nullable(); $t->integer('failed_login_attempts')->default(0); $t->timestamp('locked_until')->nullable();
            $t->timestamp('password_changed_at')->nullable(); $t->boolean('force_password_change')->default(false); $t->softDeletes(); $t->timestamps();
        });
        Schema::create('customers', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->string('first_name')->nullable(); $t->softDeletes(); $t->timestamps(); });
        Schema::create('personal_access_tokens', function ($t) {
            $t->id(); $t->morphs('tokenable'); $t->text('name'); $t->string('token', 64)->unique(); $t->text('abilities')->nullable(); $t->timestamp('last_used_at')->nullable(); $t->timestamp('expires_at')->nullable(); $t->timestamps();
        });
        Schema::create('auth_sessions', function ($t) {
            $t->id(); $t->unsignedBigInteger('token_id')->unique(); $t->string('tokenable_type'); $t->unsignedBigInteger('tokenable_id'); $t->string('method', 20)->default('password'); $t->string('ip', 45)->nullable();
            $t->string('user_agent')->nullable(); $t->string('device_key', 40)->nullable(); $t->string('label')->nullable(); $t->dateTime('last_seen_at')->nullable(); $t->dateTime('revoked_at')->nullable(); $t->string('revoked_reason', 40)->nullable(); $t->timestamps();
            $t->unsignedBigInteger('credential_id')->nullable(); $t->unsignedTinyInteger('strength')->default(0); $t->dateTime('last_strong_at')->nullable(); $t->boolean('restricted')->default(false); $t->dateTime('recovery_at')->nullable();
        });
        Schema::create('auth_credentials', function ($t) {
            $t->id(); $t->unsignedBigInteger('user_id'); $t->string('credential_hash', 64)->unique(); $t->text('credential_id'); $t->text('public_key'); $t->string('user_handle', 100); $t->string('name', 80); $t->string('kind', 20)->default('passkey');
            $t->json('transports')->nullable(); $t->string('aaguid', 36)->nullable(); $t->string('attestation_type', 20)->nullable(); $t->unsignedBigInteger('counter')->default(0); $t->boolean('backup_eligible')->nullable(); $t->boolean('backup_status')->nullable();
            $t->boolean('uv_initialized')->nullable(); $t->string('added_method', 20)->default('first'); $t->unsignedBigInteger('added_by_id')->nullable(); $t->unsignedBigInteger('replaced_by_id')->nullable(); $t->dateTime('last_used_at')->nullable();
            $t->string('last_used_ip', 45)->nullable(); $t->string('last_used_device', 120)->nullable(); $t->dateTime('disabled_at')->nullable(); $t->string('disabled_reason', 40)->nullable(); $t->dateTime('revoked_at')->nullable();
            $t->unsignedBigInteger('revoked_by_id')->nullable(); $t->string('revoked_reason', 40)->nullable(); $t->timestamps();
        });
        Schema::create('auth_challenges', function ($t) {
            $t->string('id', 40)->primary(); $t->string('purpose', 20); $t->unsignedBigInteger('user_id')->nullable(); $t->string('challenge', 43); $t->string('context_hash', 64)->nullable(); $t->json('options'); $t->string('ip', 45)->nullable();
            $t->dateTime('expires_at'); $t->dateTime('used_at')->nullable(); $t->timestamp('created_at')->nullable();
        });
        Schema::create('security_events', function ($t) {
            $t->id(); $t->string('subject_type', 40)->nullable(); $t->unsignedBigInteger('subject_id')->nullable(); $t->string('event', 40); $t->string('severity', 10)->default('info'); $t->string('email_tried')->nullable();
            $t->string('ip', 45)->nullable(); $t->string('user_agent')->nullable(); $t->json('detail')->nullable(); $t->timestamp('created_at')->nullable();
        });
        Schema::create('auth_recovery_codes', function ($t) {
            $t->id(); $t->unsignedBigInteger('user_id'); $t->string('batch', 26); $t->string('code_hash', 64)->unique(); $t->dateTime('used_at')->nullable(); $t->string('used_ip', 45)->nullable(); $t->dateTime('revoked_at')->nullable(); $t->timestamps();
        });
        Schema::create('auth_seals', function ($t) { $t->unsignedBigInteger('user_id')->primary(); $t->string('phrase', 60); $t->timestamps(); });
        Schema::create('security_settings', function ($t) {
            $t->string('setting_key', 80)->primary(); $t->json('value')->nullable(); $t->unsignedBigInteger('updated_by_id')->nullable(); $t->timestamps();
        });
        config(['app.key' => 'base64:' . base64_encode(str_repeat('k', 32)), 'app.cipher' => 'AES-256-CBC']);
        Sessions::forget();
        SecurityLog::forget();
        \App\Services\Security\SecuritySettings::forget();
        \App\Services\Security\RecoveryCodes::forget();
        \App\Services\Security\SealPhrase::forget();
    }
}
