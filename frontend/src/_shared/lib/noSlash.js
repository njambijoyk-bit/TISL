import toast from 'react-hot-toast';

/**
 * Take the symbol / out of what is being typed (or pasted) and say so at once. SKUs, voucher numbers and numbering prefixes or suffixes
 * end up in web addresses, where a slash would be read as a new part of the path.
 */
export default function noSlash(value, what = 'This') {
  const text = String(value ?? '');
  if (!text.includes('/')) return text;
  toast.error(`${what} cannot contain the symbol /`, { id: 'no-slash' });

  return text.replace(/\//g, '');
}
