"use client";

import { P } from "./theme";

export interface ConsultoraAvatarProps {
  nome: string;
  foto: string | null;
  size?: number;
}

export default function ConsultoraAvatar({ nome, foto, size = 36 }: ConsultoraAvatarProps) {
  const iniciais = nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();

  const validSrc = foto && (foto.startsWith("http") || foto.startsWith("/")) ? foto : null;

  if (validSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={validSrc}
        alt={nome}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size, border: `1px solid ${P.esmeraldaMid}` }}
        onError={(e) => {
          // Esconde se falhar e mostra iniciais no lugar
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }

  return (
    <div
      className="flex items-center justify-center rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        backgroundColor: P.esmeralda,
        color: P.dourado,
        fontSize: size * 0.4,
        border: `1px solid ${P.esmeraldaMid}`,
      }}
    >
      {iniciais || "?"}
    </div>
  );
}
