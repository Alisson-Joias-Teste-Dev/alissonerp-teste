"use client";

import { InputHTMLAttributes, ReactNode } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  prefix?: string;
  error?: string;
}

export default function Input({ label, prefix, error, className = "", ...rest }: Props) {
  return (
    <div className="w-full">
      {label && (
        <label className="text-[11px] uppercase tracking-widest block mb-1.5 font-semibold text-gray-500">
          {label}
        </label>
      )}
      {prefix ? (
        <div className="flex items-center rounded-lg overflow-hidden border border-gray-200 bg-white">
          <span className="px-3 py-2.5 text-xs border-r border-gray-200 bg-gray-50 text-gray-400 shrink-0">
            {prefix}
          </span>
          <input
            className={`flex-1 bg-transparent px-3 py-2.5 text-sm outline-none text-gray-900 min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${className}`}
            {...rest}
          />
        </div>
      ) : (
        <input
          className={`w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors border border-gray-200 bg-white text-gray-900 focus:border-[#184036] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${className}`}
          {...rest}
        />
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
