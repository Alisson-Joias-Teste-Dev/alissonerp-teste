"use client";

import { C } from "./constants";

interface StepsProps {
  steps: string[];
  current: number;
  accentColor?: string;
}

export function Steps({ steps, current, accentColor = C.esmeralda }: StepsProps) {
  return (
    <div className="flex items-center gap-1 mb-5">
      {steps.map((label, i) => (
        <div key={i} className="flex items-center gap-1 flex-1">
          <div className="flex items-center gap-1.5">
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{
                background: i <= current ? accentColor : "#E5E7EB",
                color:      i <= current ? C.creme     : "#9CA3AF",
              }}
            >
              {i < current ? "✓" : i + 1}
            </div>
            <span
              className="text-xs font-medium hidden sm:block"
              style={{ color: i <= current ? accentColor : "#9CA3AF" }}
            >
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className="flex-1 h-px mx-1"
              style={{ background: i < current ? accentColor : "#E5E7EB" }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
