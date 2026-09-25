import { useState } from 'react';
import toast from 'react-hot-toast';
import ConfirmModal from '../../ui/ConfirmModal';

/**
 * Shared "are you sure?" flow for deletes. The server's refusal message
 * (e.g. "has rates attached — deactivate instead") is shown as-is.
 *
 *   const { ask, modal } = useDeleteConfirm(busy);
 *   ask({ title, message, run: () => deleteX(id), done: 'X deleted' })
 *   ...render {modal}
 */
export default function useDeleteConfirm(busy) {
  const [pending, setPending] = useState(null);

  const confirm = async () => {
    try {
      await pending.run();
      toast.success(pending.done ?? 'Deleted');
      setPending(null);
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Could not delete it');
      setPending(null);
    }
  };

  const modal = pending && (
    <ConfirmModal
      title={pending.title}
      message={pending.message}
      confirmLabel="Delete"
      busyLabel="Deleting…"
      danger
      busy={busy}
      onConfirm={confirm}
      onClose={() => setPending(null)}
    />
  );

  return { ask: setPending, modal };
}
