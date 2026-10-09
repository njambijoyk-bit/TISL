<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Notify\NotifySettings;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** The in-memory tables the notification tests share (the repo builds its database from SQL scripts, script 108). */
abstract class NotifyTestCase extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['cache.default' => 'array', 'app.key' => 'base64:' . base64_encode(str_repeat('k', 32)), 'app.cipher' => 'AES-256-CBC']);
        NotifySettings::forget();
        Schema::create('users', function ($t) { $t->id(); $t->string('name')->nullable(); $t->string('email')->nullable(); $t->string('password')->nullable(); $t->softDeletes(); $t->timestamps(); });
        Schema::create('currencies', function ($t) { $t->id(); $t->string('code'); $t->boolean('is_base')->default(false); });
        \Illuminate\Support\Facades\DB::table('currencies')->insert(['id' => 1, 'code' => 'KES', 'is_base' => true]);
        Schema::create('customers', function ($t) { $t->id(); $t->string('customer_number')->nullable(); $t->unsignedBigInteger('currency_id')->nullable(); $t->unsignedBigInteger('user_id')->nullable(); $t->string('first_name')->nullable(); $t->string('last_name')->nullable(); $t->string('email')->nullable(); $t->string('phone')->nullable(); $t->string('whatsapp')->nullable(); $t->string('notify_mode', 10)->nullable(); $t->boolean('notify_essential_only')->default(false); $t->dateTime('whatsapp_consent_at')->nullable(); $t->string('whatsapp_consent_source', 10)->nullable(); $t->softDeletes(); $t->timestamps(); });
        Schema::create('notifications', function ($t) { $t->id(); $t->string('notifiable_type'); $t->unsignedBigInteger('notifiable_id'); $t->string('type'); $t->string('title'); $t->text('message'); $t->string('icon')->nullable(); $t->string('color')->nullable(); $t->string('action_url')->nullable(); $t->string('action_text')->nullable(); $t->json('data')->nullable(); $t->json('channels')->nullable(); $t->timestamp('read_at')->nullable(); $t->timestamp('sent_at')->nullable(); $t->timestamp('email_sent_at')->nullable(); $t->timestamp('sms_sent_at')->nullable(); $t->timestamp('push_sent_at')->nullable(); $t->string('priority')->default('normal'); $t->timestamps(); });
        Schema::create('notification_settings', function ($t) { $t->unsignedTinyInteger('id')->primary(); $t->json('general')->nullable(); $t->json('types')->nullable(); $t->longText('email_enc')->nullable(); $t->longText('whatsapp_enc')->nullable(); $t->json('versions')->nullable(); $t->unsignedBigInteger('updated_by')->nullable(); $t->timestamps(); });
        Schema::create('notification_setting_versions', function ($t) { $t->id(); $t->string('part', 20); $t->unsignedInteger('version_no'); $t->longText('snapshot_enc')->nullable(); $t->string('summary', 500)->nullable(); $t->json('changed_keys')->nullable(); $t->string('action', 20)->default('save'); $t->unsignedBigInteger('rolled_back_from')->nullable(); $t->boolean('tested_ok')->nullable(); $t->boolean('has_secrets')->default(false); $t->dateTime('secrets_purged_at')->nullable(); $t->unsignedBigInteger('secrets_purged_by')->nullable(); $t->unsignedBigInteger('created_by')->nullable(); $t->timestamp('created_at')->nullable(); $t->unique(['part', 'version_no']); });
        Schema::create('notification_setting_logs', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->string('event', 40); $t->string('part', 20)->nullable(); $t->unsignedBigInteger('version_id')->nullable(); $t->string('summary', 500)->nullable(); $t->json('context')->nullable(); $t->string('ip', 45)->nullable(); $t->timestamp('created_at')->nullable(); });
        Schema::create('notification_deliveries', function ($t) { $t->id(); $t->unsignedBigInteger('notification_id')->nullable(); $t->string('notifiable_type', 60)->nullable(); $t->unsignedBigInteger('notifiable_id')->nullable(); $t->string('type', 60); $t->string('channel', 12); $t->string('via', 8)->nullable(); $t->string('status', 12); $t->string('to_address', 190)->nullable(); $t->string('subject')->nullable(); $t->mediumText('body')->nullable(); $t->text('wa_url')->nullable(); $t->string('external_id', 100)->nullable(); $t->string('error', 500)->nullable(); $t->unsignedSmallInteger('attempts')->default(0); $t->dateTime('sent_at')->nullable(); $t->dateTime('delivered_at')->nullable(); $t->dateTime('read_at')->nullable(); $t->unsignedBigInteger('handled_by')->nullable(); $t->timestamps(); });
    }

    protected function admin(int $id = 5): User
    {
        return User::find($id) ?? User::forceCreate(['id' => $id, 'name' => "Admin {$id}", 'email' => "admin{$id}@example.com", 'password' => 'x']);
    }
}
