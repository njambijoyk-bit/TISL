<?php

namespace App\Http\Controllers;

use App\Models\VaultFolder;
use App\Models\VaultDocument;
use App\Models\VaultPolicy;
use App\Models\VaultArchiverConfig;
use App\Models\VaultArchiveRun;
use App\Models\VaultAccessLog;
use App\Models\VaultSetting;
use App\Services\Vault\VaultService;
use App\Services\Vault\VaultPolicyService;
use App\Services\Vault\VaultArchiverService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;

class VaultController extends Controller
{
    public function __construct(
        protected VaultService        $vault,
        protected VaultPolicyService  $policy,
        protected VaultArchiverService $archiver,
    ) {}

    // =========================================================================
    // FOLDERS
    // =========================================================================

    public function folderTree(Request $request): JsonResponse
    {
        $parentId = $request->query('parent_id');

        $tree = $this->vault->getFolderTree($request->user(), $parentId ? (int) $parentId : null);

        return response()->json(['data' => $tree]);
    }

    public function showFolder(Request $request, VaultFolder $folder): JsonResponse
    {
        $data = $this->vault->getFolder($request->user(), $folder);

        return response()->json(['data' => $data]);
    }

    public function folderContents(Request $request): JsonResponse
    {
        $folderId = $request->query('folder_id');
        $folder = $folderId ? VaultFolder::findOrFail($folderId) : null;
        
        $contents = $this->vault->getFolderContents($request->user(), $folder);
        
        return response()->json(['data' => $contents]);
    }

