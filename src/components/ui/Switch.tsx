"use client";

interface SwitchProps {
  label?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
  color?: "brand" | "gray";
}

export function Switch({
  label,
  checked,
  defaultChecked = false,
  disabled = false,
  onChange,
  color = "brand",
}: SwitchProps) {
  const isControlled = checked !== undefined;
  const isChecked = isControlled ? checked : defaultChecked;

  function handleToggle() {
    if (disabled) return;
    const next = !isChecked;
    if (!isControlled) {
      // Component handles it via parent re-render
    }
    onChange?.(next);
  }

  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <div className="relative">
        <input
          type="checkbox"
          checked={isChecked}
          disabled={disabled}
          onChange={handleToggle}
          className="sr-only"
        />
        <div
          className={`block h-6 w-11 rounded-full transition-colors duration-200 ${
            isChecked
              ? color === "brand"
                ? "bg-esmeralda-500"
                : "bg-gray-800"
              : "bg-error-200 dark:bg-error-800"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        />
        <div
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            isChecked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </div>
      {label && (
        <span className={`text-sm font-medium ${disabled ? "text-gray-400" : "text-gray-700"}`}>
          {label}
        </span>
      )}
    </label>
  );
}
