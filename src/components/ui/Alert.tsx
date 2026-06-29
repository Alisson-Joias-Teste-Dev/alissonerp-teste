"use client";

import { ReactNode } from "react";
import { AlertTriangle, CheckCircle, X } from "lucide-react";

type AlertVariant = "success" | "error" | "warning" | "info";

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  message: string;
  showClose?: boolean;
  onClose?: () => void;
  className?: string;
}

const variantClasses: Record<AlertVariant, { container: string; icon: string }> = {
  success: { container: "border-success-500 bg-success-50", icon: "text-success-600" },
  error:   { container: "border-error-500 bg-error-50",     icon: "text-error-600" },
  warning: { container: "border-warning-500 bg-warning-50", icon: "text-warning-600" },
  info:    { container: "border-info-500 bg-info-50",       icon: "text-info-600" },
};

const icons: Record<AlertVariant, ReactNode> = {
  success: <CheckCircle size={16} />,
  error:   <AlertTriangle size={16} />,
  warning: <AlertTriangle size={16} />,
  info:    <AlertTriangle size={16} />,
};

export function Alert({ variant = "info", title, message, showClose, onClose, className = "" }: AlertProps) {
  const vc = variantClasses[variant];
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${vc.container} ${className}`}>
      <span className={`mt-0.5 shrink-0 ${vc.icon}`}>{icons[variant]}</span>
      <div className="flex-1 min-w-0">
        {title && <p className="text-sm font-semibold text-gray-800">{title}</p>}
        <p className={`text-sm ${title ? "mt-0.5" : ""} text-gray-700`}>{message}</p>
      </div>
      {showClose && onClose && (
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0">
          <X size={16} />
        </button>
      )}
    </div>
  );
}
