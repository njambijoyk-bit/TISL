<?php

namespace Tests\Feature;

use App\Models\NotificationSetting;
use App\Models\NotificationSettingLog;
use App\Models\NotificationSettingVersion;
use App\Services\Notify\NotifyException;
use App\Services\Notify\NotifySettings;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The notification settings: a version and a log line for every change, secrets write-only, a connection test before an email or WhatsApp change goes live,
 * rollback as a new version, and only the owner deleting old keys.
 */
class NotifySettingsTest extends NotifyTestCase
{
    private NotifySettings $s;

    protected function setUp(): void
    {
        parent::setUp();
        $this->s = new NotifySettings();
    }

    private function email(array $over = []): array
    {
        return $over + ['host' => 'smtp.example.com', 'port' => 587, 'encryption' => 'tls', 'username' => 'mailer', 'password' => 'hunter2-SECRET', 'from_address' => 'shop@example.com'];
    }

    private function passes(): callable
    {
        return fn () => ['ok' => true, 'message' => 'Test email sent.'];
    }

    public function test_nothing_saved_reads_as_the_defaults(): void
    {
        $this->assertSame('both', $this->s->get('general')['default_mode']);
        $this->assertFalse($this->s->isSaved('email'));
        $this->assertSame('', $this->s->get('email')['host']);
    }

    public function test_a_save_makes_version_one_and_a_log_line_without_the_secret(): void
    {
        $r = $this->s->save('email', $this->email(), $this->admin(), $this->passes());
        $this->assertSame(1, $r['version']->version_no);
        $this->assertTrue($r['version']->tested_ok);
        $this->assertSame('smtp.example.com', $this->s->get('email')['host']);
        $this->assertSame('hunter2-SECRET', $this->s->get('email')['password']);

        $log = NotificationSettingLog::first();
        $this->assertSame('saved', $log->event);
        $this->assertSame(5, $log->user_id);
        $this->assertStringNotContainsString('hunter2', json_encode($log->toArray()));
        $this->assertStringContainsString('password (changed)', $log->summary);
    }

    public function test_the_secret_is_encrypted_in_the_live_row_and_in_every_version(): void
    {
        $this->s->save('email', $this->email(), $this->admin(), $this->passes());
        $this->assertStringNotContainsString('hunter2', (string) DB::table('notification_settings')->value('email_enc'));
        $this->assertStringNotContainsString('hunter2', (string) DB::table('notification_setting_versions')->value('snapshot_enc'));
        $this->assertStringNotContainsString('hunter2', json_encode(NotificationSetting::first()->toArray()));
        $this->assertStringNotContainsString('hunter2', json_encode(NotificationSettingVersion::first()->toArray()));
    }

    public function test_the_screen_gets_a_hint_never_the_secret(): void
    {
        $this->s->save('email', $this->email(), $this->admin(), $this->passes());
        $m = $this->s->masked('email');
        $this->assertSame(['set' => true, 'hint' => '••••CRET'], $m['password']);
        $this->assertStringNotContainsString('hunter2', json_encode($this->s->masked('email')));
        $this->assertSame(['set' => false, 'hint' => null], $this->s->masked('whatsapp')['meta']['access_token']);
    }

    public function test_a_blank_secret_keeps_the_old_one_and_a_new_one_replaces_it(): void
    {
        $this->s->save('email', $this->email(), $this->admin(), $this->passes());
        $this->s->save('email', ['port' => 2525, 'password' => ''], $this->admin(), $this->passes());
        $this->assertSame('hunter2-SECRET', $this->s->get('email')['password']);
        $this->assertSame(2525, $this->s->get('email')['port']);

        $this->s->save('email', ['password' => 'brand-new-9999'], $this->admin(), $this->passes());
        $this->assertSame('brand-new-9999', $this->s->get('email')['password']);
    }

    public function test_a_secret_can_be_cleared_on_purpose(): void
    {
        $this->s->save('email', $this->email(), $this->admin(), $this->passes());
        $this->s->save('email', [], $this->admin(), null, false, ['password']);
        $this->assertSame('', $this->s->get('email')['password']);
    }

    public function test_saving_the_same_thing_makes_no_new_version(): void
    {
        $this->s->save('email', $this->email(), $this->admin(), $this->passes());
        $r = $this->s->save('email', $this->email(), $this->admin(), $this->passes());
        $this->assertTrue($r['unchanged']);
        $this->assertSame(1, NotificationSettingVersion::count());
    }

