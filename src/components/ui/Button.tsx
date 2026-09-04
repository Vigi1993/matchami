type Variant = "primary" | "outline" | "ghost";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-gold text-ink",
  outline: "border-2 border-clay text-clay bg-transparent",
  ghost: "bg-ink/10 text-ink",
};

export function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  disabled = false,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: Variant;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`font-bold text-sm py-3 rounded-xl disabled:opacity-50 transition-opacity ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
