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
    <div className="stepper">
      <button type="button" onClick={() => onChange(Math.max(min, value - step))}>
        −
      </button>
      <div className="val">
        {value}
        {suffix}
      </div>
      <button type="button" onClick={() => onChange(Math.min(max, value + step))}>
        +
      </button>
    </div>
  );
}
