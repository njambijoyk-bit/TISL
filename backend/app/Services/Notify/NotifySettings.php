<?php

namespace App\Services\Notify;

use App\Models\NotificationSetting;
use App\Models\NotificationSettingLog;
use App\Models\NotificationSettingVersion;
use App\Models\User;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

/**
 * The notification settings (docs/NOTIFICATIONS_PLAN.md). Four parts: general, types (plain) and email, whatsapp (encrypted whole).
 *
 *   - Every save of a part is a numbered VERSION holding the whole part (secrets included, encrypted) and a line in the log (who, when, which fields; never a value).
 *   - Replacing a key therefore never loses the old one. A rollback restores an earlier version as a NEW version, so it can itself be rolled back.
 *   - A secret is write-only: it is never returned, only `{set, hint}`; a blank field on save means "keep the one we have".
 *   - Saving email or whatsapp first runs a connection test (passed in by the caller); a failed test refuses the change unless the admin says "save anyway".
 *   - Only the owner may blank the keys inside OLD versions (purgeSecrets); nothing else is ever deleted.
 */
class NotifySettings
{
    public const PARTS = ['general', 'types', 'email', 'whatsapp'];
    public const ENCRYPTED = ['email', 'whatsapp'];
    /** Dot paths of the values that are secrets, per part. */
    public const SECRETS = [
        'email' => ['password'],
        'whatsapp' => ['meta.access_token', 'meta.app_secret', 'meta.verify_token', 'twilio.auth_token'],
    ];
    public const DEFAULTS = [
        'general' => ['default_mode' => 'both', 'email_enabled' => true, 'whatsapp_enabled' => false, 'whatsapp_number_sources' => 'both', 'essential_only_default' => false,
            'back_in_stock_enabled' => true, 'back_in_stock_mode' => 'stock', 'back_in_stock_hold_hours' => 24,
            'cart_reminders_enabled' => false, 'cart_reminder_after_hours' => 24, 'cart_reminder_count' => 1, 'price_drop_enabled' => false, 'price_drop_min_percent' => 5],
        'types' => ['rules' => []],
        'email' => ['driver' => 'smtp', 'host' => '', 'port' => 587, 'encryption' => 'tls', 'username' => '', 'password' => '', 'from_name' => '', 'from_address' => '', 'reply_to' => '', 'copy_to' => ''],
        'whatsapp' => ['provider' => null, 'auto' => false, 'language' => 'en',
            'meta' => ['phone_number_id' => '', 'business_account_id' => '', 'access_token' => '', 'app_secret' => '', 'verify_token' => ''],
            'twilio' => ['account_sid' => '', 'auth_token' => '', 'from' => '', 'messaging_service_sid' => '']],
    ];
    /** What a field is called on screen, for the history in words. */
    private const LABELS = ['default_mode' => 'default mode', 'email_enabled' => 'email on/off', 'whatsapp_enabled' => 'WhatsApp on/off', 'whatsapp_number_sources' => 'which numbers count',
        'essential_only_default' => 'essential only (default)', 'back_in_stock_enabled' => 'back-in-stock alerts on/off', 'back_in_stock_mode' => 'back-in-stock who is told', 'back_in_stock_hold_hours' => 'back-in-stock hold (hours)', 'cart_reminders_enabled' => 'cart reminders on/off', 'cart_reminder_after_hours' => 'cart reminder after (hours)', 'cart_reminder_count' => 'cart reminders per cart', 'price_drop_enabled' => 'price-drop alerts on/off', 'price_drop_min_percent' => 'price-drop minimum (%)', 'from_name' => 'sender name', 'from_address' => 'sender address', 'reply_to' => 'reply-to', 'copy_to' => 'copy-to',
        'rules' => 'type rules', 'phone_number_id' => 'phone number ID', 'business_account_id' => 'business account ID', 'account_sid' => 'account SID', 'messaging_service_sid' => 'messaging service'];

