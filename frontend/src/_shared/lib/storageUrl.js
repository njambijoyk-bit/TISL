/**
 * Turn a stored path ('/storage/products/x.jpg') into a full URL.
 * Absolute URLs pass through. Uses VITE_STORAGE_URL when the API's files are
 * served from another origin than the frontend.
 */
export const storageUrl = (path) => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = (import.meta.env?.VITE_STORAGE_URL || window.location.origin).replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
};
