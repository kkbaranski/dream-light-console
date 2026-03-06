import { Modal } from "./Modal";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  isPending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  isPending = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal onClose={onClose}>
      <h2 className="text-white font-semibold text-base mb-3">{title}</h2>
      <p className="text-gray-400 text-sm mb-5">{message}</p>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors rounded-lg"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={isPending}
          className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white rounded-lg transition-colors"
        >
          {isPending ? "Deleting..." : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
