<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PaymentSettingLog;
use App\Services\DarajaService;
use App\Services\Payments\DarajaConfigurator;
use App\Services\Payments\DarajaTester;
use App\Services\Payments\Gateways;
use App\Services\Payments\MoneyLedgers;
use App\Services\Payments\PaymentAlerts;
use App\Services\Payments\PaymentException;
use App\Services\Payments\PaymentSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

/**
 * Payment keys, for the OWNER only (permission payments.keys). Every change asks for the owner's password again, is logged, and is emailed to every holder of the permission.
 * A key is never returned: only {set, hint}. See docs/PAYMENT_SETTINGS.md.
 */
class PaymentSettingsController extends Controller
{
    public function __construct(private PaymentSettings $settings, private DarajaTester $tester, private PaymentAlerts $alerts)
    {
    }

    private function guard(callable $fn): JsonResponse
    {
        try {
            return $fn();
        } catch (PaymentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function part(string $part): string
    {
        abort_unless(in_array($part, PaymentSettings::parts(), true), 404, 'There is no such part.');

        return $part;
    }

    /** The owner proves it is them again before anything is changed: a signed-in screen left open is not enough to move money. */
    private function confirm(Request $request): void
    {
        $request->validate(['password' => 'required|string']);
        if (! Hash::check((string) $request->input('password'), (string) $request->user()->password)) {
            PaymentSettingLog::write('password_failed', $request->user(), null, null, 'A change was refused: the password typed to confirm it was wrong.');
            throw new PaymentException('That password is not right. Nothing was changed.');
        }
    }

    /** GET /admin/payments/settings */
    public function show(Request $request): JsonResponse
    {
        PaymentSettings::forget();
        if (! PaymentSettings::ready()) {
            return response()->json(['ready' => false]);
        }
        $c = $this->settings->get('mpesa');
        $server = app()->bound('daraja.server_values') ? app('daraja.server_values') : config('daraja');
        $from = function (string $field, string $cfg) use ($c, $server) {
            return ($c[$field] ?? '') !== '' ? 'screen' : (($server[$cfg] ?? '') !== '' && $server[$cfg] !== null ? 'server' : 'none');
        };
        $base = DarajaConfigurator::callbackUrl($c);
        $cards = PaymentSettings::cardsReady();
        $parts = $cards ? PaymentSettings::parts() : ['mpesa'];
        $version = fn ($p) => ($v = $this->settings->currentVersion($p)) ? ['id' => $v->id, 'version_no' => $v->version_no, 'at' => $v->created_at?->toIso8601String(), 'tested_ok' => $v->tested_ok] : null;

        return response()->json([
            'ready' => true,
            'cards_ready' => $cards,
            'parts' => collect($parts)->mapWithKeys(fn ($p) => [$p => $this->settings->masked($p)])->all(),
            'saved' => collect($parts)->mapWithKeys(fn ($p) => [$p => $this->settings->isSaved($p)])->all(),
            'unreadable' => collect($parts)->mapWithKeys(fn ($p) => [$p => $this->settings->unreadable($p)])->all(),
            'current_version' => collect($parts)->mapWithKeys(fn ($p) => [$p => $version($p)])->all(),
            // the card providers: what each screen draws, how to set it up, and the address it should call
            'gateways' => $cards ? collect(Gateways::all())->map(fn ($g) => ['key' => $g->key(), 'label' => $g->label(), 'fields' => array_merge(Gateways::commonFields($g), $g->fields()), 'help' => $g->help(),
                'webhook_url' => url('/api/payments/webhook/' . $g->key()), 'ready' => $g->configured($this->settings->get($g->key()))])->values()->all() : [],
            'ledgers' => $cards ? MoneyLedgers::options() : [],
            // where each value comes from right now: what is saved here, the server's own settings (.env), or nothing
            'in_use' => ['env' => $from('env', 'env'), 'consumer_key' => $from('consumer_key', 'consumer_key'), 'consumer_secret' => $from('consumer_secret', 'consumer_secret'), 'shortcode' => $from('shortcode', 'shortcode'),
                'passkey' => $from('passkey', 'passkey'), 'callback_token' => $from('callback_token', 'callback_token')],
            'server_env' => ($server['env'] ?? 'sandbox'),
            'callback' => ['url' => $base, 'https' => str_starts_with($base, 'https://'), 'local' => (bool) preg_match('#^https?://(localhost|127\.|10\.|192\.168\.)#', $base), 'custom' => ($c['callback_url'] ?? '') !== '',
                'token_set' => ($c['callback_token'] ?? '') !== '' || ! empty($server['callback_token']), 'previous_valid_until' => $this->previousUntil($c)],
            'can' => ['keys' => true],
        ]);
    }

    private function previousUntil(array $c): ?string
    {
        $r = ($c['callback_token_previous'] ?? '') !== '' && ($c['callback_token_rotated_at'] ?? '') !== '' ? \Illuminate\Support\Carbon::parse($c['callback_token_rotated_at'])->addMinutes(PaymentSettings::GRACE_MINUTES) : null;

        return $r && $r->isFuture() ? $r->toIso8601String() : null;
    }

    /** PUT /admin/payments/settings/{part} : fields to change, `clear` (keys to empty), `anyway` (save despite a failed test), `password`. */
    public function update(Request $request, string $part): JsonResponse
    {
        $part = $this->part($part);

        return $this->guard(function () use ($request, $part) {
            $this->confirm($request);
            $tester = PaymentSettings::isCard($part) ? fn (array $candidate) => Gateways::get($part)->test($candidate) : fn (array $candidate) => $this->tester->connection($candidate);
            $r = $this->settings->save($part, $request->except(['clear', 'anyway', 'password']), $request->user(), $tester, $request->boolean('anyway'), (array) $request->input('clear', []));
            $this->applyNow($part);
            if (! $r['unchanged']) {
                $who = PaymentSettings::isCard($part) ? Gateways::get($part)->label() : 'Safaricom';
                $this->alerts->changed($request->user(), $part, 'Changed: ' . implode(', ', $r['changed']) . '.' . ($r['test'] && ! $r['test']['ok'] ? " (saved although {$who} did not accept the key)" : ''));
            }

            return response()->json(['message' => $r['unchanged'] ? 'Nothing was different, so nothing was saved.' : 'Saved as version ' . $r['version']->version_no . '.' . ($r['test'] ? ' ' . $r['test']['message'] : ''),
                'unchanged' => $r['unchanged'], 'changed' => $r['changed']]);
        });
    }

    /** POST /admin/payments/settings/mpesa/test : try the typed keys (kept ones filled in from what is saved) against Safaricom, saving nothing. */
    public function test(Request $request): JsonResponse
    {
        $c = array_replace($this->settings->get('mpesa'), array_filter($request->only(['env', 'consumer_key', 'consumer_secret']), fn ($v) => is_string($v) && $v !== ''));
        $r = $this->tester->connection($c);
        PaymentSettingLog::write('tested', $request->user(), 'mpesa', $this->settings->currentVersion('mpesa')?->id, $r['ok'] ? 'Key test passed.' : 'Key test failed: ' . $r['message']);

        return response()->json($r, $r['ok'] ? 200 : 422);
    }

    /** POST /admin/payments/settings/{part}/test : try a card provider's typed keys (kept ones filled in from what is saved) with the provider, saving nothing. */
    public function testCard(Request $request, string $part): JsonResponse
    {
        abort_unless(PaymentSettings::isCard($part), 404);
        $g = Gateways::get($part);
        $typed = array_filter($request->only(array_column($g->fields(), 'key')), fn ($v) => is_string($v) && $v !== '');
        $r = $g->test(array_replace($this->settings->get($part), $typed));
        PaymentSettingLog::write('tested', $request->user(), $part, $this->settings->currentVersion($part)?->id, $g->label() . ($r['ok'] ? ': key test passed.' : ': key test failed: ' . $r['message']));

        return response()->json($r, $r['ok'] ? 200 : 422);
    }

    /** POST /admin/payments/settings/mpesa/test-prompt {phone, password} : a real KES 1 prompt through the keys that are live now (proves the shortcode and passkey). */
    public function testPrompt(Request $request): JsonResponse
    {
        $d = $request->validate(['phone' => 'required|string|max:20']);

        return $this->guard(function () use ($request, $d) {
            $this->confirm($request);
            $daraja = app(DarajaService::class);
            try {
                $phone = $daraja->normalizePhone($d['phone']);
                $daraja->stkPush($phone, 1, 'TEST-' . strtoupper(substr(md5(uniqid('', true)), 0, 6)), 'test');
            } catch (\InvalidArgumentException|\RuntimeException $e) {
                PaymentSettingLog::write('test_prompt_failed', $request->user(), 'mpesa', $this->settings->currentVersion('mpesa')?->id, 'KES 1 test prompt failed: ' . $e->getMessage());
                throw new PaymentException('The prompt was not sent: ' . $e->getMessage());
            }
            PaymentSettingLog::write('test_prompt', $request->user(), 'mpesa', $this->settings->currentVersion('mpesa')?->id, 'KES 1 test prompt sent to ' . substr($phone, 0, 6) . '••••' . substr($phone, -2) . '.');

            return response()->json(['message' => 'A KES 1 prompt was sent to ' . $phone . '. Enter your PIN: if it goes through, the shortcode, passkey and keys all work. (The KES 1 is real money, paid to your shortcode.)']);
        });
    }

    /** POST /admin/payments/settings/{part}/rotate-token */
    public function rotateToken(Request $request, string $part): JsonResponse
    {
        $part = $this->part($part);

        return $this->guard(function () use ($request, $part) {
            $this->confirm($request);
            $v = $this->settings->rotateToken($part, $request->user());
            $this->applyNow($part);
            $this->alerts->changed($request->user(), $part, 'A new callback token was made (the old one still works for ' . PaymentSettings::GRACE_MINUTES / 60 . ' hours).');

            return response()->json(['message' => 'A new callback token is in use (version ' . $v->version_no . '). Payments already waiting still arrive for ' . PaymentSettings::GRACE_MINUTES / 60 . ' hours.']);
        });
    }

    /** POST /admin/payments/settings/{part}/reset : back to the keys in .env. */
    public function reset(Request $request, string $part): JsonResponse
    {
        $part = $this->part($part);

        return $this->guard(function () use ($request, $part) {
            $this->confirm($request);
            $v = $this->settings->reset($part, $request->user());
            PaymentSettings::forget();
            if (PaymentSettings::isCard($part)) {
                app(MoneyLedgers::class)->sync($part, $this->settings->get($part));   // switched off at checkout
                $this->alerts->changed($request->user(), $part, 'Cleared: the keys for ' . Gateways::get($part)->label() . ' were removed and it is no longer offered at checkout.', 'Payment keys were cleared');

                return response()->json(['message' => 'Cleared (version ' . $v->version_no . '). ' . Gateways::get($part)->label() . ' is no longer offered at checkout.']);
            }
            app()->forgetInstance(DarajaService::class);
            $this->alerts->changed($request->user(), $part, 'Cleared: the keys saved on the screen were removed and the server\'s own keys (.env) are used again.', 'Payment keys were cleared');

            return response()->json(['message' => "Cleared (version {$v->version_no}). The server's own M-Pesa keys are used again. A restart of the background worker may be needed to pick this up."]);
        });
    }

    /** GET /admin/payments/settings/{part}/versions */
    public function versions(string $part): JsonResponse
    {
        return response()->json(['data' => $this->settings->versions($this->part($part))]);
    }

    /** POST /admin/payments/settings/{part}/versions/{id}/rollback */
    public function rollback(Request $request, string $part, int $id): JsonResponse
    {
        $part = $this->part($part);

        return $this->guard(function () use ($request, $part, $id) {
            $this->confirm($request);
            $v = $this->settings->rollback($part, $id, $request->user());
            $this->applyNow($part);
            $this->alerts->changed($request->user(), $part, "Rolled back to an earlier version (now version {$v->version_no}).", 'Payment keys were rolled back');

            return response()->json(['message' => "Restored as version {$v->version_no}."]);
        });
    }

    /** POST /admin/payments/settings/purge-keys {version_ids[], password} : delete the keys kept in old versions. */
    public function purgeKeys(Request $request): JsonResponse
    {
        $d = $request->validate(['version_ids' => 'required|array|min:1', 'version_ids.*' => 'integer']);

        return $this->guard(function () use ($request, $d) {
            $this->confirm($request);
            $r = $this->settings->purgeSecrets($d['version_ids'], $request->user());
            if ($r['purged']) {
                $this->alerts->changed($request->user(), 'mpesa', "Deleted the keys kept in {$r['purged']} old version(s).", 'Old payment keys were deleted');
            }

            return response()->json($r + ['message' => $r['purged'] ? "Deleted the keys from {$r['purged']} old version(s)." : 'Nothing to delete.']);
        });
    }

    /** GET /admin/payments/log */
    public function log(Request $request): JsonResponse
    {
        $rows = PaymentSettingLog::with('user:id,name')->orderByDesc('id')->paginate(min((int) $request->get('per_page', 30), 100));
        $rows->getCollection()->transform(fn ($l) => ['id' => $l->id, 'at' => $l->created_at?->toIso8601String(), 'event' => $l->event, 'part' => $l->part, 'summary' => $l->summary, 'by' => $l->user?->name, 'ip' => $l->ip]);

        return response()->json($rows);
    }

    /** What was just saved goes live: M-Pesa's keys are laid over the config; a card provider's method at checkout is switched on or off to match. */
    private function applyNow(string $part): void
    {
        PaymentSettings::forget();
        if (PaymentSettings::isCard($part)) {
            app(MoneyLedgers::class)->sync($part, $this->settings->get($part));

            return;
        }
        app(DarajaConfigurator::class)->apply();
    }
}
