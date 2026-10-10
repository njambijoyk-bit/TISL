<?php

namespace App\Services\Payments;

use App\Models\PaymentSetting;
use App\Models\PaymentSettingLog;
use App\Models\PaymentSettingVersion;
use App\Models\User;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

/**
 * The payment keys (M-Pesa today; cards later), set on a screen instead of in .env. OWNER ONLY. The same discipline as the notification settings:
 *   - every save is a numbered VERSION holding the whole part (keys included, encrypted with the application key) and a line in an append-only log (who, when, which
 *     fields, from which address; never a value);
 *   - a key is write-only: it is never sent back, only `{set, hint}`; leaving it blank on save keeps the one we have;
 *   - saving first proves the key and secret with Safaricom (passed in by the caller); a failed test refuses the change unless the owner says "save anyway";
 *   - a rollback restores an earlier version as a NEW version, so it can itself be rolled back; only the owner can blank the keys inside OLD versions.
 * With nothing saved, the keys in .env keep working exactly as before; a blank field in what is saved falls back to .env too (DarajaConfigurator).
 * The callback token (what makes Safaricom's call to us believable) is made here, and a new one is accepted alongside the old for two hours so a payment in flight is not lost.
 */
class PaymentSettings
{
    /** M-Pesa is built in; every card provider (Gateways) is a part of its own, named by its key. */
    public const MPESA = 'mpesa';

    public const SECRETS = ['mpesa' => ['consumer_key', 'consumer_secret', 'passkey', 'callback_token', 'callback_token_previous']];

    /** @return string[] */
    public static function parts(): array
    {
        return array_merge([self::MPESA], Gateways::keys());
    }

    public static function isCard(string $part): bool
    {
        return Gateways::has($part);
    }

    /** @return array<string, mixed> */
    public static function defaults(string $part): array
    {
        return $part === self::MPESA ? self::DEFAULTS['mpesa'] : Gateways::defaults(Gateways::get($part));
    }

    /** Dot paths of the part's keys. @return string[] */
    public static function secrets(string $part): array
    {
        return $part === self::MPESA ? self::SECRETS['mpesa'] : Gateways::get($part)->secrets();
    }

    /** @return array<string, string> field => words for the history */
    private static function labels(string $part): array
    {
        if ($part === self::MPESA) {
            return self::LABELS;
        }
        $out = ['enabled' => 'offered at checkout', 'label' => 'name customers see', 'ledger_id' => 'account the money is booked into', 'charge_currency' => 'charge currency'];
        foreach (Gateways::get($part)->fields() as $f) {
            $out[$f['key']] = mb_strtolower($f['label']);
        }

        return $out;
    }

    /** Has script 117 been run (a column for each card provider)? */
    public static function cardsReady(): bool
    {
        $check = fn () => self::ready() && Schema::hasColumn('payment_settings', Gateways::keys()[0] . '_enc');

        return app()->runningUnitTests() ? $check() : (bool) Cache::remember('payment_settings_cards_ready', 300, $check);
    }

    public const DEFAULTS = [
        'mpesa' => ['env' => 'sandbox', 'consumer_key' => '', 'consumer_secret' => '', 'shortcode' => '', 'passkey' => '', 'account_reference' => 'ORDER', 'transaction_desc' => 'Order Payment',
            'callback_url' => '', 'callback_token' => '', 'callback_token_previous' => '', 'callback_token_rotated_at' => '', 'ledger_id' => ''],
    ];

    private const LABELS = ['env' => 'environment', 'consumer_key' => 'consumer key', 'consumer_secret' => 'consumer secret', 'shortcode' => 'shortcode', 'passkey' => 'passkey',
        'account_reference' => 'account reference', 'transaction_desc' => 'transaction description', 'callback_url' => 'callback address', 'callback_token' => 'callback token',
        'callback_token_previous' => 'previous callback token', 'callback_token_rotated_at' => 'token rotated', 'ledger_id' => 'account the money is booked into'];

    /** How long the old callback token is still accepted after a new one is made. */
    public const GRACE_MINUTES = 120;

    private static ?array $cache = null;