    private static ?array $cache = null;

    /** Has script 108 been run? Remembered for a few minutes so a request does not ask the database every time (not in tests, which build their own tables). */
    public static function ready(): bool
    {
        $check = fn () => Schema::hasTable('notification_settings') && Schema::hasTable('notification_setting_versions') && Schema::hasTable('notification_setting_logs');

        return app()->runningUnitTests() ? $check() : (bool) Cache::remember('notify_settings_ready', 300, $check);
    }

    public static function forget(): void
    {
        self::$cache = null;
        Cache::forget('notify_settings_ready');
    }

    private function row(): ?NotificationSetting
    {
        return self::ready() ? NotificationSetting::find(1) : null;
    }

    /** The live part with the defaults filled in. An unreadable encrypted part (the app key changed) reads as the defaults; see unreadable(). */
    public function get(string $part): array
    {
        $this->assertPart($part);
        self::$cache ??= [];
        if (! array_key_exists($part, self::$cache)) {
            $saved = $this->saved($part);
            self::$cache[$part] = array_replace_recursive(self::DEFAULTS[$part], $saved ?? []);
        }

        return self::$cache[$part];
    }

    /** Has anything been saved for this part (otherwise the server's own settings apply)? */
    public function isSaved(string $part): bool
    {
        return $this->saved($part) !== null;
    }

    /** True when an encrypted part is saved but can not be read (the app key changed): the keys must be entered again. */
    public function unreadable(string $part): bool
    {
        $row = $this->row();
        $col = $part . '_enc';
        if (! $row || ! in_array($part, self::ENCRYPTED, true) || ! $row->getRawOriginal($col)) {
            return false;
        }

        return $this->decode($row->getRawOriginal($col)) === null;
    }

    private function saved(string $part): ?array
    {
        $row = $this->row();
        if (! $row) {
            return null;
        }
        if (in_array($part, self::ENCRYPTED, true)) {
            $raw = $row->getRawOriginal($part . '_enc');

            return $raw ? $this->decode($raw) : null;
        }

        return $row->{$part} ?: null;
    }

    private function decode(string $encrypted): ?array
    {
        try {
            $v = json_decode(Crypt::decryptString($encrypted), true);

            return is_array($v) ? $v : null;
        } catch (\Throwable) {
            return null;
        }
    }

    private function assertPart(string $part): void
    {
        if (! in_array($part, self::PARTS, true)) {
            throw new NotifyException("There is no \"{$part}\" part in the notification settings.");
        }
    }

    // ------------------------------------------------------------ what the screen may see

    /** The part for the screen: every secret replaced by {set, hint}. */
    public function masked(string $part): array
    {
        $out = $this->get($part);
        foreach (self::SECRETS[$part] ?? [] as $path) {
            $v = (string) Arr::get($out, $path, '');
            Arr::set($out, $path, ['set' => $v !== '', 'hint' => $v !== '' ? '••••' . substr($v, -4) : null]);
        }

        return $out;
    }

    // ------------------------------------------------------------ saving

