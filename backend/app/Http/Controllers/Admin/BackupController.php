<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\BackupSetting;
use App\Services\Backup\BackupPlanner;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Backup configuration + (later) run/restore.
 *
 * Config and running: admin or super_admin (route middleware).
 * Restore: super_admin only (route middleware) — added when the restore engine
 * lands. The export/restore engines are stubs for now; settings and the plan
 * are live.
 */
class BackupController extends Controller
{
    public function __construct(private BackupPlanner $planner) {}

    /** Current settings — secrets returned only as booleans, never in the clear. */
    public function settings()
    {
        $s = BackupSetting::current();

        return response()->json([
            'enabled'            => $s->enabled,
            'frequency'          => $s->frequency,
            'run_time'           => $s->run_time,
            'run_day'            => $s->run_day,
            'retention_count'    => $s->retention_count,
            'destination_driver' => $s->destination_driver,
            // config without secret values; just the non-secret shape + a flag
            'destination'        => $this->safeDestination($s),
            'has_passphrase'     => $s->hasPassphrase(),
            'last_run_at'        => $s->last_run_at,
            'next_run_at'        => $s->next_run_at,
            'last_status'        => $s->last_status,
        ]);
    }

    public function updateSettings(Request $request)
    {
        $data = $request->validate([
            'enabled'            => 'boolean',
            'frequency'          => ['required', Rule::in(['daily', 'weekly', 'monthly', 'never'])],
            'run_time'           => 'nullable|date_format:H:i',
            'run_day'            => 'nullable|integer|min:0|max:31',
            'retention_count'    => 'integer|min:1|max:365',
            'destination_driver' => ['required', Rule::in(['local', 'ftp', 'sftp', 's3'])],
            'destination'        => 'nullable|array',
            'passphrase'         => 'nullable|string|min:8|max:200',
        ]);

        $s = BackupSetting::current();
        $s->fill([
            'enabled'            => $data['enabled'] ?? false,
            'frequency'          => $data['frequency'],
            'run_time'           => $data['run_time'] ?? null,
            'run_day'            => $data['run_day'] ?? null,
            'retention_count'    => $data['retention_count'] ?? 7,
            'destination_driver' => $data['destination_driver'],
        ]);
        if (array_key_exists('destination', $data)) {
            // Merge: keep an existing secret when the form left it blank/masked.
            $existing = $s->destination_config ?? [];
            $incoming = $data['destination'] ?? [];
            foreach (['password', 'secret', 'secret_key', 'key', 'access_key'] as $secret) {
                if (array_key_exists($secret, $incoming) && in_array($incoming[$secret], ['', '********'], true)) {
                    if (array_key_exists($secret, $existing)) {
                        $incoming[$secret] = $existing[$secret];
                    } else {
                        unset($incoming[$secret]);
                    }
                }
            }
            $s->destination_config = $incoming;
        }
        // Only overwrite the passphrase when a new one is supplied.
        if (!empty($data['passphrase'])) {
            $s->passphrase = $data['passphrase'];
        }
        $s->save();

        return response()->json(['ok' => true, 'message' => 'Backup settings saved.']);
    }

    /** What a backup would and wouldn't include right now (drives the banners). */
    public function plan()
    {
        return response()->json($this->planner->plan());
    }

    /** Run a backup now — export engine not built yet. */
    public function run()
    {
        return response()->json([
            'ok'      => false,
            'message' => 'The export engine is still being built. Your settings and the backup plan are ready.',
        ], 501);
    }

    /** Restore — super_admin only; engine not built yet. */
    public function restore()
    {
        return response()->json([
            'ok'      => false,
            'message' => 'The restore engine is still being built.',
        ], 501);
    }

    /** Strip secret fields from the destination config for display. */
    private function safeDestination(BackupSetting $s): array
    {
        $cfg = $s->destination_config ?? [];
        foreach (['password', 'secret', 'secret_key', 'key', 'access_key'] as $secret) {
            if (array_key_exists($secret, $cfg)) {
                $cfg[$secret] = $cfg[$secret] !== '' ? '********' : '';
            }
        }

        return $cfg;
    }
}
