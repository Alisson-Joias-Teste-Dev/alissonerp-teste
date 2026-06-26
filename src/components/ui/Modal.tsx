"use client";

import { ReactNode, useEffect } from "react";
import { X } from "lucide-react";

interface Props {
  aberto: boolean;
  onClose: () => void;
  titulo: string;
  subtitulo?: string;
  children: ReactNode;
  maxWidth?: string;
}

export default function Modal({ aberto, onClose, titulo, subtitulo, children, maxWidth = "md:max-w-md" }: Props) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (aberto) {
      document.addEventListener("keydown", handleKey);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [aberto, onClose]);

  if (!aberto) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className={`w-full max-h-[92vh] overflow-y-auto rounded-t-2xl md:rounded-2xl shadow-2xl p-6 ${maxWidth} md:max-h-[90vh]`}
        style={{ backgroundColor: "#FAFAF7", border: "1px solid #E8DCC8" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-base font-semibold" style={{ color: "#184036" }}>{titulo}</h2>
            {subtitulo && <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>{subtitulo}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={16} style={{ color: "#6B7280" }} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
