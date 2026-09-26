import api from './axios';

// ── Base path ─────────────────────────────────────────────────────────────────
const BASE = '/admin/data-engine';

const dataEngineAPI = {

    // ════════════════════════════════════════════════════════════════
    // ── MODE 1: Smart Export
    // ════════════════════════════════════════════════════════════════

    /**
     * Get available exportable columns for a source table.
     * GET /admin/data-engine/export/columns?source=orders
     */
    getExportColumns(source) {
        return api.get(`${BASE}/export/columns`, { params: { source } });
    },

    /**
     * Export data as CSV (blob) or JSON.
     * POST /admin/data-engine/export
     *
     * @param {object} payload
     * @param {string} payload.source
     * @param {string} payload.period_start   Y-m-d
     * @param {string} payload.period_end     Y-m-d
     * @param {string} [payload.format]       'csv' | 'json'
     * @param {string[]} [payload.columns]    subset of columns
     */
    exportData({ source, period_start, period_end, format = 'csv', columns = [] }) {
        return api.post(
            `${BASE}/export`,
            { source, period_start, period_end, format, columns },
            { responseType: format === 'csv' ? 'blob' : 'json' }
        );
    },

    // ════════════════════════════════════════════════════════════════
    // ── MODE 2: Import + Diff
    // ════════════════════════════════════════════════════════════════

    /**
     * Auto-detect the identifier column from an uploaded file's headers.
     * POST /admin/data-engine/detect-identifier
     *
     * @param {File}   file     CSV / Excel file
     * @param {string} [source] optional table hint for smarter detection
     */
    detectIdentifier(file, source = null) {
        const form = new FormData();
        form.append('file', file);
        if (source) form.append('source', source);
        return api.post(`${BASE}/detect-identifier`, form, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },

    /**
     * Run field-level diff between uploaded file and live TISL data.
     * POST /admin/data-engine/diff
     *
     * @param {object} payload
     * @param {File}   payload.file
     * @param {string} payload.source
     * @param {string} payload.identifier_col
     * @param {string} payload.period_start
     * @param {string} payload.period_end
     * @param {boolean} [payload.persist]        create a ReconciliationSession
     * @param {string}  [payload.session_notes]
     */
    runDiff({ file, source, identifier_col, period_start, period_end, persist = false, session_notes = null }) {
        const form = new FormData();
        form.append('file',           file);
        form.append('source',         source);
        form.append('identifier_col', identifier_col);
        form.append('period_start',   period_start);
        form.append('period_end',     period_end);
        form.append('persist',        persist ? '1' : '0');
        if (session_notes) form.append('session_notes', session_notes);
        return api.post(`${BASE}/diff`, form, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },

    // ════════════════════════════════════════════════════════════════
    // ── MODE 3: AI Analysis
    // ════════════════════════════════════════════════════════════════

    /**
     * Run AI analysis on a persisted session or a raw diff result.
     * POST /admin/data-engine/analyse
     *
     * @param {object} payload
     * @param {number}  [payload.session_id]   analyse a persisted session
     * @param {object}  [payload.diff_result]  analyse a raw diff (not yet persisted)
     * @param {string}  [payload.output_type]  'summary' | 'insight' | 'risk' | 'recommendation'
     * @param {string}  [payload.custom_prompt]
     */
    analyse({ session_id = null, diff_result = null, output_type = 'summary', custom_prompt = null }) {
        return api.post(`${BASE}/analyse`, {
            ...(session_id   && { session_id }),
            ...(diff_result  && { diff_result }),
            output_type,
            ...(custom_prompt && { custom_prompt }),
        });
    },
};

export default dataEngineAPI;