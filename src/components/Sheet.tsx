"use client";

import { useEffect } from "react";

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
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-ink/60"
        onClick={onClose}
        aria-hidden
      />
      <div className="absolute bottom-0 left-0 right-0 max-h-[88vh] overflow-y-auto bg-paper rounded-t-3xl px-5 pt-5 pb-8 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg text-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Chiudi"
            className="text-ink/50 text-xl leading-none px-2"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
