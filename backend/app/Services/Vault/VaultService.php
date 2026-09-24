<?php

namespace App\Services\Vault;

use App\Models\User;
use App\Models\VaultFolder;
use App\Models\VaultDocument;
use App\Models\VaultDocumentVersion;
use App\Models\VaultArchivedItem;
use App\Models\VaultAccessLog;
use App\Services\Vault\VaultPolicyService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\DB;

class VaultService
{
    public function __construct(protected VaultPolicyService $policy) {}

    // =========================================================================
    // FOLDERS — CRUD
    // =========================================================================

    public function createFolder(User $user, array $data, ?VaultFolder $parent = null): VaultFolder
    {
        // Permission check — need upload/manage rights on parent or root
        if ($parent) {
            if (!$this->policy->can($user, 'upload', 'folder', $parent)) {
                abort(403, 'You do not have permission to create folders here.');
            }
            if (!$this->policy->isFolderAccessible($user, $parent)) {
                abort(403, 'Parent folder is locked.');
            }
        }

        $folder = VaultFolder::create([
            'parent_id'              => $parent?->id,
            'name'                   => $data['name'],
            'slug'                   => $this->uniqueSlug($data['name'], $parent?->id),
            'description'            => $data['description']           ?? null,
            'folder_type'            => $data['folder_type']           ?? 'manual',
            'sensitivity_level'      => $data['sensitivity_level']     ?? 'internal',
            'inherits_parent_policy' => $data['inherits_parent_policy'] ?? true,
            'owner_user_id'          => $user->id,
        ]);

        $this->policy->log($user, 'view_folder', 'folder', $folder->id, [
            'action' => 'created',
            'name'   => $folder->name,
        ]);

        return $folder;
    }

    public function updateFolder(User $user, VaultFolder $folder, array $data): VaultFolder
    {
        if (!$this->policy->can($user, 'upload', 'folder', $folder)) {
            abort(403, 'You do not have permission to edit this folder.');
        }

        $folder->update([
            'name'                   => $data['name']                   ?? $folder->name,
            'description'            => $data['description']            ?? $folder->description,
            'sensitivity_level'      => $data['sensitivity_level']      ?? $folder->sensitivity_level,
            'inherits_parent_policy' => $data['inherits_parent_policy'] ?? $folder->inherits_parent_policy,
        ]);

        if ($folder->wasChanged('name')) {
            $folder->slug = $this->uniqueSlug($folder->name, $folder->parent_id, $folder->id);
            $folder->save();
        }

        $this->policy->log($user, 'view_folder', 'folder', $folder->id, ['action' => 'updated']);

        return $folder->fresh();
    }

    public function deleteFolder(User $user, VaultFolder $folder): void
    {
        if (!$this->policy->can($user, 'delete', 'folder', $folder)) {
            abort(403, 'You do not have permission to delete this folder.');
        }

        // Recursively delete children + documents
        $this->deleteFolderRecursive($user, $folder);

        $this->policy->log($user, 'delete', 'folder', $folder->id, ['name' => $folder->name]);

        $folder->delete();
    }

    private function deleteFolderRecursive(User $user, VaultFolder $folder): void
    {
        foreach ($folder->children as $child) {
            $this->deleteFolderRecursive($user, $child);
            $child->delete();
        }

        foreach ($folder->documents as $document) {
            $this->deleteDocumentFiles($document);
            $document->delete();
        }
    }

    public function getFolder(User $user, VaultFolder $folder): VaultFolder
    {
        if (!$this->policy->can($user, 'view_folder', 'folder', $folder)) {
            abort(403, 'You do not have permission to view this folder.');
        }

        if (!$this->policy->isFolderAccessible($user, $folder)) {
            abort(423, 'This folder is locked. Please unlock it first.');
        }

        $this->policy->log($user, 'view_folder', 'folder', $folder->id);

        return $folder->load(['children', 'documents.uploader', 'owner']);
    }

