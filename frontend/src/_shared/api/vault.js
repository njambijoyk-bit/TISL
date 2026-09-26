import api from './axios';

/**
 * Vault API
 * Document storage, archiving, and security management.
 *
 * Folders      → folderTree, showFolder, createFolder, updateFolder,
 *                deleteFolder, moveFolder, archiveFolder,
 *                unlockFolder, setFolderPassword, removeFolderPassword, restoreFolder
 *
 * Documents    → showDocument, uploadDocument, updateDocument, deleteDocument,
 *                uploadVersion, moveDocument, copyDocument, archiveDocument,
 *                unlockDocument, setDocumentPassword, removeDocumentPassword,
 *                previewDocument, downloadDocument, restoreDocument
 *
 * Archiver     → listArchiverConfigs, createArchiverConfig, updateArchiverConfig,
 *                runArchiverConfig, listArchiveRuns, showArchiveRun
 *
 * Policies     → listPolicies, createPolicy, updatePolicy, deletePolicy
 *
 * Settings     → getSettings, updateSettings
 *
 * Logs         → accessLogs
 */

const vaultAPI = {

  // ── FOLDERS ────────────────────────────────────────────────────────────────

  /**
   * Get folder tree from root or a given parent.
   * @param {number|null} parentId
   * Returns: { data: VaultFolder[] }
   */
  folderTree: async (parentId = null) => {
    const response = await api.get('/admin/vault/folders', {
      params: parentId ? { parent_id: parentId } : {},
    });
    return response.data;
  },

  /**
   * Get a single folder with its children and documents.
   * Returns: { data: VaultFolder }
   */
  showFolder: async (folderId) => {
    const response = await api.get(`/admin/vault/folders/${folderId}`);
    return response.data;
  },

  folderContents: async (folderId = null) => {
    const response = await api.get('/admin/vault/contents', {
      params: folderId ? { folder_id: folderId } : {},
    });
    return response.data;
  },

  /**
   * Create a new folder.
   * @param {Object} data — { name, description?, parent_id?, folder_type?, sensitivity_level?, inherits_parent_policy? }
   * Returns: { data: VaultFolder }
   */
  createFolder: async (data) => {
    const response = await api.post('/admin/vault/folders', data);
    return response.data;
  },

  /**
   * Update folder metadata.
   * @param {number} folderId
   * @param {Object} data — { name?, description?, sensitivity_level?, inherits_parent_policy? }
   * Returns: { data: VaultFolder }
   */
  updateFolder: async (folderId, data) => {
    const response = await api.put(`/admin/vault/folders/${folderId}`, data);
    return response.data;
  },

  /**
   * Delete a folder and all its contents.
   * Returns: { message }
   */
  deleteFolder: async (folderId) => {
    const response = await api.delete(`/admin/vault/folders/${folderId}`);
    return response.data;
  },

  /**
   * Move a folder to a new parent (null = root).
   * @param {number} folderId
   * @param {number|null} destinationId
   * Returns: { data: VaultFolder }
   */
  moveFolder: async (folderId, destinationId = null) => {
    const response = await api.post(`/admin/vault/folders/${folderId}/move`, {
      destination_id: destinationId,
    });
    return response.data;
  },

  /**
   * Archive entire folder tree as a zip into cold storage.
   * @param {number} folderId
   * @param {Object} options — { lock?, destination_folder_id?, notes? }
   * Returns: { data: VaultArchivedItem }
   */
  archiveFolder: async (folderId, options = {}) => {
    const response = await api.post(`/admin/vault/folders/${folderId}/archive`, options);
    return response.data;
  },

  /**
   * Unlock a password-protected folder for the current session.
   * @param {number} folderId
   * @param {string} password
   * Returns: { message } | 422
   */
  unlockFolder: async (folderId, password) => {
    const response = await api.post(`/admin/vault/folders/${folderId}/unlock`, { password });
    return response.data;
  },

  /**
   * Set a password on a folder.
   * @param {number} folderId
   * @param {string} password
   * Returns: { message }
   */
  setFolderPassword: async (folderId, password) => {
    const response = await api.post(`/admin/vault/folders/${folderId}/password`, { password });
    return response.data;
  },

  /**
   * Remove password from a folder.
   * Returns: { message }
   */
  removeFolderPassword: async (folderId) => {
    const response = await api.delete(`/admin/vault/folders/${folderId}/password`);
    return response.data;
  },

  /**
   * Restore a soft-deleted folder.
   * Returns: { data: VaultFolder }
   */
  restoreFolder: async (folderId) => {
    const response = await api.post(`/admin/vault/folders/${folderId}/restore`);
    return response.data;
  },

  // ── DOCUMENTS ──────────────────────────────────────────────────────────────

  /**
   * Get a single document with versions and metadata.
   * Returns: { data: VaultDocument }
   */
  showDocument: async (documentId) => {
    const response = await api.get(`/admin/vault/documents/${documentId}`);
    return response.data;
  },

  /**
   * Upload a new document.
   * @param {FormData} formData — must include: file, folder_id?, name?, document_type?,
   *                              sensitivity_level?, tags[]?, metadata{}?
   * Returns: { data: VaultDocument }
   */
  uploadDocument: async (formData) => {
    const response = await api.post('/admin/vault/documents', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  /**
   * Update document metadata (no file change).
   * @param {number} documentId
   * @param {Object} data — { name?, document_type?, sensitivity_level?, tags?, metadata? }
   * Returns: { data: VaultDocument }
   */
  updateDocument: async (documentId, data) => {
    const response = await api.put(`/admin/vault/documents/${documentId}`, data);
    return response.data;
  },

  /**
   * Delete a document (soft delete).
   * Returns: { message }
   */
  deleteDocument: async (documentId) => {
    const response = await api.delete(`/admin/vault/documents/${documentId}`);
    return response.data;
  },

  /**
   * Upload a new version of an existing document.
   * @param {number} documentId
   * @param {FormData} formData — must include: file, change_note?
   * Returns: { data: VaultDocument }
   */
  uploadVersion: async (documentId, formData) => {
    const response = await api.post(`/admin/vault/documents/${documentId}/version`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  /**
   * Move a document to a different folder (null = root).
   * @param {number} documentId
   * @param {number|null} destinationFolderId
   * Returns: { data: VaultDocument }
   */
  moveDocument: async (documentId, destinationFolderId = null) => {
    const response = await api.post(`/admin/vault/documents/${documentId}/move`, {
      destination_folder_id: destinationFolderId,
    });
    return response.data;
  },

  /**
   * Copy a document to a different folder.
   * @param {number} documentId
   * @param {number|null} destinationFolderId
   * Returns: { data: VaultDocument } — the new copy
   */
  copyDocument: async (documentId, destinationFolderId = null) => {
    const response = await api.post(`/admin/vault/documents/${documentId}/copy`, {
      destination_folder_id: destinationFolderId,
    });
    return response.data;
  },

  /**
   * Archive a document to cold storage.
   * @param {number} documentId
   * @param {Object} options — { compress?, lock?, destination_folder_id?, notes? }
   * Returns: { data: VaultArchivedItem }
   */
  archiveDocument: async (documentId, options = {}) => {
    const response = await api.post(`/admin/vault/documents/${documentId}/archive`, options);
    return response.data;
  },

  /**
   * Unlock a password-protected document for the current session.
   * @param {number} documentId
   * @param {string} password
   * Returns: { message } | 422
   */
  unlockDocument: async (documentId, password) => {
    const response = await api.post(`/admin/vault/documents/${documentId}/unlock`, { password });
    return response.data;
  },

  /**
   * Set a password on a document.
   * Returns: { message }
   */
  setDocumentPassword: async (documentId, password) => {
    const response = await api.post(`/admin/vault/documents/${documentId}/password`, { password });
    return response.data;
  },

  /**
   * Remove password from a document.
   * Returns: { message }
   */
  removeDocumentPassword: async (documentId) => {
    const response = await api.delete(`/admin/vault/documents/${documentId}/password`);
    return response.data;
  },

  /**
   * Get preview data for a document.
   * Returns: { data: { document, file_path, extension, mime_type, url } }
   */
  previewDocument: async (documentId) => {
    const response = await api.get(`/admin/vault/documents/${documentId}/preview`);
    return response.data;
  },

  /**
   * Download a document — returns a blob URL for the browser to trigger download.
   * @param {number} documentId
   * @param {string} filename — suggested save name
   */
  downloadDocument: async (documentId, filename) => {
    const response = await api.get(`/admin/vault/documents/${documentId}/download`, {
      responseType: 'blob',
    });
    const url  = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href  = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  /**
   * Restore a soft-deleted document.
   * Returns: { data: VaultDocument }
   */
  restoreDocument: async (documentId) => {
    const response = await api.post(`/admin/vault/documents/${documentId}/restore`);
    return response.data;
  },

  // ── ARCHIVER ───────────────────────────────────────────────────────────────

  /**
   * List all archiver configs with last run info.
   * Returns: { data: VaultArchiverConfig[] }
   */
  listArchiverConfigs: async () => {
    const response = await api.get('/admin/vault/archiver/configs');
    return response.data;
  },

  /**
   * Create a new archiver config.
   * @param {Object} data — { archiver_type, table_name?, label, description?,
   *                          retention_days?, export_format, destination_folder_id?,
   *                          is_enabled?, auto_archive_on_generate?, generator_class? }
   * Returns: { data: VaultArchiverConfig }
   */
  createArchiverConfig: async (data) => {
    const response = await api.post('/admin/vault/archiver/configs', data);
    return response.data;
  },

  /**
   * Update an archiver config.
   * Returns: { data: VaultArchiverConfig }
   */
  updateArchiverConfig: async (configId, data) => {
    const response = await api.put(`/admin/vault/archiver/configs/${configId}`, data);
    return response.data;
  },

  /**
   * Manually trigger an archiver config run.
   * Returns: { data: VaultArchiveRun }
   */
  runArchiverConfig: async (configId) => {
    const response = await api.post(`/admin/vault/archiver/configs/${configId}/run`);
    return response.data;
  },

  /**
   * List archive run history.
   * @param {Object} params — { config_id?, status?, page? }
   * Returns: paginated VaultArchiveRun[]
   */
  listArchiveRuns: async (params = {}) => {
    const response = await api.get('/admin/vault/archiver/runs', { params });
    return response.data;
  },

  /**
   * Get a single archive run with full detail.
   * Returns: { data: VaultArchiveRun }
   */
  showArchiveRun: async (runId) => {
    const response = await api.get(`/admin/vault/archiver/runs/${runId}`);
    return response.data;
  },

  runMultipleArchiverConfigs: async (configIds, purge = true) => {
    const response = await api.post('/admin/vault/archiver/configs/run-multiple', {
      config_ids: configIds,
      purge,
    });
    return response.data;
  },

  // ── POLICIES ───────────────────────────────────────────────────────────────

  /**
   * List all vault policies.
   * @param {Object} params — { target_type?, target_id? }
   * Returns: { data: VaultPolicy[] }
   */
  listPolicies: async (params = {}) => {
    const response = await api.get('/admin/vault/policies', { params });
    return response.data;
  },

  /**
   * Create a vault policy with conditions and assignments.
   * @param {Object} data — {
   *   name, description?, target_type, target_id?, effect, priority?, is_active?,
   *   conditions: [{ attribute_source, attribute_key, operator, attribute_value[] }],
   *   assignments: [{ assignee_type, assignee_value? }]
   * }
   * Returns: { data: VaultPolicy }
   */
  createPolicy: async (data) => {
    const response = await api.post('/admin/vault/policies', data);
    return response.data;
  },

  /**
   * Update a vault policy (replaces conditions and assignments if provided).
   * Returns: { data: VaultPolicy }
   */
  updatePolicy: async (policyId, data) => {
    const response = await api.put(`/admin/vault/policies/${policyId}`, data);
    return response.data;
  },

  /**
   * Delete a vault policy.
   * Returns: { message }
   */
  deletePolicy: async (policyId) => {
    const response = await api.delete(`/admin/vault/policies/${policyId}`);
    return response.data;
  },

  // ── SETTINGS ───────────────────────────────────────────────────────────────

  /**
   * Get current vault settings.
   * Returns: { data: VaultSetting }
   */
  getSettings: async () => {
    const response = await api.get('/admin/vault/settings');
    return response.data;
  },

  /**
   * Update vault settings (super_admin only).
   * @param {Object} data — {
   *   allowed_ip_ranges?, allowed_time_start?, allowed_time_end?,
   *   allowed_days?, max_failed_unlock_attempts?, unlock_session_ttl_minutes?,
   *   require_2fa_for_sensitive?, sensitive_threshold?,
   *   watermark_downloads?, log_preview_actions?, enforce_ip_globally?
   * }
   * Returns: { data: VaultSetting }
   */
  updateSettings: async (data) => {
    const response = await api.put('/admin/vault/settings', data);
    return response.data;
  },

  // ── LOGS ───────────────────────────────────────────────────────────────────

  /**
   * Get paginated vault access logs.
   * @param {Object} params — { user_id?, action?, target_type?, target_id?,
   *                            date_from?, date_to?, page? }
   * Returns: paginated VaultAccessLog[]
   */
  accessLogs: async (params = {}) => {
    const response = await api.get('/admin/vault/logs', { params });
    return response.data;
  },
};

export default vaultAPI;