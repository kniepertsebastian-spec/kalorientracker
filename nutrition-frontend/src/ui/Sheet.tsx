import { useEffect, useRef, type ReactNode } from "react";

/** Bottom sheet on a native <dialog>: focus trap, Escape and the backdrop close it. Mark the field
 * that should get the keyboard with data-autofocus (React's autoFocus loses against showModal). */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d || d.open) return;
    d.showModal();
    // showModal() moves focus to the first focusable element (the close button), which overrides
    // React's autoFocus on the children. A field marked data-autofocus gets it back.
    d.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="sheet-body">
        <header className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="icon" aria-label="Schließen" onClick={onClose}>
            ✕
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
