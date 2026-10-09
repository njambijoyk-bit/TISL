<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\NotificationDelivery;
use App\Models\NotificationSettingLog;
use App\Services\Notify\ConnectionTester;
use App\Services\Notify\Notifier;
use App\Services\Notify\NotificationTypes;
use App\Services\Notify\NotifyException;
use App\Services\Notify\NotifySettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Staff side of the notification system (docs/NOTIFICATIONS_PLAN.md): the settings (email today; WhatsApp with phase 3), their history and rollback,
 * the owner's deletion of old keys, the log of every action, and the delivery log with retry. A secret is never returned: only {set, hint}.
 */
class NotificationSettingsController extends Controller
{
    /** The parts the screens work with now. */
    private const PARTS = ['general', 'types', 'email'];

    public function __construct(private NotifySettings $settings, private ConnectionTester $tester) {}

    private function guard(callable $fn): JsonResponse
    {
        try {
            return $fn();
        } catch (NotifyException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function part(string $part): string
    {
        abort_unless(in_array($part, self::PARTS, true), 404, 'There is no such part.');

        return $part;
    }

    /** GET /admin/notifications/settings */
    public function show(Request $request): JsonResponse
    {
        NotifySettings::forget();   // the screen that asks must not be told "not set up" for minutes after the script was run
        $user = $request->user();
        $out = ['parts' => [], 'saved' => [], 'unreadable' => [], 'current_version' => []];
        foreach (self::PARTS as $p) {
            $out['parts'][$p] = $this->settings->masked($p);
            $out['saved'][$p] = $this->settings->isSaved($p);
            $out['unreadable'][$p] = $this->settings->unreadable($p);
            $cv = $this->settings->currentVersion($p);
            $out['current_version'][$p] = $cv ? ['id' => $cv->id, 'version_no' => $cv->version_no, 'at' => $cv->created_at?->toIso8601String(), 'tested_ok' => $cv->tested_ok] : null;
        }

        return response()->json($out + [
            'ready' => NotifySettings::ready(),
            'types' => collect(NotificationTypes::ALL)->map(fn ($t, $k) => ['key' => $k, 'label' => $t[0], 'essential' => $t[1], 'audience' => $t[2]])->values(),
            'server' => ['mailer' => config('mail.default'), 'queue' => config('queue.default'), 'from' => config('mail.from.address')],
            'can' => ['settings' => $user->hasPermission('notifications.settings'), 'send' => $user->hasPermission('notifications.send'), 'purge' => $user->hasPermission('notifications.keys.purge')],
        ]);
    }

    /** PUT /admin/notifications/settings/{part} : fields to change, `clear` (secret paths to empty), `anyway` (save despite a failed test), `test_to`. */
    public function update(Request $request, string $part): JsonResponse
    {
        $part = $this->part($part);

        return $this->guard(function () use ($request, $part) {
            $input = $request->except(['clear', 'anyway', 'test_to']);
            $tester = $part === 'email' ? fn (array $candidate) => $this->tester->email($candidate, $request->user(), $request->input('test_to')) : null;
            $r = $this->settings->save($part, $input, $request->user(), $tester, $request->boolean('anyway'), (array) $request->input('clear', []));

            return response()->json(['message' => $r['unchanged'] ? 'Nothing was different, so nothing was saved.' : 'Saved as version ' . $r['version']->version_no . '.' . ($r['test'] ? ' ' . $r['test']['message'] : ''),
                'unchanged' => $r['unchanged'], 'changed' => $r['changed'], 'part' => $this->settings->masked($part)]);
        });
    }

    /** POST /admin/notifications/settings/email/test : send a test through the settings that are live now. */
    public function testEmail(Request $request): JsonResponse
    {
        $request->validate(['to' => 'nullable|email']);
        $r = $this->tester->email($this->settings->get('email'), $request->user(), $request->input('to'));
        NotificationSettingLog::write('tested', $request->user(), 'email', $this->settings->currentVersion('email')?->id, $r['ok'] ? 'Test email sent.' : 'Test email failed: ' . $r['message']);

        return response()->json($r, $r['ok'] ? 200 : 422);
    }

    /** POST /admin/notifications/settings/{part}/reset : back to the server's own settings. */
    public function reset(Request $request, string $part): JsonResponse
    {
        $part = $this->part($part);
        $v = $this->settings->reset($part, $request->user());

        return response()->json(['message' => "Cleared (version {$v->version_no}). You can roll back from the history.", 'part' => $this->settings->masked($part)]);
    }

    /** GET /admin/notifications/settings/{part}/versions */
    public function versions(string $part): JsonResponse
    {
        return response()->json(['data' => $this->settings->versions($this->part($part))]);
    }

    /** POST /admin/notifications/settings/{part}/versions/{id}/rollback */
    public function rollback(Request $request, string $part, int $id): JsonResponse
    {
        $part = $this->part($part);

        return $this->guard(function () use ($request, $part, $id) {
            $v = $this->settings->rollback($part, $id, $request->user());

            return response()->json(['message' => "Restored. It is now version {$v->version_no}; you can roll that back too.", 'part' => $this->settings->masked($part)]);
        });
    }

    /** POST /admin/notifications/settings/purge-keys {version_ids: []} : the owner deletes the keys kept in old versions. */
    public function purgeKeys(Request $request): JsonResponse
    {
        $d = $request->validate(['version_ids' => 'required|array|min:1|max:200', 'version_ids.*' => 'integer']);
        $r = $this->settings->purgeSecrets($d['version_ids'], $request->user());

        return response()->json(['message' => $r['purged'] . ' old version' . ($r['purged'] === 1 ? '' : 's') . ' lost their keys.' . ($r['skipped_current'] ? ' The version in use was left alone.' : ''), 'result' => $r]);
    }

    /** GET /admin/notifications/log : every action on the settings and the messages, newest first. */
    public function log(Request $request): JsonResponse
    {
        $q = NotificationSettingLog::with('user:id,name')->orderByDesc('id')
            ->when($request->filled('event'), fn ($w) => $w->where('event', $request->input('event')))
            ->when($request->filled('part'), fn ($w) => $w->where('part', $request->input('part')));
        $page = $q->paginate(min(max((int) $request->input('per_page', 25), 1), 100));
        $page->getCollection()->transform(fn ($l) => ['id' => $l->id, 'event' => $l->event, 'part' => $l->part, 'version_id' => $l->version_id, 'summary' => $l->summary,
            'by' => $l->user?->name, 'ip' => $l->ip, 'at' => $l->created_at?->toIso8601String()]);

        return response()->json($page);
    }

    /** GET /admin/notifications/deliveries : the delivery log, filtered. */
    public function deliveries(Request $request): JsonResponse
    {
        $q = NotificationDelivery::orderByDesc('id')
            ->when($request->filled('channel'), fn ($w) => $w->where('channel', $request->input('channel')))
            ->when($request->filled('status'), fn ($w) => $w->where('status', $request->input('status')))
            ->when($request->filled('type'), fn ($w) => $w->where('type', $request->input('type')))
            ->when($request->filled('q'), fn ($w) => $w->where(fn ($x) => $x->where('to_address', 'like', '%' . $request->input('q') . '%')->orWhere('subject', 'like', '%' . $request->input('q') . '%')));
        $page = $q->paginate(min(max((int) $request->input('per_page', 25), 1), 100));
        $page->getCollection()->transform(fn ($d) => ['id' => $d->id, 'type' => $d->type, 'type_label' => NotificationTypes::label($d->type), 'channel' => $d->channel, 'via' => $d->via, 'status' => $d->status,
            'to' => $d->to_address, 'subject' => $d->subject, 'error' => $d->error, 'attempts' => $d->attempts, 'at' => $d->created_at?->toIso8601String(), 'sent_at' => $d->sent_at?->toIso8601String()]);

        return response()->json($page);
    }

    /** POST /admin/notifications/deliveries/{id}/retry */
    public function retry(Request $request, int $id, Notifier $notifier): JsonResponse
    {
        return $this->guard(function () use ($request, $id, $notifier) {
            $notifier->retry(NotificationDelivery::findOrFail($id), $request->user());

            return response()->json(['message' => 'It will be tried again shortly.']);
        });
    }
}
