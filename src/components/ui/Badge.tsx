"use client";

import { ReactNode } from "react";

type BadgeVariant = "light" | "solid";
type BadgeSize = "sm" | "md";
type BadgeColor = "brand" | "success" | "error" | "warning" | "info" | "neutral" | "dourado";

interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  color?: BadgeColor;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
  children: ReactNode;
  className?: string;
}

const sizeClasses: Record<BadgeSize, string> = {
  sm: "px-2 py-0.5 text-theme-xs",
  md: "px-2.5 py-0.5 text-sm",
};

const colorMap: Record<BadgeColor, { light: string; solid: string }> = {
  brand:   { light: "bg-esmeralda-50 text-esmeralda-600",    solid: "bg-esmeralda-500 text-white" },
  success: { light: "bg-success-50 text-success-600",        solid: "bg-success-500 text-white" },
  error:   { light: "bg-error-50 text-error-600",            solid: "bg-error-500 text-white" },
  warning: { light: "bg-warning-50 text-warning-600",        solid: "bg-warning-500 text-white" },
  info:    { light: "bg-info-50 text-info-600",              solid: "bg-info-500 text-white" },
  neutral: { light: "bg-gray-100 text-gray-700",             solid: "bg-gray-500 text-white" },
  dourado: { light: "bg-dourado-light/60 text-dourado-dark", solid: "bg-dourado-DEFAULT text-white" },
};

export function Badge({ variant = "light", color = "brand", size = "md", startIcon, endIcon, children, className = "" }: BadgeProps) {
  return (
    <span className={`inline-flex items-center justify-center gap-1 rounded-full font-medium ${sizeClasses[size]} ${colorMap[color][variant]} ${className}`}>
      {startIcon && <span className="shrink-0">{startIcon}</span>}
      {children}
      {endIcon && <span className="shrink-0">{endIcon}</span>}
    </span>
  );
}

export function StatusBadge({ ativo }: { ativo: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${ativo ? "text-green-600" : "text-gray-400"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ativo ? "bg-green-500" : "bg-gray-300"}`} />
      {ativo ? "Ativo" : "Inativo"}
    </span>
  );
}
