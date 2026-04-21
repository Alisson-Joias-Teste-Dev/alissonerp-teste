"use client";

import React, { useEffect } from "react";
import { CheckCircle, AlertCircle, Info } from "lucide-react";
import type { ToastMessage } from "@/types/precificacao";

interface ToastProps {
  toast: ToastMessage | null;
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        onClose();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast, onClose]);

  if (!toast) return null;

  return (
    <div className="fixed top-5 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white px-4 py-3 rounded-xl shadow-2xl text-xs font-bold z-[80] flex items-center gap-3 min-w-[250px] justify-center animate-[fadeIn_0.3s_ease-out]">
      {toast.type === "success" && <CheckCircle className="text-green-400 w-5 h-5" />}
      {toast.type === "error" && <AlertCircle className="text-red-400 w-5 h-5" />}
      {toast.type === "info" && <Info className="text-blue-400 w-5 h-5" />}
      <span>{toast.message}</span>
    </div>
  );
};

export default Toast;
