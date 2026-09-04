export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix = "",
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - step))}
        className="w-8 h-8 rounded-full bg-ink/10 text-ink font-bold"
      >
        −
      </button>
      <div className="text-sm font-bold text-ink w-16 text-center">
        {value}
        {suffix}
      </div>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + step))}
        className="w-8 h-8 rounded-full bg-ink/10 text-ink font-bold"
      >
        +
      </button>
    </div>
  );
}
