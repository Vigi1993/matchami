const PRESETS = {
  attesa: "bg-gold/20 text-[#8A6A25]",
  positivo: "bg-moss/15 text-moss",
  neutro: "bg-ink/10 text-ink/40",
} as const;

export function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: keyof typeof PRESETS;
}) {
  return (
    <span
      className={`text-[10px] font-bold px-2 py-1 rounded-full ${PRESETS[tone]}`}
    >
      {label}
    </span>
  );
}