    /**
     * Get full folder tree from root or from a given parent.
     */
    public function getFolderTree(User $user, ?int $parentId = null): \Illuminate\Support\Collection
    {
        $folders = VaultFolder::where('parent_id', $parentId)
            ->whereNull('deleted_at')
            ->with(['children', 'owner'])
            ->withCount('documents')
            ->get();

        return $folders->filter(function ($folder) use ($user) {
            return $this->policy->can($user, 'view_folder', 'folder', $folder);
        })->values();
    }

    public function getFolderContents(User $user, ?VaultFolder $folder = null): array
    {
        $folderId = $folder?->id;
        
        $folders = VaultFolder::where('parent_id', $folderId)
            ->whereNull('deleted_at')
            ->with('owner')
            ->get();
            
        $documents = VaultDocument::where('folder_id', $folderId)
            ->whereNull('deleted_at')
            ->with('uploader')
            ->get();
            
        return [
            'folders' => $folders,
            'documents' => $documents,
        ];
    }

    // =========================================================================
    // FOLDERS — MOVE
    // =========================================================================

    public function moveFolder(User $user, VaultFolder $folder, ?VaultFolder $destination): VaultFolder
    {
        if (!$this->policy->can($user, 'move', 'folder', $folder)) {
            abort(403, 'You do not have permission to move this folder.');
        }

        // Prevent moving into own descendant
        if ($destination && $this->isDescendantOf($destination, $folder)) {
            abort(422, 'Cannot move a folder into its own descendant.');
        }

        $folder->update([
            'parent_id' => $destination?->id,
            'slug'      => $this->uniqueSlug($folder->name, $destination?->id, $folder->id),
        ]);

        $this->policy->log($user, 'move', 'folder', $folder->id, [
            'destination_id' => $destination?->id,
        ]);

        return $folder->fresh();
    }

    private function isDescendantOf(VaultFolder $target, VaultFolder $potentialAncestor): bool
    {
        $folder = $target->parent;
        while ($folder) {
            if ($folder->id === $potentialAncestor->id) return true;
            $folder = $folder->parent;
        }
        return false;
    }

    // =========================================================================
    // DOCUMENTS — UPLOAD
    // =========================================================================

    public function uploadDocument(
        User $user,
        UploadedFile $file,
        array $data,
        ?VaultFolder $folder = null
    ): VaultDocument {

        if ($folder) {
            if (!$this->policy->can($user, 'upload', 'folder', $folder)) {
                abort(403, 'You do not have permission to upload here.');
            }
            if (!$this->policy->isFolderAccessible($user, $folder)) {
                abort(423, 'Target folder is locked.');
            }
        }

        $path = $this->storeFile($file, $folder);

        DB::beginTransaction();
        try {
            $document = VaultDocument::create([
                'folder_id'         => $folder?->id,
                'name'              => $data['name']             ?? $file->getClientOriginalName(),
                'original_filename' => $file->getClientOriginalName(),
                'mime_type'         => $file->getMimeType(),
                'extension'         => strtolower($file->getClientOriginalExtension()),
                'file_path'         => $path,
                'file_size'         => $file->getSize(),
                'document_type'     => $data['document_type']    ?? 'other',
                'sensitivity_level' => $data['sensitivity_level'] ?? 'internal',
                'tags'              => $data['tags']              ?? null,
                'metadata'          => $data['metadata']          ?? null,
                'is_cold'           => false,
                'version_count'     => 1,
                'uploaded_by'       => $user->id,
            ]);

            VaultDocumentVersion::create([
                'document_id'    => $document->id,
                'file_path'      => $path,
                'file_size'      => $file->getSize(),
                'version_number' => 1,
                'change_note'    => 'Initial upload',
                'uploaded_by'    => $user->id,
                'created_at'     => now(),
            ]);

            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            Storage::delete($path);
            throw $e;
        }

        $this->policy->log($user, 'upload', 'document', $document->id, [
            'filename' => $document->original_filename,
            'size'     => $document->file_size,
        ]);

        return $document->load(['uploader', 'latestVersion']);
    }