    public function createFolder(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'                   => 'required|string|max:255',
            'description'            => 'nullable|string',
            'parent_id'              => 'nullable|integer|exists:vault_folders,id',
            'folder_type'            => 'nullable|in:manual,system_logs,system_exports,cold_storage',
            'sensitivity_level'      => 'nullable|in:public,internal,confidential,restricted,top_secret',
            'inherits_parent_policy' => 'nullable|boolean',
        ]);

        $parent = isset($validated['parent_id'])
            ? VaultFolder::findOrFail($validated['parent_id'])
            : null;

        $folder = $this->vault->createFolder($request->user(), $validated, $parent);

        return response()->json(['data' => $folder], 201);
    }

    public function updateFolder(Request $request, VaultFolder $folder): JsonResponse
    {
        $validated = $request->validate([
            'name'                   => 'sometimes|string|max:255',
            'description'            => 'nullable|string',
            'sensitivity_level'      => 'nullable|in:public,internal,confidential,restricted,top_secret',
            'inherits_parent_policy' => 'nullable|boolean',
        ]);

        $folder = $this->vault->updateFolder($request->user(), $folder, $validated);

        return response()->json(['data' => $folder]);
    }

    public function deleteFolder(Request $request, VaultFolder $folder): JsonResponse
    {
        $this->vault->deleteFolder($request->user(), $folder);

        return response()->json(['message' => 'Folder deleted.']);
    }

    public function moveFolder(Request $request, VaultFolder $folder): JsonResponse
    {
        $validated = $request->validate([
            'destination_id' => 'nullable|integer|exists:vault_folders,id',
        ]);

        $destination = isset($validated['destination_id'])
            ? VaultFolder::findOrFail($validated['destination_id'])
            : null;

        $folder = $this->vault->moveFolder($request->user(), $folder, $destination);

        return response()->json(['data' => $folder]);
    }

    public function archiveFolder(Request $request, VaultFolder $folder): JsonResponse
    {
        $validated = $request->validate([
            'lock'                  => 'nullable|boolean',
            'destination_folder_id' => 'nullable|integer|exists:vault_folders,id',
            'notes'                 => 'nullable|string',
        ]);

        $archived = $this->vault->archiveFolder($request->user(), $folder, $validated);

        return response()->json(['data' => $archived], 201);
    }

    public function unlockFolder(Request $request, VaultFolder $folder): JsonResponse
    {
        $request->validate(['password' => 'required|string']);

        $success = $this->policy->unlock(
            $request->user(), 'folder', $folder->id, $request->password
        );

        if (!$success) {
            return response()->json(['message' => 'Incorrect password.'], 422);
        }

        return response()->json(['message' => 'Folder unlocked.']);
    }

    public function setFolderPassword(Request $request, VaultFolder $folder): JsonResponse
    {
        $request->validate(['password' => 'required|string|min:4']);

        $this->policy->setPassword($request->user(), 'folder', $folder->id, $request->password);

        return response()->json(['message' => 'Password set.']);
    }

    public function removeFolderPassword(Request $request, VaultFolder $folder): JsonResponse
    {
        $this->policy->removePassword($request->user(), 'folder', $folder->id);

        return response()->json(['message' => 'Password removed.']);
    }

    // =========================================================================
    // DOCUMENTS
    // =========================================================================

    public function showDocument(Request $request, VaultDocument $document): JsonResponse
    {
        $data = $this->vault->getDocument($request->user(), $document);

        return response()->json(['data' => $data]);
    }

    public function uploadDocument(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'file'              => 'required|file|max:102400', // 100MB
            'folder_id'         => 'nullable|integer|exists:vault_folders,id',
            'name'              => 'nullable|string|max:255',
            'document_type'     => 'nullable|string',
            'sensitivity_level' => 'nullable|in:public,internal,confidential,restricted,top_secret',
            'tags'              => 'nullable|array',
            'metadata'          => 'nullable|array',
        ]);

        $folder = isset($validated['folder_id'])
            ? VaultFolder::findOrFail($validated['folder_id'])
            : null;

        $document = $this->vault->uploadDocument(
            $request->user(),
            $request->file('file'),
            $validated,
            $folder,
        );

        return response()->json(['data' => $document], 201);
    }

    public function updateDocument(Request $request, VaultDocument $document): JsonResponse
    {
        $validated = $request->validate([
            'name'              => 'sometimes|string|max:255',
            'document_type'     => 'nullable|string',
            'sensitivity_level' => 'nullable|in:public,internal,confidential,restricted,top_secret',
            'tags'              => 'nullable|array',
            'metadata'          => 'nullable|array',
        ]);

        $document = $this->vault->updateDocument($request->user(), $document, $validated);

        return response()->json(['data' => $document]);
    }

    public function deleteDocument(Request $request, VaultDocument $document): JsonResponse
    {
        $this->vault->deleteDocument($request->user(), $document);

        return response()->json(['message' => 'Document deleted.']);
    }

    public function uploadVersion(Request $request, VaultDocument $document): JsonResponse
    {
        $request->validate([
            'file'        => 'required|file|max:102400',
            'change_note' => 'nullable|string|max:500',
        ]);

        $document = $this->vault->uploadVersion(
            $request->user(),
            $document,
            $request->file('file'),
            $request->change_note,
        );

        return response()->json(['data' => $document]);
    }

    public function moveDocument(Request $request, VaultDocument $document): JsonResponse
    {
        $request->validate([
            'destination_folder_id' => 'nullable|integer|exists:vault_folders,id',
        ]);

        $destination = $request->destination_folder_id
            ? VaultFolder::findOrFail($request->destination_folder_id)
            : null;

        $document = $this->vault->moveDocument($request->user(), $document, $destination);

        return response()->json(['data' => $document]);
    }

    public function copyDocument(Request $request, VaultDocument $document): JsonResponse
    {
        $request->validate([
            'destination_folder_id' => 'nullable|integer|exists:vault_folders,id',
        ]);

        $destination = $request->destination_folder_id
            ? VaultFolder::findOrFail($request->destination_folder_id)
            : null;

        $document = $this->vault->copyDocument($request->user(), $document, $destination);

        return response()->json(['data' => $document], 201);
    }

    public function archiveDocument(Request $request, VaultDocument $document): JsonResponse
    {
        $validated = $request->validate([
            'compress'              => 'nullable|boolean',
            'lock'                  => 'nullable|boolean',
            'destination_folder_id' => 'nullable|integer|exists:vault_folders,id',
            'notes'                 => 'nullable|string',
        ]);

        $archived = $this->vault->archiveDocument($request->user(), $document, $validated);

        return response()->json(['data' => $archived], 201);
    }

    public function unlockDocument(Request $request, VaultDocument $document): JsonResponse
    {
        $request->validate(['password' => 'required|string']);

        $success = $this->policy->unlock(
            $request->user(), 'document', $document->id, $request->password
        );

        if (!$success) {
            return response()->json(['message' => 'Incorrect password.'], 422);
        }

        return response()->json(['message' => 'Document unlocked.']);
    }

    public function setDocumentPassword(Request $request, VaultDocument $document): JsonResponse
    {
        $request->validate(['password' => 'required|string|min:4']);

        $this->policy->setPassword($request->user(), 'document', $document->id, $request->password);

        return response()->json(['message' => 'Password set.']);
    }

    public function removeDocumentPassword(Request $request, VaultDocument $document): JsonResponse
    {
        $this->policy->removePassword($request->user(), 'document', $document->id);

        return response()->json(['message' => 'Password removed.']);
    }

    public function previewDocument(Request $request, VaultDocument $document): JsonResponse
    {
        $data = $this->vault->previewDocument($request->user(), $document);

        return response()->json(['data' => $data]);
    }

    public function streamDocument(Request $request, VaultDocument $document)
    {
        // Auth is validated by the preview call that generated this URL.
        // We just need the user to be authenticated (Sanctum cookie covers this
        // for same-origin; for cross-origin dev we skip the policy re-check).
        return $this->vault->streamDocumentDirect($document);
    }

    public function downloadDocument(Request $request, VaultDocument $document)
    {
        $data = $this->vault->downloadDocument($request->user(), $document);

        return response()->download($data['path'], $data['filename'], [
            'Content-Type' => $data['mime'],
        ]);
    }

    public function restoreDocument(Request $request, VaultDocument $document): JsonResponse
    {
        $document = $this->vault->restoreDocument($request->user(), $document);

        return response()->json(['data' => $document]);
    }

    public function restoreFolder(Request $request, VaultFolder $folder): JsonResponse
    {
        $folder = $this->vault->restoreFolder($request->user(), $folder);

        return response()->json(['data' => $folder]);
    }

    // =========================================================================
    // ARCHIVER CONFIGS
    // =========================================================================

    public function listArchiverConfigs(): JsonResponse
    {
        $configs = VaultArchiverConfig::with(['destinationFolder', 'lastRun'])
            ->orderBy('archiver_type')
            ->orderBy('label')
            ->get();

        return response()->json(['data' => $configs]);
    }

    public function createArchiverConfig(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'archiver_type'            => 'required|in:log_table,document_generator,manual',
            'table_name'               => 'nullable|string|max:100',
            'label'                    => 'required|string|max:255',
            'description'              => 'nullable|string',
            'retention_days'           => 'nullable|integer|min:1',
            'export_format'            => 'required|in:csv,json,excel',
            'destination_folder_id'    => 'nullable|integer|exists:vault_folders,id',
            'is_enabled'               => 'nullable|boolean',
            'auto_archive_on_generate' => 'nullable|boolean',
            'generator_class'          => 'nullable|string|max:255',
        ]);

        $config = VaultArchiverConfig::create($validated);

        return response()->json(['data' => $config], 201);
    }

    public function updateArchiverConfig(Request $request, VaultArchiverConfig $config): JsonResponse
    {
        $validated = $request->validate([
            'label'                    => 'sometimes|string|max:255',
            'description'              => 'nullable|string',
            'retention_days'           => 'nullable|integer|min:1',
            'export_format'            => 'nullable|in:csv,json,excel',
            'destination_folder_id'    => 'nullable|integer|exists:vault_folders,id',
            'is_enabled'               => 'nullable|boolean',
            'auto_archive_on_generate' => 'nullable|boolean',
            'generator_class'          => 'nullable|string|max:255',
        ]);

        $config->update($validated);

        return response()->json(['data' => $config->fresh('destinationFolder')]);
    }

    public function runArchiverConfig(Request $request, VaultArchiverConfig $config): JsonResponse
    {
        $run = $this->archiver->run($config, $request->user());

        return response()->json(['data' => $run], 201);
    }

    public function runMultipleArchiverConfigs(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'config_ids'   => 'required|array|min:1',
            'config_ids.*' => 'integer|exists:vault_archiver_configs,id',
            'purge'        => 'nullable|boolean',   // true = archive + delete rows  |  false = archive only
        ]);
 
        $purge   = $validated['purge'] ?? true;
        $results = $this->archiver->runMultiple(
            $validated['config_ids'],
            $request->user(),
            $purge,
        );
 
        $failed    = count(array_filter($results, fn($r) => $r['status'] === 'failed'));
        $completed = count(array_filter($results, fn($r) => $r['status'] === 'completed'));
 
        return response()->json([
            'data'      => $results,
            'summary'   => [
                'completed' => $completed,
                'failed'    => $failed,
                'purge'     => $purge,
            ],
        ], $failed > 0 ? 207 : 200); // 207 Multi-Status if any failed
    }

    // =========================================================================
    // ARCHIVER RUNS
    // =========================================================================

    public function listArchiveRuns(Request $request): JsonResponse
    {
        $runs = VaultArchiveRun::with(['config', 'document', 'triggeredBy'])
            ->when($request->config_id, fn($q) => $q->where('config_id', $request->config_id))
            ->when($request->status,    fn($q) => $q->where('status', $request->status))
            ->orderByDesc('created_at')
            ->paginate(30);

        return response()->json($runs);
    }

    public function showArchiveRun(VaultArchiveRun $run): JsonResponse
    {
        return response()->json([
            'data' => $run->load(['config', 'document', 'triggeredBy']),
        ]);
    }

    // =========================================================================
    // POLICIES
    // =========================================================================

    public function listPolicies(Request $request): JsonResponse
    {
        $policies = VaultPolicy::with(['conditions', 'assignments', 'creator'])
            ->when($request->target_type, fn($q) => $q->where('target_type', $request->target_type))
            ->when($request->target_id,   fn($q) => $q->where('target_id',   $request->target_id))
            ->orderByDesc('priority')
            ->get();

        return response()->json(['data' => $policies]);
    }

    public function createPolicy(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'                         => 'required|string|max:255',
            'description'                  => 'nullable|string',
            'target_type'                  => 'required|in:vault,folder,document',
            'target_id'                    => 'nullable|integer',
            'effect'                       => 'required|in:allow,deny',
            'priority'                     => 'nullable|integer',
            'is_active'                    => 'nullable|boolean',
            'conditions'                   => 'nullable|array',
            'conditions.*.attribute_source'=> 'required|in:user,resource,context',
            'conditions.*.attribute_key'   => 'required|string',
            'conditions.*.operator'        => 'required|in:equals,not_equals,in,not_in,contains,between,matches_cidr',
            'conditions.*.attribute_value' => 'required|array',
            'assignments'                  => 'nullable|array',
            'assignments.*.assignee_type'  => 'required|in:user,role,all,all_except',
            'assignments.*.assignee_value' => 'nullable|string',
        ]);

        $policy = $this->policy->createPolicy($request->user(), $validated);

        return response()->json(['data' => $policy], 201);
    }

    public function updatePolicy(Request $request, VaultPolicy $vaultPolicy): JsonResponse
    {
        $validated = $request->validate([
            'name'                         => 'sometimes|string|max:255',
            'description'                  => 'nullable|string',
            'target_type'                  => 'sometimes|in:vault,folder,document',
            'target_id'                    => 'nullable|integer',
            'effect'                       => 'sometimes|in:allow,deny',
            'priority'                     => 'nullable|integer',
            'is_active'                    => 'nullable|boolean',
            'conditions'                   => 'nullable|array',
            'conditions.*.attribute_source'=> 'required|in:user,resource,context',
            'conditions.*.attribute_key'   => 'required|string',
            'conditions.*.operator'        => 'required|in:equals,not_equals,in,not_in,contains,between,matches_cidr',
            'conditions.*.attribute_value' => 'required|array',
            'assignments'                  => 'nullable|array',
            'assignments.*.assignee_type'  => 'required|in:user,role,all,all_except',
            'assignments.*.assignee_value' => 'nullable|string',
        ]);

        $vaultPolicy = $this->policy->updatePolicy($request->user(), $vaultPolicy, $validated);

        return response()->json(['data' => $vaultPolicy]);
    }

    public function deletePolicy(Request $request, VaultPolicy $vaultPolicy): JsonResponse
    {
        $this->policy->deletePolicy($request->user(), $vaultPolicy);

        return response()->json(['message' => 'Policy deleted.']);
    }

    // =========================================================================
    // SETTINGS
    // =========================================================================

    public function getSettings(): JsonResponse
    {
        return response()->json(['data' => VaultSetting::current()]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'allowed_ip_ranges'           => 'nullable|array',
            'allowed_ip_ranges.*'         => 'string',
            'allowed_time_start'          => 'nullable|date_format:H:i',
            'allowed_time_end'            => 'nullable|date_format:H:i',
            'allowed_days'                => 'nullable|array',
            'allowed_days.*'              => 'in:monday,tuesday,wednesday,thursday,friday,saturday,sunday',
            'max_failed_unlock_attempts'  => 'nullable|integer|min:1|max:20',
            'unlock_session_ttl_minutes'  => 'nullable|integer|min:5|max:1440',
            'require_2fa_for_sensitive'   => 'nullable|boolean',
            'sensitive_threshold'         => 'nullable|in:confidential,restricted,top_secret',
            'watermark_downloads'         => 'nullable|boolean',
            'log_preview_actions'         => 'nullable|boolean',
            'enforce_ip_globally'         => 'nullable|boolean',
        ]);

        $settings = VaultSetting::current();
        $settings->update(array_merge($validated, ['updated_by' => $request->user()->id]));

        $this->policy->log($request->user(), 'settings_changed', 'settings', 1, $validated);

        return response()->json(['data' => $settings->fresh()]);
    }

    // =========================================================================
    // ACCESS LOGS
    // =========================================================================

    public function accessLogs(Request $request): JsonResponse
    {
        $logs = VaultAccessLog::with('user')
            ->when($request->user_id,     fn($q) => $q->where('user_id',     $request->user_id))
            ->when($request->action,      fn($q) => $q->where('action',      $request->action))
            ->when($request->target_type, fn($q) => $q->where('target_type', $request->target_type))
            ->when($request->target_id,   fn($q) => $q->where('target_id',   $request->target_id))
            ->when($request->date_from,   fn($q) => $q->whereDate('created_at', '>=', $request->date_from))
            ->when($request->date_to,     fn($q) => $q->whereDate('created_at', '<=', $request->date_to))
            ->orderByDesc('created_at')
            ->paginate(50);

        return response()->json($logs);
    }
}