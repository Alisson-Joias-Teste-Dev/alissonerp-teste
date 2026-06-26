import { ReactNode } from "react";

interface Props {
  children: ReactNode;
  color?: string;
  bg?: string;
  className?: string;
}

export default function Badge({ children, color = "#B37A4A", bg = "#d9770622", className = "" }: Props) {
  return (
    <span
      className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${className}`}
      style={{ backgroundColor: bg, color }}
    >
      {children}
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
