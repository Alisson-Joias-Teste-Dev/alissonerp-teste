"use client";

interface Props {
  ativo: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

export default function Toggle({ ativo, onChange, disabled }: Props) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!ativo)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-40 ${
        ativo ? "bg-[#184036]" : "bg-gray-200"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ${
          ativo ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}
