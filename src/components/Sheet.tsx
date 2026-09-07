"use client";

import { useEffect } from "react";

/**
 * Bottom sheet del prototipo: pannello color carta che sale dal basso,
 * alto l'88% del telaio, con maniglia in alto e contenuto scrollabile.
 * L'interfaccia (open / onClose / title / children) è invariata.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  // chiudi con Esc, comodo su desktop
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden />
      <div className="sheet" role="dialog" aria-label={title}>
        <div className="sheet-handle-area">
          <div className="sheet-handle" />
        </div>
        <div className="sheet-scroll">
          <div className="flex items-start justify-between gap-3">
            <h2 className="sheet-title">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Chiudi"
              className="sheet-close mt-2"
            >
              ×
            </button>
          </div>
          {children}
        </div>
      </div>
    </>
  );
}