    public function test_bad_input_is_refused_with_the_field(): void
    {
        $this->expectException(ValidationException::class);
        $this->s->save('email', $this->email(['port' => 99999]), $this->admin(), $this->passes());
    }

    public function test_a_failed_connection_test_changes_nothing(): void
    {
        $this->s->save('email', $this->email(), $this->admin(), $this->passes());
        try {
            $this->s->save('email', $this->email(['host' => 'bad.example.com']), $this->admin(), fn () => ['ok' => false, 'message' => 'Connection refused']);
            $this->fail('Expected a refusal');
        } catch (NotifyException $e) {
            $this->assertStringContainsString('Connection refused', $e->getMessage());
        }
        $this->assertSame('smtp.example.com', $this->s->get('email')['host']);
        $this->assertSame(1, NotificationSettingVersion::count());
        $this->assertSame('save_refused', NotificationSettingLog::orderByDesc('id')->value('event'));
    }

    public function test_save_anyway_goes_live_and_is_recorded_as_untested(): void
    {
        $r = $this->s->save('email', $this->email(), $this->admin(), fn () => ['ok' => false, 'message' => 'Timed out'], true);
        $this->assertFalse($r['version']->tested_ok);
        $this->assertSame('saved_anyway', NotificationSettingLog::first()->event);
        $this->assertSame('smtp.example.com', $this->s->get('email')['host']);
    }

    public function test_only_email_and_whatsapp_are_tested(): void
    {
        $called = 0;
        $this->s->save('general', ['default_mode' => 'email'], $this->admin(), function () use (&$called) { $called++; return ['ok' => false]; });
        $this->assertSame(0, $called);
        $this->assertSame('email', $this->s->get('general')['default_mode']);
    }

    public function test_the_history_names_fields_but_never_values(): void
    {
        $this->s->save('email', $this->email(), $this->admin(), $this->passes());
        $this->s->save('email', ['host' => 'mail.other.com', 'password' => 'rotated-KEY-1234'], $this->admin(), $this->passes());
        $v = $this->s->versions('email');
        $this->assertSame([2, 1], array_column($v, 'version_no'));
        $this->assertTrue($v[0]['is_current']);
        $this->assertFalse($v[1]['is_current']);
        $json = json_encode($v) . json_encode(NotificationSettingLog::all()->toArray());
        foreach (['hunter2', 'rotated-KEY', 'mail.other.com'] as $leak) {
            $this->assertStringNotContainsString($leak, $json);
        }
        $this->assertStringContainsString('password (changed)', $v[0]['summary']);
    }

    public function test_rollback_restores_the_old_settings_and_the_old_key_as_a_new_version(): void
    {
        $this->s->save('email', $this->email(), $this->admin(), $this->passes());
        $this->s->save('email', ['host' => 'mail.other.com', 'password' => 'rotated-KEY-1234'], $this->admin(), $this->passes());
        $this->assertSame('rotated-KEY-1234', $this->s->get('email')['password']);

        $back = $this->s->rollback('email', 1, $this->admin(6));
        $this->assertSame(3, $back->version_no);
        $this->assertSame('rollback', $back->action);
        $this->assertSame('smtp.example.com', $this->s->get('email')['host']);
        $this->assertSame('hunter2-SECRET', $this->s->get('email')['password'], 'the old key was kept and comes back');
        $this->assertSame(3, NotificationSettingVersion::count(), 'nothing was overwritten');
        $this->assertSame('rolled_back', NotificationSettingLog::orderByDesc('id')->first()->event);
        $this->assertSame(6, NotificationSettingLog::orderByDesc('id')->first()->user_id);

        $this->s->rollback('email', 2, $this->admin(6));   // the rollback can itself be undone
        $this->assertSame('mail.other.com', $this->s->get('email')['host']);
    }

