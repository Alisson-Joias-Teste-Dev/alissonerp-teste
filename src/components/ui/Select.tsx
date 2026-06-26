"use client";

import { SelectHTMLAttributes } from "react";

interface Option {
  value: string;
  label: string;
}

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: Option[];
  placeholder?: string;
}

export default function Select({ label, options, placeholder, className = "", ...rest }: Props) {
  return (
    <div className="w-full">
      {label && (
        <label className="text-[11px] uppercase tracking-widest block mb-1.5 font-semibold text-gray-500">
          {label}
        </label>
      )}
      <select
        className={`w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors border border-gray-200 bg-white text-gray-900 appearance-none focus:border-[#184036] ${className}`}
        {...rest}
      >
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