    /**
     * Change a part. `$input` holds the fields to change (a secret left out or blank is kept); `$clear` lists secret paths to empty.
     * `$tester` ($candidate) => ['ok' => bool, 'message' => string] checks the connection before the change goes live (email and whatsapp); `$anyway` saves despite a failed test.
     *
     * @return array{version: NotificationSettingVersion, changed: string[], unchanged: bool, test: ?array}
     */
    public function save(string $part, array $input, ?User $by, ?callable $tester = null, bool $anyway = false, array $clear = []): array
    {
        $this->assertPart($part);
        $old = $this->get($part);
        $candidate = $this->normalise($part, $input, $old, $clear);
        $changed = $this->changedKeys($part, $old, $candidate);
        $current = $this->currentVersion($part);
        if (! $changed && $current) {
            return ['version' => $current, 'changed' => [], 'unchanged' => true, 'test' => null];
        }

        $test = null;
        $tested = null;
        if ($tester && in_array($part, self::ENCRYPTED, true) && $this->worthTesting($part, $candidate)) {
            $test = $tester($candidate);
            $tested = (bool) ($test['ok'] ?? false);
            if (! $tested && ! $anyway) {
                NotificationSettingLog::write('save_refused', $by, $part, null, 'Not saved: the connection test failed (' . ($test['message'] ?? 'no reason given') . ').', ['changed' => $changed]);
                throw new NotifyException('Not saved: the connection test failed. ' . ($test['message'] ?? '') . ' Nothing was changed. You can save it anyway if you are sure.');
            }
        }

        $summary = $changed ? 'Changed: ' . implode(', ', $changed) . '.' : 'First setup.';
        $version = $this->commit($part, $candidate, 'save', $summary, $changed, $by, $tested === null ? null : $tested, null);
        NotificationSettingLog::write($tested === false ? 'saved_anyway' : 'saved', $by, $part, $version->id, "v{$version->version_no} · {$summary}", ['changed' => $changed]);

        return ['version' => $version, 'changed' => $changed, 'unchanged' => false, 'test' => $test];
    }

    /** Is there anything to test: email needs a host; whatsapp needs a provider and its keys. */
    private function worthTesting(string $part, array $c): bool
    {
        return $part === 'email' ? ($c['host'] ?? '') !== '' : (($c['provider'] ?? null) !== null);   // whatsapp: only once a provider is chosen
    }

    /** Back to the server's own settings (.env) for email, or to nothing for whatsapp. A version like any other, so it can be rolled back. */
    public function reset(string $part, ?User $by): NotificationSettingVersion
    {
        $this->assertPart($part);
        $candidate = self::DEFAULTS[$part];
        $version = $this->commit($part, $candidate, 'save', 'Cleared: back to the server defaults.', ['everything'], $by, null, null);
        NotificationSettingLog::write('reset', $by, $part, $version->id, "v{$version->version_no} · cleared, back to the server defaults.");

        return $version;
    }

    /** Validate the input for the part and fold it into what is live, keeping secrets that were not re-entered. */
    private function normalise(string $part, array $input, array $old, array $clear): array
    {
        $rules = match ($part) {
            'general' => ['default_mode' => 'sometimes|in:email,whatsapp,both', 'email_enabled' => 'sometimes|boolean', 'whatsapp_enabled' => 'sometimes|boolean',
                'whatsapp_number_sources' => 'sometimes|in:profile,checkout,both', 'essential_only_default' => 'sometimes|boolean',
                'back_in_stock_enabled' => 'sometimes|boolean', 'back_in_stock_mode' => 'sometimes|in:stock,all,manual', 'back_in_stock_hold_hours' => 'sometimes|integer|between:1,168',
                'cart_reminders_enabled' => 'sometimes|boolean', 'cart_reminder_after_hours' => 'sometimes|integer|between:1,168', 'cart_reminder_count' => 'sometimes|integer|in:1,2', 'price_drop_enabled' => 'sometimes|boolean', 'price_drop_min_percent' => 'sometimes|integer|between:1,90'],
            'types' => ['rules' => 'sometimes|array', 'rules.*.enabled' => 'sometimes|boolean', 'rules.*.channels' => 'nullable|array', 'rules.*.channels.*' => 'in:email,whatsapp', 'rules.*.template' => 'nullable|string|max:120', 'rules.*.variables' => 'nullable|array|max:10', 'rules.*.variables.*' => 'in:name,title,message,company,link'],
            'email' => ['driver' => 'sometimes|in:smtp', 'host' => 'sometimes|nullable|string|max:190', 'port' => 'sometimes|integer|between:1,65535', 'encryption' => 'sometimes|in:tls,ssl,none',
                'username' => 'sometimes|nullable|string|max:190', 'password' => 'sometimes|nullable|string|max:300', 'from_name' => 'sometimes|nullable|string|max:120',
                'from_address' => 'sometimes|nullable|email|max:190', 'reply_to' => 'sometimes|nullable|email|max:190', 'copy_to' => 'sometimes|nullable|email|max:190'],
            'whatsapp' => ['provider' => 'sometimes|nullable|in:meta,twilio', 'auto' => 'sometimes|boolean', 'language' => 'sometimes|string|max:10',
                'meta' => 'sometimes|array', 'meta.*' => 'nullable|string|max:400', 'twilio' => 'sometimes|array', 'twilio.*' => 'nullable|string|max:400'],
        };
        $valid = Validator::make($input, $rules)->validate();

        $merged = array_replace_recursive($old, $valid);
        foreach (self::SECRETS[$part] ?? [] as $path) {
            $given = Arr::get($valid, $path);
            if (! is_string($given) || $given === '') {
                Arr::set($merged, $path, Arr::get($old, $path, ''));   // blank = keep
            }
            if (in_array($path, $clear, true)) {
                Arr::set($merged, $path, '');
            }
        }
        if ($part === 'types' && isset($valid['rules'])) {
            $known = NotificationTypes::keys();
            $merged['rules'] = array_intersect_key($valid['rules'], array_flip($known));   // the types sent are the types kept
        }
        foreach ($merged as $k => $v) {
            if ($v === null && is_string(Arr::get(self::DEFAULTS[$part], $k))) {
                $merged[$k] = '';
            }
        }

        return $merged;
    }

