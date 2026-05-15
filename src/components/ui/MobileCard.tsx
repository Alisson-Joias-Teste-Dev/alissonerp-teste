'use client';
import React from 'react';

interface MobileCardProps {
  titulo: string;
  subtitulo?: string;
  badges?: Array<{ label: string; cor: string }>;
  campos: Array<{ label: string; valor: string | React.ReactNode }>;
  onClick?: () => void;
}

export function MobileCard({ titulo, subtitulo, badges, campos, onClick }: MobileCardProps) {
  return (
    <div
      className={`bg-white rounded-lg border border-[#E8DCC8] p-4 space-y-2 ${onClick ? 'cursor-pointer active:bg-gray-50' : ''}`}
      onClick={onClick}
    >
      <div className="flex justify-between items-start">
        <div>
          <p className="font-semibold text-[#184036]">{titulo}</p>
          {subtitulo && <p className="text-sm text-gray-500">{subtitulo}</p>}
        </div>
        {badges && badges.length > 0 && (
          <div className="flex gap-1 flex-wrap justify-end">
            {badges.map((b, i) => (
              <span key={i} className={`text-xs px-2 py-0.5 rounded-full ${b.cor}`}>
                {b.label}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {campos.map((c, i) => (
          <div key={i}>
            <span className="text-gray-400 text-xs">{c.label}</span>
            <div className="text-gray-700">{c.valor}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