    public function test_rollback_to_the_current_or_a_missing_or_another_parts_version_is_refused(): void
    {
        $this->s->save('email', $this->email(), $this->admin(), $this->passes());
        $this->s->save('general', ['default_mode' => 'email'], $this->admin());
        foreach ([[ 'email', 1 ], ['email', 99], ['email', NotificationSettingVersion::where('part', 'general')->value('id')]] as [$part, $id]) {
            try {
                $this->s->rollback($part, $id, $this->admin());
                $this->fail("Expected a refusal for {$part} {$id}");
            } catch (NotifyException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function test_only_old_versions_lose_their_keys_and_the_live_one_is_never_touched(): void
    {
        $this->s->save('email', $this->email(), $this->admin(), $this->passes());
        $this->s->save('email', ['password' => 'rotated-KEY-1234'], $this->admin(), $this->passes());
        $ids = NotificationSettingVersion::pluck('id')->all();

        $r = $this->s->purgeSecrets($ids, $this->admin(1));
        $this->assertSame(['purged' => 1, 'skipped_current' => 1, 'nothing_to_purge' => 0], $r);
        $this->assertSame('rotated-KEY-1234', $this->s->get('email')['password'], 'the live key is untouched');
        $this->assertStringNotContainsString('hunter2', json_encode(app(NotifySettings::class)->versions('email')));
        $old = NotificationSettingVersion::where('version_no', 1)->first();
        $this->assertNotNull($old->secrets_purged_at);
        $this->assertStringNotContainsString('hunter2', \Illuminate\Support\Facades\Crypt::decryptString($old->getRawOriginal('snapshot_enc')), 'the old key is really gone from the stored version');
        $this->assertStringContainsString('smtp.example.com', \Illuminate\Support\Facades\Crypt::decryptString($old->getRawOriginal('snapshot_enc')), 'the rest of the version is kept');
        $this->assertSame('keys_purged', NotificationSettingLog::orderByDesc('id')->value('event'));

        $again = $this->s->purgeSecrets($ids, $this->admin(1));
        $this->assertSame(0, $again['purged']);
    }

    public function test_a_version_whose_keys_were_deleted_can_not_be_restored(): void
    {
        $this->s->save('email', $this->email(), $this->admin(), $this->passes());
        $this->s->save('email', ['password' => 'rotated-KEY-1234'], $this->admin(), $this->passes());
        $this->s->purgeSecrets([NotificationSettingVersion::where('version_no', 1)->value('id')], $this->admin(1));

        $this->expectException(NotifyException::class);
        $this->expectExceptionMessage('keys in version 1 were deleted');
        $this->s->rollback('email', 1, $this->admin());
    }

    public function test_the_log_can_not_be_changed_or_deleted(): void
    {
        $this->s->save('email', $this->email(), $this->admin(), $this->passes());
        $log = NotificationSettingLog::first();
        $log->update(['summary' => 'tampered']);
        $log->delete();
        $this->assertNotSame('tampered', NotificationSettingLog::first()->summary);
        $this->assertSame(1, NotificationSettingLog::count());
    }

    public function test_reset_goes_back_to_the_server_defaults_and_can_be_undone(): void
    {
        $this->s->save('email', $this->email(), $this->admin(), $this->passes());
        $this->s->reset('email', $this->admin());
        $this->assertSame('', $this->s->get('email')['host']);
        $this->s->rollback('email', 1, $this->admin());
        $this->assertSame('smtp.example.com', $this->s->get('email')['host']);
    }

    public function test_an_unreadable_encrypted_part_reads_as_defaults_and_says_so(): void
    {
        $this->s->save('email', $this->email(), $this->admin(), $this->passes());
        DB::table('notification_settings')->update(['email_enc' => 'not-encrypted-with-this-key']);
        NotifySettings::forget();
        $this->assertTrue($this->s->unreadable('email'));
        $this->assertSame('', $this->s->get('email')['host']);
    }

    public function test_unknown_notification_types_are_dropped_from_the_rules(): void
    {
        $this->s->save('types', ['rules' => ['order_placed' => ['enabled' => false], 'made_up_type' => ['enabled' => false]]], $this->admin());
        $rules = $this->s->get('types')['rules'];
        $this->assertArrayHasKey('order_placed', $rules);
        $this->assertArrayNotHasKey('made_up_type', $rules);
    }

    public function test_no_part_ever_gives_the_screen_a_secret(): void
    {
        $this->s->save('email', $this->email(), $this->admin(), $this->passes());
        $this->s->save('whatsapp', ['provider' => 'meta', 'meta' => ['access_token' => 'EAAG-super-secret-token', 'phone_number_id' => '123', 'app_secret' => 'appsecret-xyz', 'verify_token' => 'verify-me'],
            'twilio' => ['auth_token' => 'twilio-auth-token-77']], $this->admin());
        $all = '';
        foreach (NotifySettings::PARTS as $p) {
            $all .= json_encode($this->s->masked($p), JSON_UNESCAPED_UNICODE) . json_encode($this->s->versions($p), JSON_UNESCAPED_UNICODE);
        }
        foreach (['hunter2', 'EAAG-super-secret', 'appsecret-xyz', 'verify-me', 'twilio-auth-token'] as $secret) {
            $this->assertStringNotContainsString($secret, $all);
        }
        $this->assertStringContainsString('••••oken', $all);
    }
}
