<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\BackupSetting;
use App\Models\Module;
use App\Models\ModuleTableMap;
use App\Services\Backup\BackupExporter;
use App\Services\Backup\BackupPlanner;
use App\Services\Backup\BackupRestorer;
use App\Services\Licensing\LicenseFormat;
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
    public function __construct(
        private BackupPlanner $planner,
        private BackupExporter $exporter,
        private BackupRestorer $restorer,
    ) {}

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

    /** Data for the table-assignment form: unassigned tables, module options, current picks. */
    public function tables()
    {
        $plan = $this->planner->plan();

        $modules = array_merge(
            [['key' => 'core', 'name' => 'Core']],
            Module::orderBy('sort_order')->get(['module_key', 'name'])
                ->map(fn ($m) => ['key' => $m->module_key, 'name' => $m->name])->all()
        );

        $assignments = ModuleTableMap::all(['table_name', 'module_key', 'is_excluded'])
            ->map(fn ($r) => [
                'table'    => $r->table_name,
                'target'   => $r->is_excluded ? '__exclude__' : $r->module_key,
            ]);

        return response()->json([
            'unassigned'  => $plan['unassigned'],
            'modules'     => $modules,
            'assignments' => $assignments,
        ]);
    }

    /** Save table → module assignments (or exclude / unassign). */
    public function assignTables(Request $request)
    {
        $allowed = array_merge(['core'], array_values(LicenseFormat::MODULES), ['__exclude__', '__unassign__']);
        $data = $request->validate([
            'assignments'             => 'required|array|min:1',
            'assignments.*.table'     => 'required|string|max:100',
            'assignments.*.target'    => ['required', 'string', Rule::in($allowed)],
        ]);

        $live = $this->planner->liveTables();
        $saved = 0;

        foreach ($data['assignments'] as $a) {
            if (!in_array($a['table'], $live, true)) {
                continue; // ignore anything that isn't a real table
            }
            $target = $a['target'];
            if ($target === '__unassign__') {
                ModuleTableMap::where('table_name', $a['table'])->delete();
            } elseif ($target === '__exclude__') {
                ModuleTableMap::updateOrCreate(
                    ['table_name' => $a['table']],
                    ['module_key' => null, 'is_excluded' => true]
                );
            } else {
                ModuleTableMap::updateOrCreate(
                    ['table_name' => $a['table']],
                    ['module_key' => $target, 'is_excluded' => false]
                );
            }
            $saved++;
        }

        return response()->json(['ok' => true, 'saved' => $saved, 'message' => "Saved $saved assignment(s)."]);
    }

    /** Run a backup now (synchronous). */
    public function run(Request $request)
    {
        @set_time_limit(0);
        $result = $this->exporter->run('manual', $request->user()?->id);

        return response()->json($result, $result['ok'] ? 200 : 422);
    }

    /** Build a backup and stream it to the admin's computer (Local destination). */
    public function download(Request $request)
    {
        @set_time_limit(0);
        $res = $this->exporter->prepareDownload($request->user()?->id);
        if (!($res['ok'] ?? false)) {
            return response()->json($res, 422);
        }

        return response()
            ->download($res['path'], $res['filename'], ['Content-Type' => 'application/octet-stream'])
            ->deleteFileAfterSend(true);
    }

    /** Recent backup runs (history + chain). */
    public function runs()
    {
        $rows = \App\Models\BackupRun::latest('id')->limit(50)->get([
            'id', 'status', 'trigger', 'destination_driver', 'filename',
            'size_bytes', 'table_count', 'row_count', 'previous_run_id',
            'started_at', 'finished_at', 'error',
        ]);

        return response()->json(['runs' => $rows]);
    }

    /** Backups available at the remote destination (for the pull picker). */
    public function restoreFiles()
    {
        return response()->json(['files' => $this->restorer->destinationFiles()]);
    }

    /** Restore from an uploaded .wnkjba file. Passphrase required. */
    public function restoreUpload(Request $request)
    {
        @set_time_limit(0);
        $data = $request->validate([
            'file'       => 'required|file|max:1048576', // up to ~1 GB
            'passphrase' => 'required|string',
            'mode'       => ['required', Rule::in(['replace', 'merge'])],
        ]);

        try {
            $result = $this->restorer->restoreFromFile(
                $request->file('file')->getRealPath(),
                $data['passphrase'],
                $data['mode']
            );
            return response()->json($result);
        } catch (\Throwable $e) {
            return response()->json(['ok' => false, 'message' => $e->getMessage()], 422);
        }
    }

    /** Restore by pulling a named backup from the remote destination. Passphrase required. */
    public function restorePull(Request $request)
    {
        @set_time_limit(0);
        $data = $request->validate([
            'filename'   => 'required|string|max:255',
            'passphrase' => 'required|string',
            'mode'       => ['required', Rule::in(['replace', 'merge'])],
        ]);

        try {
            $result = $this->restorer->restoreFromDestination($data['filename'], $data['passphrase'], $data['mode']);
            return response()->json($result);
        } catch (\Throwable $e) {
            return response()->json(['ok' => false, 'message' => $e->getMessage()], 422);
        }
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