    /**
     * Upload a new version of an existing document.
     */
    public function uploadVersion(User $user, VaultDocument $document, UploadedFile $file, ?string $changeNote = null): VaultDocument
    {
        if (!$this->policy->can($user, 'upload', 'document', $document)) {
            abort(403, 'You do not have permission to update this document.');
        }

        $folder = $document->folder_id ? VaultFolder::find($document->folder_id) : null;
        $path   = $this->storeFile($file, $folder);

        DB::beginTransaction();
        try {
            $newVersion = $document->version_count + 1;

            VaultDocumentVersion::create([
                'document_id'    => $document->id,
                'file_path'      => $path,
                'file_size'      => $file->getSize(),
                'version_number' => $newVersion,
                'change_note'    => $changeNote,
                'uploaded_by'    => $user->id,
                'created_at'     => now(),
            ]);

            // Update document to point to new version
            $document->update([
                'file_path'     => $path,
                'file_size'     => $file->getSize(),
                'mime_type'     => $file->getMimeType(),
                'extension'     => strtolower($file->getClientOriginalExtension()),
                'version_count' => $newVersion,
            ]);

            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            Storage::delete($path);
            throw $e;
        }

        $this->policy->log($user, 'upload', 'document', $document->id, [
            'action'  => 'new_version',
            'version' => $document->version_count,
        ]);

        return $document->fresh(['versions', 'latestVersion']);
    }

    // =========================================================================
    // DOCUMENTS — READ
    // =========================================================================

    public function getDocument(User $user, VaultDocument $document): VaultDocument
    {
        if (!$this->policy->can($user, 'view_document', 'document', $document)) {
            abort(403, 'You do not have permission to view this document.');
        }

        if (!$this->policy->isAccessible($user, 'document', $document)) {
            abort(423, 'This document is locked. Please unlock it first.');
        }

        // Check parent folder lock cascade
        if ($document->folder_id) {
            $folder = VaultFolder::find($document->folder_id);
            if ($folder && !$this->policy->isFolderAccessible($user, $folder)) {
                abort(423, 'Parent folder is locked.');
            }
        }

        $this->policy->log($user, 'view_document', 'document', $document->id);

        return $document->load(['uploader', 'folder', 'versions.uploader', 'archivedItem']);
    }

    public function previewDocument(User $user, VaultDocument $document): array
    {
        if (!$this->policy->can($user, 'preview', 'document', $document)) {
            abort(403, 'You do not have permission to preview this document.');
        }

        if (!$this->policy->isAccessible($user, 'document', $document)) {
            abort(423, 'Document is locked.');
        }

        if (!$document->isPreviewable()) {
            abort(422, 'This file type cannot be previewed.');
        }

        $this->policy->log($user, 'preview', 'document', $document->id);

        return [
            'document'  => $document,
            'file_path' => $document->file_path,
            'extension' => $document->extension,
            'mime_type' => $document->mime_type,
            'url'       => url("/api/admin/vault/documents/{$document->id}/stream"),
        ];
    }

    public function streamDocument(VaultDocument $document): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        if (!Storage::disk('local')->exists($document->file_path)) {
            abort(404, 'File not found.');
        }

