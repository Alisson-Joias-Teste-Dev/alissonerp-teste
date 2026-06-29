"use client";

import { ReactNode } from "react";

interface TableProps { children: ReactNode; className?: string; }
interface TableHeaderProps { children: ReactNode; className?: string; }
interface TableBodyProps { children: ReactNode; className?: string; }
interface TableRowProps { children: ReactNode; className?: string; onClick?: () => void; }
interface TableCellProps { children: ReactNode; isHeader?: boolean; className?: string; colSpan?: number; onClick?: (e: React.MouseEvent) => void; }

export function Table({ children, className = "" }: TableProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
      <table className={`min-w-full ${className}`}>{children}</table>
    </div>
  );
}

export function TableHeader({ children, className = "" }: TableHeaderProps) {
  return <thead className={`border-b border-gray-200 ${className}`}>{children}</thead>;
}

export function TableBody({ children, className = "" }: TableBodyProps) {
  return <tbody className={`divide-y divide-gray-100 ${className}`}>{children}</tbody>;
}

export function TableRow({ children, className = "", onClick }: TableRowProps) {
  return (
    <tr className={`${onClick ? "cursor-pointer hover:bg-gray-50" : ""} ${className}`} onClick={onClick}>
      {children}
    </tr>
  );
}

export function TableCell({ children, isHeader = false, className = "", colSpan, onClick }: TableCellProps) {
  const Component = isHeader ? "th" : "td";
  const headerCls = "px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap";
  const bodyCls = "px-6 py-4 text-sm text-gray-700";

  return (
    <Component className={`${isHeader ? headerCls : bodyCls} ${className}`} colSpan={colSpan} onClick={onClick}>
      {children}
    </Component>
  );
}