    public static function ready(): bool
    {
        $check = fn () => Schema::hasTable('payment_settings') && Schema::hasTable('payment_setting_versions') && Schema::hasTable('payment_setting_logs');

        return app()->runningUnitTests() ? $check() : (bool) Cache::remember('payment_settings_ready', 300, $check);
    }

    public static function forget(): void
    {
        self::$cache = null;
        Cache::forget('payment_settings_ready');
    }

    private function row(): ?PaymentSetting
    {
        return self::ready() ? PaymentSetting::find(1) : null;
    }

    private function assertPart(string $part): void
    {
        if (! in_array($part, self::parts(), true)) {
            throw new PaymentException("There is no \"{$part}\" part in the payment settings.");
        }
        if ($part !== self::MPESA && ! self::cardsReady()) {
            throw new PaymentException('Card payments are not set up yet: run database script 117_payment_cards.sql first.');
        }
    }

    /** The live part with the defaults filled in. An unreadable one (the app key changed) reads as the defaults; see unreadable(). */
    public function get(string $part): array
    {
        $this->assertPart($part);
        self::$cache ??= [];
        if (! array_key_exists($part, self::$cache)) {
            self::$cache[$part] = array_replace_recursive(self::defaults($part), $this->saved($part) ?? []);
        }

        return self::$cache[$part];
    }

    public function isSaved(string $part): bool
    {
        return $this->saved($part) !== null;
    }

    public function unreadable(string $part): bool
    {
        $raw = $this->row()?->getRawOriginal($part . '_enc');

        return $raw ? $this->decode($raw) === null : false;
    }

