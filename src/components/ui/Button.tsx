"use client";

import { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

const variantStyles: Record<Variant, Record<string, string>> = {
  primary:   { bg: "#184036", color: "#F3EADA", hover: "opacity-90" },
  secondary: { bg: "#f3f4f6", color: "#374151", hover: "hover:bg-gray-200" },
  outline:   { bg: "transparent", color: "#374151", hover: "hover:bg-gray-100" },
  ghost:     { bg: "transparent", color: "#6b7280", hover: "hover:text-gray-900" },
  danger:    { bg: "#dc2626", color: "#ffffff", hover: "opacity-90" },
};

const sizeStyles: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className = "",
  children,
  style,
  ...rest
}: Props) {
  const v = variantStyles[variant];
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all disabled:opacity-40 ${sizeStyles[size]} ${v.hover} ${className}`}
      style={{ backgroundColor: v.bg, color: v.color, ...style }}
      {...rest}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}
