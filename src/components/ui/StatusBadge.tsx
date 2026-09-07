const PRESETS = {
  attesa: "is-wait",
  positivo: "is-match",
  neutro: "is-off",
} as const;

export function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: keyof typeof PRESETS;
}) {
  return <span className={`mc-pct ${PRESETS[tone]}`}>{label}</span>;
}
