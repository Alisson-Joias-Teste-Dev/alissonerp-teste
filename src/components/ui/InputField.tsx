"use client";

import { InputHTMLAttributes, useState, ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";

interface InputFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  hint?: string;
  error?: boolean;
  success?: boolean;
  prefix?: string;
  suffix?: string;
  visible?: boolean;
  onVisibleChange?: () => void;
}

export function InputField({
  label,
  hint,
  error = false,
  success = false,
  disabled = false,
  prefix,
  suffix,
  className = "",
  type,
  visible,
  onVisibleChange,
  id,
  ...props
}: InputFieldProps) {
  const isPassword = type === "password";
  const [internalVisible, setInternalVisible] = useState(false);
  const isControlled = visible !== undefined && onVisibleChange !== undefined;
  const show = isControlled ? visible : internalVisible;
  const toggle = isControlled ? onVisibleChange : () => setInternalVisible(v => !v);

  const baseInput = "w-full bg-transparent px-3.5 py-2.5 text-sm outline-none placeholder:text-gray-400";
  const borderClasses = error
    ? "border-error-500 focus:border-error-300 focus:ring-2 focus:ring-error-500/10"
    : success
      ? "border-success-400 focus:border-success-300 focus:ring-2 focus:ring-success-500/10"
      : "border-gray-300 focus:border-esmeralda-300 focus:ring-2 focus:ring-esmeralda-500/10";

  return (
    <div>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <div className={`flex items-center rounded-lg border shadow-theme-xs transition-colors ${borderClasses} ${disabled ? "bg-gray-100" : "bg-white"}`}>
        {prefix && (
          <span className="pl-3.5 pr-2 text-sm text-gray-500 shrink-0">{prefix}</span>
        )}
        <input
          id={id}
          type={isPassword && !show ? "password" : "text"}
          disabled={disabled}
          className={`${baseInput} ${className} ${disabled ? "text-gray-500 cursor-not-allowed" : "text-gray-900"}`}
          {...props}
        />
        {suffix && (
          <span className="pr-3.5 pl-1 text-sm text-gray-500 shrink-0">{suffix}</span>
        )}
        {isPassword && (
          <button type="button" onClick={toggle} className="px-3 text-gray-400 hover:text-gray-600 shrink-0" tabIndex={-1}>
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
      {hint && (
        <p className={`mt-1.5 text-xs ${error ? "text-error-500" : success ? "text-success-600" : "text-gray-500"}`}>
          {hint}
        </p>
      )}
    </div>
  );
}
