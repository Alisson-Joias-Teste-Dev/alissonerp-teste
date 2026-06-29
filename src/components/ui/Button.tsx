"use client";

import { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "sm" | "md";
  variant?: "primary" | "outline" | "ghost" | "danger";
  startIcon?: ReactNode;
  endIcon?: ReactNode;
  loading?: boolean;
}

const sizeClasses = {
  sm:  "px-4 py-3 text-sm",
  md:  "px-5 py-3.5 text-sm",
};

const variantClasses = {
  primary: "bg-esmeralda-500 text-white shadow-theme-xs hover:bg-esmeralda-600 disabled:bg-esmeralda-300 disabled:text-white/70",
  outline: "bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:bg-gray-50 disabled:text-gray-300 disabled:ring-gray-200",
  ghost:   "bg-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-800 disabled:text-gray-300 disabled:hover:bg-transparent",
  danger:  "bg-error-500 text-white shadow-theme-xs hover:bg-error-600 disabled:bg-error-300 disabled:text-white/70",
};

export function Button({
  size = "sm",
  variant = "primary",
  loading = false,
  disabled,
  startIcon,
  endIcon,
  children,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-medium gap-2 rounded-lg transition
        ${sizeClasses[size]} ${variantClasses[variant]}
        ${disabled || loading ? "cursor-not-allowed" : "cursor-pointer"}
        ${className}`}
      {...props}
    >
      {loading && <Loader2 size={size === "sm" ? 14 : 16} className="animate-spin shrink-0" />}
      {!loading && startIcon && <span className="flex items-center shrink-0">{startIcon}</span>}
      {children}
      {endIcon && <span className="flex items-center shrink-0">{endIcon}</span>}
    </button>
  );
}
