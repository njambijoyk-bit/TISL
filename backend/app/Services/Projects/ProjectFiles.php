<?php

namespace App\Services\Projects;

use App\Models\User;
use App\Models\VaultAccessLog;
use App\Models\VaultDocument;
use App\Models\VaultDocumentVersion;
use App\Models\VaultFolder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * The files of a piece of work (docs/PROJECTS_STAGE9_SPEC.md, build 9.1; owner's choice 1). A file's bytes, versions and audit live in the Core
 * vault, under a "Projects" folder with one folder per piece of work (made with its first file). Projects keeps only what a file is to the work:
 * its folder on the work, whether it is shared with the client, its expiry, and whether it was removed. Who may see the files is Projects' own
 * decision (`projects.files.view` and the right to open the work; changing them needs `projects.files.manage` and a project role that keeps files;
 * sharing needs `projects.files.share`). The vault's own policies still decide who opens them from the vault.
 */
class ProjectFiles
{
    public const MAX_KB = 51200;   // 50 MB a file

    public function __construct(private ProjectAccess $access) {}

    /** @return array<string, mixed> */
    public function page(object $project, User $user, bool $removed = false): array
    {
        $this->needReady();
        $this->access->authorize($user, 'files_view', $project);
        $folders = DB::table('project_folders')->where('project_id', $project->id)->whereNull('deleted_at')->orderBy('name')->get(['id', 'parent_id', 'name']);
        $files = DB::table('project_files as f')->join('vault_documents as d', 'd.id', '=', 'f.vault_document_id')->leftJoin('users as u', 'u.id', '=', 'f.uploaded_by')
            ->where('f.project_id', $project->id)->when($removed, fn ($q) => $q->whereNotNull('f.deleted_at'), fn ($q) => $q->whereNull('f.deleted_at'))->orderBy('f.name')
            ->get(['f.*', 'd.mime_type', 'd.extension', 'd.file_size', 'd.version_count', 'u.name as uploaded_by_name']);

        return [
            'ready' => true,
            'folders' => $folders->map(fn ($f) => ['id' => (int) $f->id, 'parent_id' => $f->parent_id ? (int) $f->parent_id : null, 'name' => $f->name])->all(),
            'files' => $files->map(fn ($f) => $this->shape($f))->all(),
            'can' => ['manage' => $this->access->decide($user, 'files', $project)['allowed'], 'share' => $this->access->decide($user, 'files_share', $project)['allowed'],
                'sign' => $this->access->decide($user, 'files_sign', $project)['allowed']],
            'max_kb' => self::MAX_KB,
        ];
    }

    public function addFolder(object $project, string $name, ?int $parentId, User $by): int
    {
        $this->may($project, $by);
        $name = $this->cleanName($name, 'Give the folder a name.');
        $parent = $parentId ? $this->folder($project, $parentId) : null;
        if (DB::table('project_folders')->where('project_id', $project->id)->where('parent_id', $parent?->id)->where('name', $name)->whereNull('deleted_at')->exists()) {
            throw new ProjectException('There is already a folder with that name here.');
        }
        $id = DB::table('project_folders')->insertGetId(['project_id' => $project->id, 'parent_id' => $parent?->id, 'name' => $name, 'created_by' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'folder.added', 'folder', $id, null, ['name' => $name]);

        return $id;
    }

    public function renameFolder(object $project, int $folderId, string $name, User $by): void
    {
        $this->may($project, $by);
        $f = $this->folder($project, $folderId);
        $name = $this->cleanName($name, 'Give the folder a name.');
        DB::table('project_folders')->where('id', $f->id)->update(['name' => $name, 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'folder.renamed', 'folder', (int) $f->id, ['name' => $f->name], ['name' => $name]);
    }

    /** Only an empty folder goes. */
    public function removeFolder(object $project, int $folderId, User $by): void
    {
        $this->may($project, $by);
        $f = $this->folder($project, $folderId);
        if (DB::table('project_files')->where('folder_id', $f->id)->whereNull('deleted_at')->exists() || DB::table('project_folders')->where('parent_id', $f->id)->whereNull('deleted_at')->exists()) {
            throw new ProjectException('Move or remove what is in the folder first.');
        }
        DB::table('project_folders')->where('id', $f->id)->update(['deleted_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'folder.removed', 'folder', (int) $f->id, ['name' => $f->name], null);
    }

    /** Add a file to the work. @return int the project file */
    public function upload(object $project, UploadedFile $file, ?int $folderId, User $by, string $source = 'upload', ?string $name = null): int
    {
        $this->may($project, $by);
        $folder = $folderId ? $this->folder($project, $folderId) : null;

        return $this->store($project, $file->getRealPath(), $name ?? $file->getClientOriginalName(), (string) ($file->getMimeType() ?: 'application/octet-stream'), $folder?->id, $by, $source);
    }

    /** A file that arrives answering a request (the caller has checked the request is open and theirs). @return int */
    public function receive(object $project, UploadedFile $file, ?int $folderId, ?int $byUserId, string $source): int
    {
        $this->needReady();
        if ($file->getSize() > self::MAX_KB * 1024) {
            throw new ProjectException('A file can be up to 50 MB.');
        }

        return $this->store($project, $file->getRealPath(), $file->getClientOriginalName(), (string) ($file->getMimeType() ?: 'application/octet-stream'), $folderId, $byUserId, $source);
    }

    /** Keep bytes made here (a document from a template) as a file on the work. @return int */
    public function storeContent(object $project, string $content, string $name, string $mime, ?int $folderId, User $by, string $source): int
    {
        $tmp = tempnam(sys_get_temp_dir(), 'pf');
        file_put_contents($tmp, $content);
        try {
            return $this->store($project, $tmp, $name, $mime, $folderId, $by, $source);
        } finally {
            @unlink($tmp);
        }
    }

    /** A new version of a file; the old ones are kept in the vault. */
    public function newVersion(object $project, int $fileId, UploadedFile $file, ?string $note, User $by): void
    {
        $this->may($project, $by);
        $f = $this->file($project, $fileId);
        $this->addVersion($project, $f, $file->getRealPath(), (string) ($file->getMimeType() ?: 'application/octet-stream'), $file->getClientOriginalName(), $note, $by);
    }

    /** @internal also used by requests that bring back a new version */
    public function addVersion(object $project, object $f, string $path, string $mime, string $original, ?string $note, User|int|null $by): int
    {
        $doc = VaultDocument::findOrFail($f->vault_document_id);
        $stored = $this->putBytes($path, (int) $doc->folder_id, pathinfo($original, PATHINFO_EXTENSION));
        $n = (int) $doc->version_count + 1;
        $byId = $by instanceof User ? $by->id : $by;
        DB::transaction(function () use ($doc, $stored, $path, $n, $note, $byId, $mime, $original) {
            $size = filesize($path) ?: 0;
            VaultDocumentVersion::create(['document_id' => $doc->id, 'file_path' => $stored, 'file_size' => $size, 'version_number' => $n, 'change_note' => $note ? mb_substr($note, 0, 250) : null, 'uploaded_by' => $byId, 'created_at' => now()]);
            $doc->forceFill(['file_path' => $stored, 'file_size' => $size, 'version_count' => $n, 'mime_type' => $mime, 'original_filename' => $original])->save();
        });
        DB::table('project_files')->where('id', $f->id)->update(['updated_at' => now()]);
        $this->vaultLog($byId, 'upload', (int) $doc->id, ['module' => 'projects', 'version' => $n]);
        ProjectLog::record((int) $project->id, $by instanceof User ? $by : null, 'file.version', 'file', (int) $f->id, null, ['name' => $f->name, 'version' => $n]);

        return $n;
    }

    /** @return array<int, array<string, mixed>> */
    public function versions(object $project, int $fileId, User $user): array
    {
        $this->access->authorize($user, 'files_view', $project);
        $f = $this->file($project, $fileId);
        $names = DB::table('users')->pluck('name', 'id');

        return VaultDocumentVersion::where('document_id', $f->vault_document_id)->orderByDesc('version_number')->get()
            ->map(fn ($v) => ['number' => (int) $v->version_number, 'size' => (int) $v->file_size, 'note' => $v->change_note, 'by' => $names[$v->uploaded_by] ?? null, 'at' => (string) $v->created_at])->all();
    }

    /** Stream a file (or one of its versions) to someone who may see it. */
    public function download(object $project, int $fileId, User $user, ?int $version = null, bool $inline = false): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        $this->access->authorize($user, 'files_view', $project);
        $f = $this->file($project, $fileId);

        return $this->stream($f, $version, $inline, $user->id);
    }

    /** @internal the portal and guest links stream through here once they have checked the file is shared */
    public function stream(object $f, ?int $version, bool $inline, ?int $byId): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        $doc = VaultDocument::findOrFail($f->vault_document_id);
        $path = $doc->file_path;
        if ($version) {
            $path = VaultDocumentVersion::where('document_id', $doc->id)->where('version_number', $version)->value('file_path') ?? throw new ProjectException('That version is not there.', 404);
        }
        if (! Storage::disk('local')->exists($path)) {
            throw new ProjectException('The file is missing from the vault.', 404);
        }
        $this->vaultLog($byId, $inline ? 'preview' : 'download', (int) $doc->id, ['module' => 'projects', 'version' => $version]);
        $name = $f->name . (pathinfo($f->name, PATHINFO_EXTENSION) ? '' : ($doc->extension ? ".{$doc->extension}" : ''));

        return Storage::disk('local')->response($path, $name, ['Content-Type' => $doc->mime_type, 'Content-Disposition' => ($inline ? 'inline' : 'attachment') . '; filename="' . addslashes($name) . '"', 'Cache-Control' => 'private, no-store']);
    }

    /** @param array<string, mixed> $d name, folder_id, expires_on */
    public function change(object $project, int $fileId, array $d, User $by): void
    {
        $this->may($project, $by);
        $f = $this->file($project, $fileId);
        $row = ['updated_at' => now()];
        if (array_key_exists('name', $d)) {
            $row['name'] = $this->cleanName((string) $d['name'], 'Give the file a name.', 200);
        }
        if (array_key_exists('folder_id', $d)) {
            $row['folder_id'] = $d['folder_id'] ? (int) $this->folder($project, (int) $d['folder_id'])->id : null;
        }
        if (array_key_exists('expires_on', $d)) {
            $row['expires_on'] = $d['expires_on'] ? (preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $d['expires_on']) ? $d['expires_on'] : throw new ProjectException('Choose the day it runs out.')) : null;
            $row['warned'] = null;
        }
        DB::table('project_files')->where('id', $f->id)->update($row);
        if (isset($row['name']) && $row['name'] !== $f->name) {
            VaultDocument::where('id', $f->vault_document_id)->update(['name' => $row['name']]);
        }
        ProjectLog::record((int) $project->id, $by, 'file.changed', 'file', (int) $f->id, array_intersect_key((array) $f, $row), array_diff_key($row, ['updated_at' => 1, 'warned' => 1]));
    }

    /** Share a file with the client (and guest links), or stop. */
    public function share(object $project, int $fileId, bool $on, User $by): void
    {
        $this->access->authorize($by, 'files_share', $project);
        $f = $this->file($project, $fileId);
        if ((bool) $f->shared === $on) {
            return;
        }
        DB::table('project_files')->where('id', $f->id)->update(['shared' => (int) $on, 'shared_by' => $on ? $by->id : null, 'shared_at' => $on ? now() : null, 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, $on ? 'file.shared' : 'file.unshared', 'file', (int) $f->id, null, ['name' => $f->name]);
    }

    /** To the work's trash; the vault keeps it. */
    public function remove(object $project, int $fileId, User $by): void
    {
        $this->may($project, $by);
        $f = $this->file($project, $fileId);
        DB::table('project_files')->where('id', $f->id)->update(['deleted_at' => now(), 'deleted_by' => $by->id, 'shared' => 0]);
        ProjectLog::record((int) $project->id, $by, 'file.removed', 'file', (int) $f->id, ['name' => $f->name], null);
    }

    public function restore(object $project, int $fileId, User $by): void
    {
        $this->may($project, $by);
        $f = DB::table('project_files')->where('id', $fileId)->where('project_id', $project->id)->whereNotNull('deleted_at')->first() ?? throw new ProjectException('Not found.', 404);
        DB::table('project_files')->where('id', $f->id)->update(['deleted_at' => null, 'deleted_by' => null, 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'file.restored', 'file', (int) $f->id, null, ['name' => $f->name]);
    }

    public function file(object $project, int $fileId): object
    {
        return DB::table('project_files')->where('id', $fileId)->where('project_id', $project->id)->whereNull('deleted_at')->first() ?? throw new ProjectException('Not found.', 404);
    }

    // ------------------------------------------------------------------ inside

    private function store(object $project, string $path, string $name, string $mime, ?int $folderId, User|int|null $by, string $source): int
    {
        $size = filesize($path) ?: 0;
        if ($size > self::MAX_KB * 1024) {
            throw new ProjectException('A file can be up to 50 MB.');
        }
        $vaultFolder = $this->vaultFolderFor($project, $by);
        $stored = $this->putBytes($path, (int) $vaultFolder->id, pathinfo($name, PATHINFO_EXTENSION));
        $byId = $by instanceof User ? $by->id : $by;
        $id = DB::transaction(function () use ($project, $name, $mime, $size, $stored, $vaultFolder, $byId, $folderId, $source) {
            $doc = VaultDocument::create(['folder_id' => $vaultFolder->id, 'name' => mb_substr($name, 0, 200), 'original_filename' => mb_substr($name, 0, 250), 'mime_type' => $mime,
                'extension' => strtolower((string) pathinfo($name, PATHINFO_EXTENSION)), 'file_path' => $stored, 'file_size' => $size, 'document_type' => 'other',
                'sensitivity_level' => $project->confidential ? 'confidential' : 'internal', 'tags' => ['projects', $project->number], 'metadata' => ['project_id' => (int) $project->id],
                'is_cold' => false, 'version_count' => 1, 'uploaded_by' => $byId]);
            VaultDocumentVersion::create(['document_id' => $doc->id, 'file_path' => $stored, 'file_size' => $size, 'version_number' => 1, 'change_note' => 'First version', 'uploaded_by' => $byId, 'created_at' => now()]);

            return DB::table('project_files')->insertGetId(['project_id' => $project->id, 'folder_id' => $folderId, 'vault_document_id' => $doc->id, 'name' => mb_substr($name, 0, 200),
                'source' => $source, 'uploaded_by' => $byId, 'created_at' => now(), 'updated_at' => now()]);
        });
        $this->vaultLog($byId, 'upload', (int) DB::table('project_files')->where('id', $id)->value('vault_document_id'), ['module' => 'projects', 'project' => $project->number]);
        ProjectLog::record((int) $project->id, $by instanceof User ? $by : null, 'file.added', 'file', $id, null, ['name' => $name, 'source' => $source]);

        return $id;
    }

    /** The work's folder in the vault, under "Projects"; made with its first file. */
    private function vaultFolderFor(object $project, User|int|null $by): VaultFolder
    {
        $owner = $by instanceof User ? $by->id : ($by ?: $project->lead_user_id);
        $root = VaultFolder::whereNull('parent_id')->where('slug', 'projects')->first()
            ?? VaultFolder::create(['parent_id' => null, 'name' => 'Projects', 'slug' => 'projects', 'description' => 'The files of each piece of work, kept by Projects.', 'folder_type' => 'manual', 'sensitivity_level' => 'internal', 'inherits_parent_policy' => true, 'owner_user_id' => $owner]);
        $slug = 'project-' . $project->id;

        return VaultFolder::where('parent_id', $root->id)->where('slug', $slug)->first()
            ?? VaultFolder::create(['parent_id' => $root->id, 'name' => mb_substr("{$project->number} {$project->title}", 0, 190), 'slug' => $slug, 'description' => 'Kept by Projects.', 'folder_type' => 'manual',
                'sensitivity_level' => $project->confidential ? 'confidential' : 'internal', 'inherits_parent_policy' => true, 'owner_user_id' => $owner]);
    }

    private function putBytes(string $path, int $vaultFolderId, string $ext): string
    {
        $target = "vault/folders/{$vaultFolderId}/" . Str::uuid() . ($ext !== '' ? '.' . strtolower(preg_replace('/[^a-z0-9]/i', '', $ext)) : '');
        $in = fopen($path, 'rb');
        Storage::disk('local')->put($target, $in);
        is_resource($in) && fclose($in);

        return $target;
    }

    private function vaultLog(?int $userId, string $action, int $docId, array $extra): void
    {
        try {
            VaultAccessLog::create(['user_id' => $userId, 'action' => $action, 'target_type' => 'document', 'target_id' => $docId, 'ip_address' => Request::ip(), 'user_agent' => mb_substr((string) Request::userAgent(), 0, 250),
                'context_snapshot' => $extra + ['timestamp' => now()->toISOString()]]);
        } catch (\Throwable $e) {
            report($e);   // the vault's log is the vault's; a problem there never stops the work
        }
    }

    private function folder(object $project, int $id): object
    {
        return DB::table('project_folders')->where('id', $id)->where('project_id', $project->id)->whereNull('deleted_at')->first() ?? throw new ProjectException('Choose a folder on this work.', 404);
    }

    private function may(object $project, User $by): void
    {
        $this->needReady();
        $this->access->authorize($by, 'files', $project);
    }

    private function cleanName(string $name, string $empty, int $max = 120): string
    {
        $name = trim(preg_replace('/[\\\\\/:*?"<>|\x00-\x1f]+/u', ' ', $name));

        return $name === '' ? throw new ProjectException($empty) : mb_substr($name, 0, $max);
    }

    /** @return array<string, mixed> */
    private function shape(object $f): array
    {
        return ['id' => (int) $f->id, 'folder_id' => $f->folder_id ? (int) $f->folder_id : null, 'name' => $f->name, 'mime' => $f->mime_type, 'extension' => $f->extension, 'size' => (int) $f->file_size,
            'versions' => (int) $f->version_count, 'shared' => (bool) $f->shared, 'expires_on' => $f->expires_on, 'source' => $f->source, 'uploaded_by' => $f->uploaded_by_name, 'updated_at' => $f->updated_at,
            'expired' => $f->expires_on && $f->expires_on < now()->toDateString(), 'expiring' => $f->expires_on && $f->expires_on >= now()->toDateString() && $f->expires_on <= now()->addDays(60)->toDateString()];
    }

    private function needReady(): void
    {
        if (! ProjectsSetup::documents()) {
            throw new ProjectException('Files need database script 266 and the document vault.', 409);
        }
    }
}
