import { localize } from "../i18n";
import { useEffect, useRef, useId, type ReactNode } from "react";
import { X } from "lucide-react";
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  busy,
  confirmDisabled = false,
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy: boolean;
  confirmDisabled?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return localize(
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="section-heading">
        <h3 id={titleId}>{title}</h3>
        <button
          className="btn btn-glass btn-icon"
          aria-label="Close dialog"
          disabled={busy}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <div className="dialog-content">{children}</div>
      <div className="dialog-actions">
        <button className="btn btn-glass" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
          disabled={busy || confirmDisabled}
          onClick={onConfirm}
        >
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </dialog>,
  );
}