    private function saved(string $part): ?array
    {
        $raw = $this->row()?->getRawOriginal($part . '_enc');

        return $raw ? $this->decode($raw) : null;
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

    /** The part for the screen: every key replaced by {set, hint}. */
    public function masked(string $part): array
    {
        $out = $this->get($part);
        foreach (self::secrets($part) as $path) {
            $v = (string) Arr::get($out, $path, '');
            Arr::set($out, $path, ['set' => $v !== '', 'hint' => $v !== '' ? '••••' . substr($v, -4) : null]);
        }

        return $out;
    }

    // ------------------------------------------------------------ saving

    /**
     * Change a part. `$input` holds the fields to change (a key left out or blank is kept); `$clear` lists keys to empty. `$tester` ($candidate) => ['ok', 'message'] proves the
     * credentials before they go live; `$anyway` saves despite a failed test.
     *
     * @return array{version: PaymentSettingVersion, changed: string[], unchanged: bool, test: ?array}
     */
    public function save(string $part, array $input, ?User $by, ?callable $tester = null, bool $anyway = false, array $clear = []): array
    {
        $this->assertPart($part);
        $old = $this->get($part);
        $candidate = $this->normalise($part, $input, $old, $clear);
        if ($part === self::MPESA && ($candidate['callback_token'] ?? '') === '' && ($candidate['consumer_key'] ?? '') !== '') {
            $candidate['callback_token'] = Str::random(40);   // a saved setup always has one: callbacks without it are not believed
        }
        $changed = $this->changedKeys($part, $old, $candidate);
        $current = $this->currentVersion($part);
        if (! $changed && $current) {
            return ['version' => $current, 'changed' => [], 'unchanged' => true, 'test' => null];
        }

        $test = null;
        $tested = null;
        if ($part === self::MPESA) {
            $worth = (bool) array_intersect(['consumer key (changed)', 'consumer secret (changed)', 'environment'], $changed)
                && ($candidate['consumer_key'] ?? '') !== '' && ($candidate['consumer_secret'] ?? '') !== '';
        } else {   // a card provider: when one of its keys changed (or its environment) and there is enough saved to try
            $worth = Gateways::get($part)->configured($candidate) && (bool) array_filter($changed, fn ($c) => str_ends_with($c, '(changed)') || $c === 'environment');
        }
        if ($tester && $worth) {
            $test = $tester($candidate);
            $tested = (bool) ($test['ok'] ?? false);
            if (! $tested && ! $anyway) {
                PaymentSettingLog::write('save_refused', $by, $part, null, 'Not saved: the provider did not accept the keys (' . ($test['message'] ?? 'no reason given') . ').', ['changed' => $changed]);
                throw new PaymentException('Not saved: ' . ($test['message'] ?? 'the connection test failed.') . ' Nothing was changed. You can save it anyway if you are sure.');
            }
        }

        $summary = $changed ? 'Changed: ' . implode(', ', $changed) . '.' : 'First setup.';
        $version = $this->commit($part, $candidate, 'save', $summary, $changed, $by, $tested, null);
        PaymentSettingLog::write($tested === false ? 'saved_anyway' : 'saved', $by, $part, $version->id, "v{$version->version_no} · {$summary}", ['changed' => $changed]);

        return ['version' => $version, 'changed' => $changed, 'unchanged' => false, 'test' => $test];
    }

    /** Back to the server's own keys (.env). A version like any other, so it can be rolled back. */
    public function reset(string $part, ?User $by): PaymentSettingVersion
    {
        $this->assertPart($part);
        $version = $this->commit($part, self::defaults($part), 'save', $part === self::MPESA ? 'Cleared: back to the keys in the server settings.' : 'Cleared: this provider is switched off and its keys are gone from here.', ['everything'], $by, null, null);
        PaymentSettingLog::write('reset', $by, $part, $version->id, "v{$version->version_no} · cleared, back to the server's own keys.");

        return $version;
    }

    /** A new callback token. The old one still works for two hours (payments in flight carry it). */
    public function rotateToken(string $part, ?User $by): PaymentSettingVersion
    {
        $this->assertPart($part);
        if ($part !== self::MPESA) {
            throw new PaymentException('Only M-Pesa has a callback token.');
        }
        $c = $this->get($part);
        if (! $this->isSaved($part)) {
            throw new PaymentException('Save the keys here first: the callback token belongs to what is saved.');
        }
        $c['callback_token_previous'] = $c['callback_token'];
        $c['callback_token'] = Str::random(40);
        $c['callback_token_rotated_at'] = now()->toIso8601String();
        $version = $this->commit($part, $c, 'save', 'Changed: callback token (a new one; the old one works for ' . self::GRACE_MINUTES / 60 . ' hours).', ['callback token (changed)'], $by, null, null);
        PaymentSettingLog::write('token_rotated', $by, $part, $version->id, "v{$version->version_no} · new callback token.");

        return $version;
    }

    private function normalise(string $part, array $input, array $old, array $clear): array
    {
        if ($part === self::MPESA) {
            $rules = ['env' => 'sometimes|in:sandbox,production', 'consumer_key' => 'sometimes|nullable|string|max:300', 'consumer_secret' => 'sometimes|nullable|string|max:300',
                'shortcode' => ['sometimes', 'nullable', 'regex:/^\d{3,10}$/'], 'passkey' => 'sometimes|nullable|string|max:300', 'account_reference' => 'sometimes|nullable|string|max:12',
                'transaction_desc' => 'sometimes|nullable|string|max:13', 'callback_url' => 'sometimes|nullable|url|max:300', 'ledger_id' => 'sometimes|nullable|integer|min:1'];
            $messages = ['shortcode.regex' => 'The shortcode is the number of your Paybill or Till (digits only).'];
        } else {
            $rules = Gateways::commonRules() + Gateways::get($part)->rules();
            $messages = ['charge_currency.regex' => 'Use a 3-letter currency code such as USD or KES.'];
        }
        $valid = Validator::make(Arr::only($input, array_keys($rules)), $rules, $messages)->validate();

        $merged = array_replace($old, $valid);
        $typed = $part === self::MPESA ? ['callback_token', 'callback_token_previous'] : [];   // made by us, never typed
        foreach (self::secrets($part) as $path) {
            $given = Arr::get($valid, $path);
            if (in_array($path, $typed, true) || ! is_string($given) || $given === '') {
                $merged[$path] = $old[$path] ?? '';   // blank = keep
            }
            if (in_array($path, $clear, true) && ! in_array($path, $typed, true)) {
                $merged[$path] = '';
            }
        }
        foreach ($merged as $k => $v) {
            if ($v === null) {
                $merged[$k] = '';
            }
        }
        $merged['ledger_id'] = ($merged['ledger_id'] ?? '') === '' ? '' : (int) $merged['ledger_id'];
        if ($merged['ledger_id'] !== '' && ! in_array($merged['ledger_id'], array_column(MoneyLedgers::options(), 'id'), true)) {
            throw new PaymentException('Choose a bank or cash account for the money to be booked into.');
        }
        if ($part !== self::MPESA) {
            $gw = Gateways::get($part);
            foreach (array_merge([['key' => 'enabled', 'type' => 'toggle']], $gw->fields()) as $f) {
                if ($f['type'] === 'toggle') {
                    $merged[$f['key']] = filter_var($merged[$f['key']] ?? false, FILTER_VALIDATE_BOOLEAN);
                }
            }
            $merged['charge_currency'] = strtoupper((string) ($merged['charge_currency'] ?? ''));
            if ($merged['enabled'] && $gw->configured($merged) && empty($merged['ledger_id'])) {
                throw new PaymentException('Choose the account the money is booked into before you offer ' . $gw->label() . ' at checkout.');
            }
        }
        if ($part === self::MPESA && ($merged['env'] ?? 'sandbox') === 'production' && ($merged['callback_url'] ?? '') !== '' && ! str_starts_with($merged['callback_url'], 'https://')) {
            throw new PaymentException('For live payments the callback address must start with https://.');
        }

        return $merged;
    }

    /** The names of the fields that differ, in words; a key is only ever said to have changed. @return string[] */
    private function changedKeys(string $part, array $old, array $new): array
    {
        $out = [];
        foreach (array_unique(array_merge(array_keys($old), array_keys($new))) as $key) {
            if (($old[$key] ?? null) === ($new[$key] ?? null) || $key === 'callback_token_rotated_at') {
                continue;
            }
            $name = self::labels($part)[$key] ?? str_replace('_', ' ', $key);
            $out[] = in_array($key, self::secrets($part), true) ? "{$name} (changed)" : $name;
        }

        return array_values(array_unique($out));
    }

    // ------------------------------------------------------------ versions, rollback, purge

    public function currentVersion(string $part): ?PaymentSettingVersion
    {
        $id = $this->row()?->versions[$part] ?? null;

        return $id ? PaymentSettingVersion::find($id) : null;
    }

    private function commit(string $part, array $config, string $action, string $summary, array $changed, ?User $by, ?bool $tested, ?int $rolledBackFrom): PaymentSettingVersion
    {
        return DB::transaction(function () use ($part, $config, $action, $summary, $changed, $by, $tested, $rolledBackFrom) {
            $row = PaymentSetting::lockForUpdate()->find(1) ?? PaymentSetting::create(['id' => 1]);
            $no = (int) PaymentSettingVersion::where('part', $part)->max('version_no') + 1;
            $hasSecrets = collect(self::secrets($part))->contains(fn ($p) => (string) Arr::get($config, $p, '') !== '');
            $enc = Crypt::encryptString(json_encode($config));
            $version = PaymentSettingVersion::create(['part' => $part, 'version_no' => $no, 'snapshot_enc' => $enc, 'summary' => mb_substr($summary, 0, 500), 'changed_keys' => $changed ?: null,
                'action' => $action, 'rolled_back_from' => $rolledBackFrom, 'tested_ok' => $tested, 'has_secrets' => $hasSecrets, 'created_by' => $by?->id]);
            $row->{$part . '_enc'} = $enc;
            $row->versions = array_replace($row->versions ?? [], [$part => $version->id]);
            $row->updated_by = $by?->id;
            $row->save();
            self::forget();

            return $version;
        });
    }

    public function versions(string $part): array
    {
        $this->assertPart($part);
        $current = $this->row()?->versions[$part] ?? null;

        return PaymentSettingVersion::with('author:id,name')->where('part', $part)->orderByDesc('version_no')->get()->map(fn ($v) => [
            'id' => $v->id, 'version_no' => $v->version_no, 'action' => $v->action, 'summary' => $v->summary, 'changed' => $v->changed_keys ?? [], 'by' => $v->author?->name, 'at' => $v->created_at?->toIso8601String(),
            'is_current' => $v->id === $current, 'tested_ok' => $v->tested_ok, 'has_secrets' => $v->has_secrets, 'keys_deleted' => $v->secrets_purged_at !== null, 'rolled_back_from' => $v->rolled_back_from,
        ])->all();
    }

    /** Restore an earlier version as a new one. Refused for the current one and for one whose keys were deleted. */
    public function rollback(string $part, int $versionId, ?User $by): PaymentSettingVersion
    {
        $this->assertPart($part);
        $v = PaymentSettingVersion::where('part', $part)->find($versionId) ?? throw new PaymentException('That version does not exist.');
        if ($v->id === ($this->row()?->versions[$part] ?? null)) {
            throw new PaymentException('That is already the version in use.');
        }
        if ($v->secrets_purged_at) {
            throw new PaymentException("The keys in version {$v->version_no} were deleted, so it can not be restored as it was. Enter the keys again and save instead.");
        }
        $config = $this->decode((string) $v->snapshot_enc) ?? throw new PaymentException('That version can not be read (the application key has changed). Enter the settings again.');
        $config = array_replace(self::defaults($part), $config);
        // the callback token a restored version carries may be old: keep the CURRENT one so payments in flight and the address Safaricom has been given stay valid
        $current = $this->get($part);
        if ($part === self::MPESA && ($current['callback_token'] ?? '') !== '') {
            $config['callback_token'] = $current['callback_token'];
            $config['callback_token_previous'] = $current['callback_token_previous'] ?? '';
            $config['callback_token_rotated_at'] = $current['callback_token_rotated_at'] ?? '';
        }
        $new = $this->commit($part, $config, 'rollback', "Rolled back to v{$v->version_no}.", ["restored v{$v->version_no}"], $by, null, $v->id);
        PaymentSettingLog::write('rolled_back', $by, $part, $new->id, "v{$new->version_no} · restored v{$v->version_no}.", ['from_version' => $v->id]);

        return $new;
    }

    /**
     * Delete the keys kept in OLD versions (the version, its summary and its log lines stay). The live version is never touched.
     *
     * @param  int[]  $versionIds
     * @return array{purged: int, skipped_current: int, nothing_to_purge: int}
     */
    public function purgeSecrets(array $versionIds, ?User $by): array
    {
        $out = ['purged' => 0, 'skipped_current' => 0, 'nothing_to_purge' => 0];
        $live = array_values($this->row()?->versions ?? []);
        foreach (PaymentSettingVersion::whereIn('id', $versionIds)->get() as $v) {
            if (in_array($v->id, $live, true)) {
                $out['skipped_current']++;
                continue;
            }
            if ($v->secrets_purged_at || ! $v->has_secrets) {
                $out['nothing_to_purge']++;
                continue;
            }
            $config = $this->decode((string) $v->snapshot_enc) ?? [];
            foreach (self::secrets($v->part) as $p) {
                $config[$p] = '';
            }
            $v->forceFill(['snapshot_enc' => Crypt::encryptString(json_encode($config)), 'secrets_purged_at' => now(), 'secrets_purged_by' => $by?->id])->save();
            PaymentSettingLog::write('keys_purged', $by, $v->part, $v->id, "Keys deleted from {$v->part} v{$v->version_no}.");
            $out['purged']++;
        }

        return $out;
    }

    // ------------------------------------------------------------ the callback door

    /** Is this token the one Safaricom's callback must carry? The old one counts for two hours after a rotation. With no token set anywhere, callbacks are not refused (as before this screen). */
    public static function callbackTokenValid(?string $given): bool
    {
        $current = (string) config('daraja.callback_token');
        if ($current === '') {
            return true;
        }
        $given = (string) $given;
        if (hash_equals($current, $given)) {
            return true;
        }
        $prev = (string) config('daraja.callback_token_previous');

        return $prev !== '' && hash_equals($prev, $given);
    }
}
