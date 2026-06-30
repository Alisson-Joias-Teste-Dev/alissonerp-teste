"use client";

import { ReactNode } from "react";

interface CardProps {
  title?: string;
  desc?: string;
  children: ReactNode;
  className?: string;
  headerRight?: ReactNode;
}

export function Card({ title, desc, children, className = "", headerRight }: CardProps) {
  return (
    <div className={`p-5 border border-gray-200 rounded-2xl lg:p-6 ${className}`}>
      {(title || headerRight) && (
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between mb-5 lg:mb-6">
          <div>
            {title && <h4 className="text-lg font-semibold text-gray-800">{title}</h4>}
            {desc && <p className="mt-1 text-sm text-gray-500">{desc}</p>}
          </div>
          {headerRight}
        </div>
      )}
      {children}
    </div>
  );
}