        return Storage::disk('local')->response($document->file_path, $document->original_filename, [
            'Content-Type'        => $document->mime_type,
            'Content-Disposition' => 'inline; filename="' . $document->original_filename . '"',
            'Cache-Control'       => 'private, no-store',
        ]);
    }

    public function streamDocumentDirect(VaultDocument $document): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        if (!Storage::disk('local')->exists($document->file_path)) {
            abort(404, 'File not found.');
        }

        return Storage::disk('local')->response($document->file_path, $document->original_filename, [
            'Content-Type'        => $document->mime_type,
            'Content-Disposition' => 'inline; filename="' . $document->original_filename . '"',
            'Cache-Control'       => 'private, no-store',
        ]);
    }

    public function downloadDocument(User $user, VaultDocument $document): array
    {
        if (!$this->policy->can($user, 'download', 'document', $document)) {
            abort(403, 'You do not have permission to download this document.');
        }

        if (!$this->policy->isAccessible($user, 'document', $document)) {
            abort(423, 'Document is locked.');
        }

        $this->policy->log($user, 'download', 'document', $document->id);

        return [
            'path'     => Storage::path($document->file_path),
            'filename' => $document->original_filename,
            'mime'     => $document->mime_type,
        ];
    }

    // =========================================================================
    // DOCUMENTS — UPDATE / DELETE
    // =========================================================================

    public function updateDocument(User $user, VaultDocument $document, array $data): VaultDocument
    {
        if (!$this->policy->can($user, 'upload', 'document', $document)) {
            abort(403, 'You do not have permission to edit this document.');
        }

        $document->update([
            'name'              => $data['name']              ?? $document->name,
            'document_type'     => $data['document_type']     ?? $document->document_type,
            'sensitivity_level' => $data['sensitivity_level'] ?? $document->sensitivity_level,
            'tags'              => $data['tags']              ?? $document->tags,
            'metadata'          => $data['metadata']          ?? $document->metadata,
        ]);

        $this->policy->log($user, 'view_document', 'document', $document->id, ['action' => 'updated']);

        return $document->fresh();
    }

    public function deleteDocument(User $user, VaultDocument $document): void
    {
        if (!$this->policy->can($user, 'delete', 'document', $document)) {
            abort(403, 'You do not have permission to delete this document.');
        }

        $this->policy->log($user, 'delete', 'document', $document->id, [
            'filename' => $document->original_filename,
        ]);

        $this->deleteDocumentFiles($document);
        $document->delete();
    }

    private function deleteDocumentFiles(VaultDocument $document): void
    {
        // Delete all version files
        foreach ($document->versions as $version) {
            if (Storage::exists($version->file_path)) {
                Storage::delete($version->file_path);
            }
        }

        // Delete current file if different
        if (Storage::exists($document->file_path)) {
            Storage::delete($document->file_path);
        }
    }

    // =========================================================================
    // DOCUMENTS — MOVE / COPY
    // =========================================================================

    public function moveDocument(User $user, VaultDocument $document, ?VaultFolder $destination): VaultDocument
    {
        if (!$this->policy->can($user, 'move', 'document', $document)) {
            abort(403, 'You do not have permission to move this document.');
        }

        if ($destination && !$this->policy->can($user, 'upload', 'folder', $destination)) {
            abort(403, 'You do not have permission to move items into this folder.');
        }

        $document->update(['folder_id' => $destination?->id]);

        $this->policy->log($user, 'move', 'document', $document->id, [
            'destination_folder_id' => $destination?->id,
        ]);

        return $document->fresh();
    }

    public function copyDocument(User $user, VaultDocument $document, ?VaultFolder $destination): VaultDocument
    {
        if (!$this->policy->can($user, 'copy', 'document', $document)) {
            abort(403, 'You do not have permission to copy this document.');
        }

        if ($destination && !$this->policy->can($user, 'upload', 'folder', $destination)) {
            abort(403, 'You do not have permission to copy items into this folder.');
        }

        // Copy the physical file
        $newPath = $this->copyFile($document->file_path, $destination);

        DB::beginTransaction();
        try {
            $copy = VaultDocument::create([
                'folder_id'         => $destination?->id,
                'name'              => $document->name . ' (copy)',
                'original_filename' => $document->original_filename,
                'mime_type'         => $document->mime_type,
                'extension'         => $document->extension,
                'file_path'         => $newPath,
                'file_size'         => $document->file_size,
                'document_type'     => $document->document_type,
                'sensitivity_level' => $document->sensitivity_level,
                'tags'              => $document->tags,
                'metadata'          => $document->metadata,
                'is_cold'           => false,
                'version_count'     => 1,
                'uploaded_by'       => $user->id,
            ]);

            VaultDocumentVersion::create([
                'document_id'    => $copy->id,
                'file_path'      => $newPath,
                'file_size'      => $copy->file_size,
                'version_number' => 1,
                'change_note'    => 'Copied from document #' . $document->id,
                'uploaded_by'    => $user->id,
                'created_at'     => now(),
            ]);

            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            Storage::delete($newPath);
            throw $e;
        }

        $this->policy->log($user, 'copy', 'document', $document->id, [
            'new_document_id'       => $copy->id,
            'destination_folder_id' => $destination?->id,
        ]);

        return $copy->load(['uploader', 'latestVersion']);
    }

    // =========================================================================
    // MANUAL ARCHIVE (Flow 3)
    // =========================================================================

    /**
     * Archive a document to cold storage — optionally compress + lock.
     */
    public function archiveDocument(User $user, VaultDocument $document, array $options = []): VaultArchivedItem
    {
        if (!$this->policy->can($user, 'archive_run', 'document', $document)) {
            abort(403, 'You do not have permission to archive this document.');
        }

        $compressedPath = null;

        if ($options['compress'] ?? false) {
            $compressedPath = $this->compressToZip([$document->file_path], $document->name);
        }

        if ($options['lock'] ?? false) {
            $document->update(['is_cold' => true, 'is_locked' => true]);
        } else {
            $document->update(['is_cold' => true]);
        }

        // Move to cold storage folder if specified
        if (!empty($options['destination_folder_id'])) {
            $document->update(['folder_id' => $options['destination_folder_id']]);
        }

        $archived = VaultArchivedItem::create([
            'vault_document_id'    => $document->id,
            'source_type'          => 'manual_archive',
            'source_reference'     => null,
            'source_table'         => null,
            'archived_by_user_id'  => $user->id,
            'archived_at'          => now(),
            'original_location'    => $options['original_location'] ?? null,
            'is_cold'              => $options['lock'] ?? false,
            'compressed_path'      => $compressedPath,
            'notes'                => $options['notes'] ?? null,
        ]);

        $this->policy->log($user, 'archive_run', 'document', $document->id, [
            'compressed' => !is_null($compressedPath),
            'locked'     => $options['lock'] ?? false,
        ]);

        return $archived->load('document');
    }

    /**
     * Archive an entire folder — zip the whole tree, store as single document.
     */
    public function archiveFolder(User $user, VaultFolder $folder, array $options = []): VaultArchivedItem
    {
        if (!$this->policy->can($user, 'archive_run', 'folder', $folder)) {
            abort(403, 'You do not have permission to archive this folder.');
        }

        // Collect all file paths in tree
        $paths = $this->collectFolderFilePaths($folder);

        $zipPath = $this->compressToZip($paths, $folder->name);
        $zipSize = Storage::size($zipPath);

        // Create a vault document for the zip
        $zipDocument = VaultDocument::create([
            'folder_id'         => $options['destination_folder_id'] ?? $folder->parent_id,
            'name'              => $folder->name . ' (archived ' . now()->format('Y-m-d') . ')',
            'original_filename' => Str::slug($folder->name) . '-archive-' . now()->format('Ymd') . '.zip',
            'mime_type'         => 'application/zip',
            'extension'         => 'zip',
            'file_path'         => $zipPath,
            'file_size'         => $zipSize,
            'document_type'     => 'other',
            'sensitivity_level' => $folder->sensitivity_level,
            'is_cold'           => true,
            'is_locked'         => $options['lock'] ?? false,
            'version_count'     => 1,
            'uploaded_by'       => $user->id,
            'metadata'          => [
                'archived_folder_id'   => $folder->id,
                'archived_folder_name' => $folder->name,
                'file_count'           => count($paths),
            ],
        ]);

        VaultDocumentVersion::create([
            'document_id'    => $zipDocument->id,
            'file_path'      => $zipPath,
            'file_size'      => $zipSize,
            'version_number' => 1,
            'change_note'    => 'Folder archive',
            'uploaded_by'    => $user->id,
            'created_at'     => now(),
        ]);

        $archived = VaultArchivedItem::create([
            'vault_document_id'   => $zipDocument->id,
            'source_type'         => 'manual_archive',
            'source_reference'    => (string) $folder->id,
            'source_table'        => 'vault_folders',
            'archived_by_user_id' => $user->id,
            'archived_at'         => now(),
            'original_location'   => 'folder:' . $folder->id,
            'is_cold'             => true,
            'compressed_path'     => $zipPath,
            'notes'               => $options['notes'] ?? null,
        ]);

        $this->policy->log($user, 'compress', 'folder', $folder->id, [
            'zip_document_id' => $zipDocument->id,
            'file_count'      => count($paths),
        ]);

        return $archived->load('document');
    }

    private function collectFolderFilePaths(VaultFolder $folder): array
    {
        $paths = [];

        foreach ($folder->documents as $doc) {
            if (Storage::exists($doc->file_path)) {
                $paths[] = $doc->file_path;
            }
        }

        foreach ($folder->children as $child) {
            $paths = array_merge($paths, $this->collectFolderFilePaths($child));
        }

        return $paths;
    }

    // =========================================================================
    // RESTORE
    // =========================================================================

    public function restoreDocument(User $user, VaultDocument $document): VaultDocument
    {
        if (!$this->policy->can($user, 'restore', 'document', $document)) {
            abort(403, 'You do not have permission to restore this document.');
        }

        $document->restore();

        $this->policy->log($user, 'restore', 'document', $document->id);

        return $document->fresh();
    }

    public function restoreFolder(User $user, VaultFolder $folder): VaultFolder
    {
        if (!$this->policy->can($user, 'restore', 'folder', $folder)) {
            abort(403, 'You do not have permission to restore this folder.');
        }

        $folder->restore();

        $this->policy->log($user, 'restore', 'folder', $folder->id);

        return $folder->fresh();
    }

    // =========================================================================
    // STORAGE HELPERS
    // =========================================================================

    private function storeFile(UploadedFile $file, ?VaultFolder $folder): string
    {
        $directory = 'vault/' . ($folder
            ? 'folders/' . $folder->id
            : 'root');

        return $file->store($directory, 'local');
    }

    private function copyFile(string $sourcePath, ?VaultFolder $destination): string
    {
        $directory   = 'vault/' . ($destination ? 'folders/' . $destination->id : 'root');
        $filename    = Str::uuid() . '_' . basename($sourcePath);
        $destination = $directory . '/' . $filename;

        Storage::copy($sourcePath, $destination);

        return $destination;
    }

    private function compressToZip(array $filePaths, string $name): string
    {
        $zipName = 'vault/archives/' . Str::slug($name) . '-' . now()->format('Ymd-His') . '.zip';
        $zipFullPath = Storage::path($zipName);

        // Ensure directory exists
        if (!is_dir(dirname($zipFullPath))) {
            mkdir(dirname($zipFullPath), 0755, true);
        }

        $zip = new \ZipArchive();
        $zip->open($zipFullPath, \ZipArchive::CREATE | \ZipArchive::OVERWRITE);

        foreach ($filePaths as $path) {
            $fullPath = Storage::path($path);
            if (file_exists($fullPath)) {
                $zip->addFile($fullPath, basename($path));
            }
        }

        $zip->close();

        return $zipName;
    }

    private function uniqueSlug(string $name, ?int $parentId, ?int $excludeId = null): string
    {
        $slug = Str::slug($name);
        $original = $slug;
        $count = 1;

        while (true) {
            $query = VaultFolder::where('slug', $slug)
                ->where('parent_id', $parentId);

            if ($excludeId) $query->where('id', '!=', $excludeId);

            if (!$query->exists()) break;

            $slug = $original . '-' . $count++;
        }

        return $slug;
    }
}