import { useState, useEffect, useCallback, useRef } from 'react';
import vaultAPI from '../api/vault';
import useVaultStore from '../store/useVaultStore';

// ─────────────────────────────────────────────────────────────────────────────
// Shared helper
// ─────────────────────────────────────────────────────────────────────────────

function useAsync(fn, deps = []) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const execute = useCallback(async (...args) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fn(...args);
      if (mountedRef.current) setData(result);
      return result;
    } catch (err) {
      if (mountedRef.current) setError(err);
      throw err;
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, execute, setData };
}

// ─────────────────────────────────────────────────────────────────────────────
// useVaultFolder
// Manages the browser panel: loads folder contents, handles mutations.
// ─────────────────────────────────────────────────────────────────────────────

export function useVaultFolder() {
  const {
    currentFolder,
    getFolderCache,
    setFolderCache,
    invalidateFolderCache,
    invalidateAfterMutation,
    removeDocumentFromCache,
    removeFolderFromCache,
    openFolder,
    openModal,
  } = useVaultStore();

  const folderId = currentFolder?.id ?? null;

  const [folders,   setFolders]   = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);

  // ── Load folder contents (cache-aware) ─────────────────────────────────────
    const load = useCallback(async (force = false) => {
    const cached = getFolderCache(folderId);
    if (cached && !force && Date.now() - cached.loadedAt < 5 * 60 * 1000) {
      setFolders(cached.folders);
      setDocuments(cached.documents);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Unified endpoint: works for root (null) and subfolders
      const res = await vaultAPI.folderContents(folderId);
      const data = res.data ?? res;
      
      const loadedFolders = data.folders ?? [];
      const loadedDocuments = data.documents ?? [];

      setFolders(loadedFolders);
      setDocuments(loadedDocuments);
      setFolderCache(folderId, { 
        folders: loadedFolders, 
        documents: loadedDocuments, 
        loadedAt: Date.now() 
      });
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [folderId, getFolderCache, setFolderCache]);

  // Reload whenever the current folder changes
  useEffect(() => { load(); }, [load]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createFolder = useCallback(async (data) => {
    const res = await vaultAPI.createFolder({ ...data, parent_id: folderId });
    invalidateFolderCache(folderId);
    await load(true);
    return res;
  }, [folderId, invalidateFolderCache, load]);

  const deleteFolder = useCallback(async (folder) => {
    removeFolderFromCache(folderId, folder.id);
    try {
      await vaultAPI.deleteFolder(folder.id);
      invalidateAfterMutation(folder.id, folderId);
    } catch (err) {
      await load(true); // revert optimistic
      throw err;
    }
  }, [folderId, removeFolderFromCache, invalidateAfterMutation, load]);

  const deleteDocument = useCallback(async (doc) => {
    removeDocumentFromCache(folderId, doc.id);
    try {
      await vaultAPI.deleteDocument(doc.id);
    } catch (err) {
      await load(true);
      throw err;
    }
  }, [folderId, removeDocumentFromCache, load]);

  const moveDocument = useCallback(async (doc, destinationFolderId) => {
    removeDocumentFromCache(folderId, doc.id);
    try {
      const res = await vaultAPI.moveDocument(doc.id, destinationFolderId);
      invalidateFolderCache(destinationFolderId);
      return res;
    } catch (err) {
      await load(true);
      throw err;
    }
  }, [folderId, removeDocumentFromCache, invalidateFolderCache, load]);

  const moveFolder = useCallback(async (folder, destinationFolderId) => {
    removeFolderFromCache(folderId, folder.id);
    try {
      const res = await vaultAPI.moveFolder(folder.id, destinationFolderId);
      invalidateFolderCache(destinationFolderId);
      invalidateAfterMutation(folder.id, folderId);
      return res;
    } catch (err) {
      await load(true);
      throw err;
    }
  }, [folderId, removeFolderFromCache, invalidateFolderCache, invalidateAfterMutation, load]);

  const uploadDocument = useCallback(async (formData) => {
    const res = await vaultAPI.uploadDocument(formData);
    invalidateFolderCache(folderId);
    await load(true);
    return res;
  }, [folderId, invalidateFolderCache, load]);

  const archiveFolder = useCallback(async (folder, options = {}) => {
    const res = await vaultAPI.archiveFolder(folder.id, options);
    invalidateFolderCache(folderId);
    await load(true);
    return res;
  }, [folderId, invalidateFolderCache, load]);

  const archiveDocument = useCallback(async (doc, options = {}) => {
    const res = await vaultAPI.archiveDocument(doc.id, options);
    invalidateFolderCache(folderId);
    await load(true);
    return res;
  }, [folderId, invalidateFolderCache, load]);

  return {
    folders,
    documents,
    loading,
    error,
    reload: () => load(true),

    // mutations
    createFolder,
    deleteFolder,
    deleteDocument,
    moveDocument,
    moveFolder,
    uploadDocument,
    archiveFolder,
    archiveDocument,

    // convenience
    openFolder,
    openModal,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// useVaultDocument
// Single document detail — metadata, versions, password ops.
// ─────────────────────────────────────────────────────────────────────────────

export function useVaultDocument(documentId) {
  const { data: doc, loading, error, execute, setData } = useAsync(
    () => vaultAPI.showDocument(documentId).then(r => r.data ?? r),
    [documentId]
  );

  const { invalidateFolderCache } = useVaultStore();

  useEffect(() => {
    if (documentId) execute();
  }, [documentId]); // eslint-disable-line

  const refresh = useCallback(() => execute(), [execute]);

  const uploadVersion = useCallback(async (formData) => {
    const res = await vaultAPI.uploadVersion(documentId, formData);
    await refresh();
    return res;
  }, [documentId, refresh]);

  const updateDocument = useCallback(async (data) => {
    const res = await vaultAPI.updateDocument(documentId, data);
    setData(res.data ?? res);
    return res;
  }, [documentId, setData]);

  const setPassword = useCallback(async (password) => {
    const res = await vaultAPI.setDocumentPassword(documentId, password);
    await refresh();
    return res;
  }, [documentId, refresh]);

  const removePassword = useCallback(async () => {
    const res = await vaultAPI.removeDocumentPassword(documentId);
    await refresh();
    return res;
  }, [documentId, refresh]);

  const unlock = useCallback(async (password) => {
    return vaultAPI.unlockDocument(documentId, password);
  }, [documentId]);

  const download = useCallback(async (filename) => {
    return vaultAPI.downloadDocument(documentId, filename ?? doc?.original_filename);
  }, [documentId, doc]);

  const restore = useCallback(async () => {
    const res = await vaultAPI.restoreDocument(documentId);
    if (doc?.folder_id) invalidateFolderCache(doc.folder_id);
    return res;
  }, [documentId, doc, invalidateFolderCache]);

  return {
    doc,
    loading,
    error,
    refresh,
    uploadVersion,
    updateDocument,
    setPassword,
    removePassword,
    unlock,
    download,
    restore,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// useVaultTree
// Lazy folder tree for the sidebar. Each node loads its children on expand.
// ─────────────────────────────────────────────────────────────────────────────

export function useVaultTree() {
  const {
    treeNodes,
    expandedNodes,
    hasTreeChildren,
    getTreeChildren,
    setTreeChildren,
    toggleTreeNode,
    isTreeNodeExpanded,
  } = useVaultStore();

  const [loadingNodes, setLoadingNodes] = useState(new Set());

  // Load root on mount
  useEffect(() => {
    if (!hasTreeChildren(null)) loadChildren(null);
  }, []); // eslint-disable-line

  const loadChildren = useCallback(async (folderId) => {
    if (loadingNodes.has(folderId)) return;

    setLoadingNodes(prev => new Set([...prev, folderId]));
    try {
      const res  = await vaultAPI.folderTree(folderId);
      const data = res.data ?? res;
      // folderTree returns folder children (not documents) for the tree
      const children = Array.isArray(data) ? data : (data.children ?? []);
      setTreeChildren(folderId, children);
    } finally {
      setLoadingNodes(prev => {
        const next = new Set(prev);
        next.delete(folderId);
        return next;
      });
    }
  }, [loadingNodes, setTreeChildren]);

  const expand = useCallback(async (folderId) => {
    if (!hasTreeChildren(folderId)) {
      await loadChildren(folderId);
    }
    toggleTreeNode(folderId);
  }, [hasTreeChildren, loadChildren, toggleTreeNode]);

  const collapse = useCallback((folderId) => {
    toggleTreeNode(folderId);
  }, [toggleTreeNode]);

  const isLoading = useCallback((folderId) => loadingNodes.has(folderId), [loadingNodes]);

  const refreshNode = useCallback(async (folderId) => {
    await loadChildren(folderId);
  }, [loadChildren]);

  return {
    treeNodes,
    expandedNodes,
    expand,
    collapse,
    isLoading,
    isExpanded: isTreeNodeExpanded,
    getChildren: getTreeChildren,
    refreshNode,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// useVaultArchiver
// Configs list + archive run history + manual trigger.
// ─────────────────────────────────────────────────────────────────────────────

export function useVaultArchiver() {
  const [configs,  setConfigs]  = useState([]);
  const [runs,     setRuns]     = useState([]);
  const [runsMeta, setRunsMeta] = useState(null);  // pagination
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [triggering, setTriggering] = useState(null); // configId being triggered

  const loadConfigs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await vaultAPI.listArchiverConfigs();
      setConfigs(res.data ?? res);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRuns = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const res = await vaultAPI.listArchiveRuns(params);
      setRuns(res.data ?? []);
      setRunsMeta(res.meta ?? null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfigs();
    loadRuns();
  }, []);  // eslint-disable-line

  const triggerRun = useCallback(async (configId) => {
    setTriggering(configId);
    try {
      const res = await vaultAPI.runArchiverConfig(configId);
      // Refresh both configs (last_archived_at updated) and runs
      await Promise.all([loadConfigs(), loadRuns()]);
      return res;
    } finally {
      setTriggering(null);
    }
  }, [loadConfigs, loadRuns]);

  const createConfig = useCallback(async (data) => {
    const res = await vaultAPI.createArchiverConfig(data);
    await loadConfigs();
    return res;
  }, [loadConfigs]);

  const updateConfig = useCallback(async (configId, data) => {
    const res = await vaultAPI.updateArchiverConfig(configId, data);
    setConfigs(prev => prev.map(c => c.id === configId ? (res.data ?? res) : c));
    return res;
  }, []);

  return {
    configs,
    runs,
    runsMeta,
    loading,
    error,
    triggering,
    triggerRun,
    createConfig,
    updateConfig,
    reloadConfigs: loadConfigs,
    reloadRuns:    (params) => loadRuns(params),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// useVaultPolicies
// ─────────────────────────────────────────────────────────────────────────────

export function useVaultPolicies(params = {}) {
  const [policies, setPolicies] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await vaultAPI.listPolicies(params);
      setPolicies(res.data ?? res);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(params)]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  const createPolicy = useCallback(async (data) => {
    const res = await vaultAPI.createPolicy(data);
    await load();
    return res;
  }, [load]);

  const updatePolicy = useCallback(async (policyId, data) => {
    const res = await vaultAPI.updatePolicy(policyId, data);
    setPolicies(prev => prev.map(p => p.id === policyId ? (res.data ?? res) : p));
    return res;
  }, []);

  const deletePolicy = useCallback(async (policyId) => {
    setPolicies(prev => prev.filter(p => p.id !== policyId));
    try {
      await vaultAPI.deletePolicy(policyId);
    } catch (err) {
      await load(); // revert
      throw err;
    }
  }, [load]);

  return { policies, loading, error, reload: load, createPolicy, updatePolicy, deletePolicy };
}

// ─────────────────────────────────────────────────────────────────────────────
// useVaultSettings
// ─────────────────────────────────────────────────────────────────────────────

export function useVaultSettings() {
  const [settings, setSettings] = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    setLoading(true);
    vaultAPI.getSettings()
      .then(res => setSettings(res.data ?? res))
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  const save = useCallback(async (data) => {
    setSaving(true);
    setError(null);
    try {
      const res = await vaultAPI.updateSettings(data);
      setSettings(res.data ?? res);
      return res;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  return { settings, loading, saving, error, save };
}

// ─────────────────────────────────────────────────────────────────────────────
// useVaultLogs
// Paginated access log feed with filters.
// ─────────────────────────────────────────────────────────────────────────────

export function useVaultLogs(initialParams = {}) {
  const [logs,    setLogs]    = useState([]);
  const [meta,    setMeta]    = useState(null);
  const [params,  setParams]  = useState(initialParams);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const load = useCallback(async (overrideParams) => {
    setLoading(true);
    setError(null);
    try {
      const res = await vaultAPI.accessLogs(overrideParams ?? params);
      setLogs(res.data ?? []);
      setMeta(res.meta ?? null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => { load(); }, [load]);

  const filter = useCallback((newParams) => {
    const merged = { ...params, ...newParams, page: 1 };
    setParams(merged);
    load(merged);
  }, [params, load]);

  const nextPage = useCallback(() => {
    if (!meta || meta.current_page >= meta.last_page) return;
    const next = { ...params, page: meta.current_page + 1 };
    setParams(next);
    load(next);
  }, [params, meta, load]);

  const prevPage = useCallback(() => {
    if (!meta || meta.current_page <= 1) return;
    const prev = { ...params, page: meta.current_page - 1 };
    setParams(prev);
    load(prev);
  }, [params, meta, load]);

  return {
    logs,
    meta,
    loading,
    error,
    filter,
    nextPage,
    prevPage,
    reload: () => load(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// useDragDrop
// Native HTML5 drag + touch fallback. Used by folder/document cards and rows.
// ─────────────────────────────────────────────────────────────────────────────

export function useDragDrop({ onDrop }) {
  const {
    startDrag,
    endDrag,
    setDropTarget,
    clearDropTarget,
    activeDrag,
    dropTarget,
  } = useVaultStore();

  const ghostRef    = useRef(null);
  const longPressRef= useRef(null);
  const touchItemRef= useRef(null);

  // ── Drag source props (attach to draggable card/row) ──────────────────────

  const getDragProps = useCallback((type, item) => ({
    draggable: true,

    onDragStart: (e) => {
      startDrag(type, item);
      e.dataTransfer.effectAllowed = 'move';
      // Transparent drag image (we style the card ourselves)
      const blank = document.createElement('div');
      document.body.appendChild(blank);
      e.dataTransfer.setDragImage(blank, 0, 0);
      setTimeout(() => document.body.removeChild(blank), 0);
    },

    onDragEnd: () => endDrag(),

    // Touch — 200ms longpress to initiate
    onTouchStart: (e) => {
      const touch = e.touches[0];
      touchItemRef.current = { type, item, startX: touch.clientX, startY: touch.clientY };

      longPressRef.current = setTimeout(() => {
        startDrag(type, item);
        createGhost(e.currentTarget, touch.clientX, touch.clientY);
      }, 200);
    },

    onTouchMove: (e) => {
      if (!activeDrag) {
        // If moved before longpress fires, cancel it (user is scrolling)
        clearTimeout(longPressRef.current);
        return;
      }
      e.preventDefault(); // stop scroll while dragging
      const touch = e.touches[0];
      moveGhost(touch.clientX, touch.clientY);

      // Detect drop target under finger
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const dropEl = el?.closest('[data-drop-folder-id]');
      if (dropEl) {
        setDropTarget(Number(dropEl.dataset.dropFolderId));
      } else {
        clearDropTarget();
      }
    },

    onTouchEnd: (e) => {
      clearTimeout(longPressRef.current);
      removeGhost();

      if (!activeDrag) return;

      const touch = e.changedTouches[0];
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const dropEl = el?.closest('[data-drop-folder-id]');
      if (dropEl && activeDrag) {
        onDrop(activeDrag, Number(dropEl.dataset.dropFolderId));
      }
      endDrag();
    },
  }), [activeDrag, startDrag, endDrag, setDropTarget, clearDropTarget, onDrop]);

  // ── Drop target props (attach to folder cards/tree nodes) ─────────────────

  const getDropProps = useCallback((folderId) => ({
    'data-drop-folder-id': folderId,

    onDragOver: (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDropTarget(folderId);
    },

    onDragLeave: (e) => {
      // Only clear if leaving the element entirely (not entering a child)
      if (!e.currentTarget.contains(e.relatedTarget)) {
        clearDropTarget();
      }
    },

    onDrop: (e) => {
      e.preventDefault();
      if (activeDrag) onDrop(activeDrag, folderId);
      endDrag();
    },
  }), [activeDrag, setDropTarget, clearDropTarget, endDrag, onDrop]);

  // ── Ghost element for touch drag ───────────────────────────────────────────

  function createGhost(sourceEl, x, y) {
    const clone = sourceEl.cloneNode(true);
    clone.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 9999;
      opacity: 0.85;
      transform: scale(1.05);
      left: ${x - sourceEl.offsetWidth  / 2}px;
      top:  ${y - sourceEl.offsetHeight / 2}px;
      width: ${sourceEl.offsetWidth}px;
      transition: none;
    `;
    document.body.appendChild(clone);
    ghostRef.current = clone;
  }

  function moveGhost(x, y) {
    if (!ghostRef.current) return;
    const el = ghostRef.current;
    el.style.left = `${x - el.offsetWidth  / 2}px`;
    el.style.top  = `${y - el.offsetHeight / 2}px`;
  }

  function removeGhost() {
    if (ghostRef.current) {
      document.body.removeChild(ghostRef.current);
      ghostRef.current = null;
    }
  }

  return {
    getDragProps,
    getDropProps,
    activeDrag,
    dropTarget,
    isDragging: !!activeDrag,
    isDropTarget: (id) => dropTarget === id,
  };
}