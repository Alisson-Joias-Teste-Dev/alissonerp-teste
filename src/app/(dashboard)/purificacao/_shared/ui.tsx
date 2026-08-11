"use client";

import { X } from "lucide-react";
import { P } from "./estilos";

/** Pedaços de tela repetidos (seção, linha de valor, modal) — Etapa 5 do plano de consolidação. */

export function Section({ title, count, color, children }: { title: string; count: number; color: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: color }} />
        <h2 style={{ fontSize: 16, fontWeight: 700, color: P.text, margin: 0 }}>{title}</h2>
        <span style={{ fontSize: 12, background: color + "20", color, borderRadius: 10, padding: "2px 8px", fontWeight: 600 }}>{count}</span>
      </div>
      {children}
    </div>
  );
}

export function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
      <span style={{ color: P.muted }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 500, color: color ?? P.text }}>{value}</span>
    </div>
  );
}

export function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {children}
    </div>
  );
}

export function ModalBox({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{
      background: P.card, borderRadius: 16, padding: 24,
      width: "100%", maxWidth: 520, maxHeight: "90vh",
      overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: P.text }}>{title}</h2>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: P.muted, padding: 4 }}>
          <X size={20} />
        </button>
      </div>
      {children}
    </div>
  );
}