    /** The names of the fields that differ, in words; a secret is only ever said to have changed. @return string[] */
    private function changedKeys(string $part, array $old, array $new): array
    {
        $secrets = self::SECRETS[$part] ?? [];
        $a = Arr::dot($old);
        $b = Arr::dot($new);
        $out = [];
        foreach (array_unique(array_merge(array_keys($a), array_keys($b))) as $key) {
            if (($a[$key] ?? null) === ($b[$key] ?? null)) {
                continue;
            }
            $leaf = Str::afterLast($key, '.');
            $name = self::LABELS[$leaf] ?? str_replace('_', ' ', $leaf);
            if (str_starts_with($key, 'rules.')) {
                $name = 'type rules';
            }
            $out[] = in_array($key, $secrets, true) ? "{$name} (changed)" : $name;
        }

        return array_values(array_unique($out));
    }

    // ------------------------------------------------------------ versions, rollback, purge

    public function currentVersion(string $part): ?NotificationSettingVersion
    {
        $id = $this->row()?->versions[$part] ?? null;

        return $id ? NotificationSettingVersion::find($id) : null;
    }

    /** Write a new version and make it the live one, in one step. */
    private function commit(string $part, array $config, string $action, string $summary, array $changed, ?User $by, ?bool $tested, ?int $rolledBackFrom): NotificationSettingVersion
    {
        return DB::transaction(function () use ($part, $config, $action, $summary, $changed, $by, $tested, $rolledBackFrom) {
            $row = NotificationSetting::lockForUpdate()->find(1) ?? NotificationSetting::create(['id' => 1]);
            $no = (int) NotificationSettingVersion::where('part', $part)->max('version_no') + 1;
            $hasSecrets = collect(self::SECRETS[$part] ?? [])->contains(fn ($p) => (string) Arr::get($config, $p, '') !== '');
            $version = NotificationSettingVersion::create(['part' => $part, 'version_no' => $no, 'snapshot_enc' => Crypt::encryptString(json_encode($config)), 'summary' => mb_substr($summary, 0, 500),
                'changed_keys' => $changed ?: null, 'action' => $action, 'rolled_back_from' => $rolledBackFrom, 'tested_ok' => $tested, 'has_secrets' => $hasSecrets, 'created_by' => $by?->id]);
            if (in_array($part, self::ENCRYPTED, true)) {
                $row->{$part . '_enc'} = Crypt::encryptString(json_encode($config));
            } else {
                $row->{$part} = $config;
            }
            $row->versions = array_replace($row->versions ?? [], [$part => $version->id]);
            $row->updated_by = $by?->id;
            $row->save();
            self::forget();

            return $version;
        });
    }

