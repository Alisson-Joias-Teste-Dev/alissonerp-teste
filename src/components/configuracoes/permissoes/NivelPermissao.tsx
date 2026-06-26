"use client";

import { Lock, Eye, PenLine } from "lucide-react";

interface NivelPermissaoProps {
  level: 0 | 1 | 2;
  dirty?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}

const levelConfig: Record<number, { bg: string; color: string; Icon: React.ComponentType<{ size?: number }> }> = {
  0: { bg: "#f3f4f6", color: "#9ca3af", Icon: Lock },
  1: { bg: "#e0f2fe", color: "#0284c7", Icon: Eye },
  2: { bg: "#dcfce7", color: "#16a34a", Icon: PenLine },
};

export default function NivelPermissao({
  level,
  dirty = false,
  onClick,
  disabled = false,
  title,
}: NivelPermissaoProps) {
  const { bg, color, Icon } = levelConfig[level] ?? levelConfig[0];
  const style: React.CSSProperties = {
    backgroundColor: bg,
    color,
    outline: dirty ? "2px solid #d97706" : "none",
    outlineOffset: "1px",
  };

  if (disabled) {
    return (
      <div className="flex justify-center">
        <span
          className="inline-flex items-center justify-center w-7 h-7 rounded-lg"
          style={style}
          title={title}
        >
          <Icon size={13} />
        </span>
      </div>
    );
  }

  return (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={onClick}
        title={title}
        className="inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all hover:scale-110"
        style={style}
      >
        <Icon size={13} />
      </button>
    </div>
  );
}
