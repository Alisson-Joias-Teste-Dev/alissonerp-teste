"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

interface Props {
  nome: string | null;
  fotoUrl: string | null;
  size?: number;
  className?: string;
  userId?: string;      // se fornecido com clickable=true, navega ao drawer de edição
  clickable?: boolean;  // default false — só admin/dev deve ativar
}

// Gera iniciais a partir do nome (máx 2 letras)
function getIniciais(nome: string | null): string {
  if (!nome) return "?";
  const partes = nome.trim().split(/\s+/);
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

// Cor do fundo das iniciais baseada no nome (determinística)
function getBgColor(nome: string | null): string {
  const cores = [
    "#184036", "#1C4D3F", "#2D6A4F", "#1A5276",
    "#4A235A", "#6E2F1A", "#1F618D", "#117A65",
  ];
  if (!nome) return cores[0];
  const idx = nome.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % cores.length;
  return cores[idx];
}

export default function UserAvatar({ nome, fotoUrl, size = 32, className = "", userId, clickable }: Props) {
  const [imgError, setImgError] = useState(false);
  const iniciais = getIniciais(nome);
  const bgColor = getBgColor(nome);
  const style = { width: size, height: size, borderRadius: "50%", flexShrink: 0 };

  const avatarEl = (fotoUrl && !imgError) ? (
    <div style={style} className={`relative overflow-hidden ${className}`}>
      <Image
        src={fotoUrl}
        alt={nome ?? "Avatar"}
        fill
        className="object-cover"
        onError={() => setImgError(true)}
        sizes={`${size}px`}
        unoptimized
      />
    </div>
  ) : (
    <div
      style={{ ...style, backgroundColor: bgColor, display: "flex", alignItems: "center", justifyContent: "center" }}
      className={`select-none ${className}`}
    >
      <span
        style={{
          color: "#F3EADA",
          fontSize: size * 0.38,
          fontWeight: 600,
          letterSpacing: 0.5,
          lineHeight: 1,
        }}
      >
        {iniciais}
      </span>
    </div>
  );

  if (clickable && userId) {
    return (
      <Link
        href={`/configuracoes?tab=usuarios&user=${userId}`}
        className="inline-block rounded-full hover:ring-2 hover:ring-gray-300 hover:ring-offset-1 transition-all"
        style={{ borderRadius: "50%" }}
        title="Editar usuário"
      >
        {avatarEl}
      </Link>
    );
  }

  return avatarEl;
}