    /** The versions of a part, newest first, for the history screen. Never the snapshot. */
    public function versions(string $part): array
    {
        $this->assertPart($part);
        $current = $this->row()?->versions[$part] ?? null;

        return NotificationSettingVersion::with('author:id,name')->where('part', $part)->orderByDesc('version_no')->get()->map(fn ($v) => [
            'id' => $v->id, 'version_no' => $v->version_no, 'action' => $v->action, 'summary' => $v->summary, 'changed' => $v->changed_keys ?? [], 'by' => $v->author?->name, 'at' => $v->created_at?->toIso8601String(),
            'is_current' => $v->id === $current, 'tested_ok' => $v->tested_ok, 'has_secrets' => $v->has_secrets, 'keys_deleted' => $v->secrets_purged_at !== null,
            'rolled_back_from' => $v->rolled_back_from,
        ])->all();
    }

    /** Restore an earlier version of the part as a new version. Refused for the current one, for another part's, and when its keys were deleted. */
    public function rollback(string $part, int $versionId, ?User $by): NotificationSettingVersion
    {
        $this->assertPart($part);
        $v = NotificationSettingVersion::where('part', $part)->find($versionId) ?? throw new NotifyException('That version does not exist.');
        if ($v->id === ($this->row()?->versions[$part] ?? null)) {
            throw new NotifyException('That is already the version in use.');
        }
        if ($v->secrets_purged_at && ($v->has_secrets || ! empty(self::SECRETS[$part]))) {
            throw new NotifyException("The keys in version {$v->version_no} were deleted by the owner, so it can not be restored as it was. Enter the keys again and save instead.");
        }
        $config = $this->decode((string) $v->snapshot_enc) ?? throw new NotifyException('That version can not be read (the application key has changed). Enter the settings again.');
        $config = array_replace_recursive(self::DEFAULTS[$part], $config);
        $summary = "Rolled back to v{$v->version_no}.";
        $new = $this->commit($part, $config, 'rollback', $summary, ["restored v{$v->version_no}"], $by, null, $v->id);
        NotificationSettingLog::write('rolled_back', $by, $part, $new->id, "v{$new->version_no} · restored v{$v->version_no}.", ['from_version' => $v->id]);

        return $new;
    }

    /**
     * The owner deletes the keys kept in OLD versions: the version, its summary and its log lines stay, the secrets go. The current version is never touched.
     *
     * @param  int[]  $versionIds
     * @return array{purged: int, skipped_current: int, nothing_to_purge: int}
     */
    public function purgeSecrets(array $versionIds, ?User $by): array
    {
        $out = ['purged' => 0, 'skipped_current' => 0, 'nothing_to_purge' => 0];
        $live = array_values($this->row()?->versions ?? []);
        foreach (NotificationSettingVersion::whereIn('id', $versionIds)->get() as $v) {
            if (in_array($v->id, $live, true)) {
                $out['skipped_current']++;
                continue;
            }
            $paths = self::SECRETS[$v->part] ?? [];
            if (! $paths || $v->secrets_purged_at || ! $v->has_secrets) {
                $out['nothing_to_purge']++;
                continue;
            }
            $config = $this->decode((string) $v->snapshot_enc) ?? [];
            foreach ($paths as $p) {
                Arr::set($config, $p, '');
            }
            $v->forceFill(['snapshot_enc' => Crypt::encryptString(json_encode($config)), 'secrets_purged_at' => now(), 'secrets_purged_by' => $by?->id])->save();
            NotificationSettingLog::write('keys_purged', $by, $v->part, $v->id, "Keys deleted from {$v->part} v{$v->version_no}.");
            $out['purged']++;
        }

        return $out;
    }
}
