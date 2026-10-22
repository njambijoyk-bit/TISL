import api from './axios';

/**
 * Extras → Bulk import. `index` lists what this person may import (and what is switched off or still waiting for something);
 * `preview` checks a file and saves nothing; `import` saves all of it or none of it. A refusal (422) still carries the full
 * answer — { ok, errors: [{ row, column, code, message }], message } — so these return it rather than throwing.
 */
const answer = (e) => {
  if (e?.response?.status === 422 && e.response.data?.errors) return e.response.data;
  throw e;
};

const send = async (key, step, file, format, mapping) => {
  const form = new FormData();
  form.append('file', file);
  if (format) form.append('format', format);
  if (mapping && Object.keys(mapping).length) form.append('mapping', JSON.stringify(mapping));
  try {
    const { data } = await api.post(`/admin/bulk-import/${key}/${step}`, form);
    return data;
  } catch (e) {
    return answer(e);
  }
};

const bulkImportAPI = {
  index: async () => (await api.get('/admin/bulk-import')).data, // { formats, max_mb, max_rows, entities: [...] }

  preview: (key, file, format, mapping) => send(key, 'preview', file, format, mapping),
  import: (key, file, format, mapping) => send(key, 'import', file, format, mapping),

  /** Downloads the mapping template of one thing in one format. */
  downloadTemplate: async (key, format) => {
    const res = await api.get(`/admin/bulk-import/${key}/template/${format}`, { responseType: 'blob' });
    const name = /filename="?([^";]+)"?/.exec(res.headers['content-disposition'] || '')?.[1] || `${key}-template.${format}`;
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  },
};

export default bulkImportAPI;
