"use client";

import { useState, useEffect } from "react";
import { X, Save } from "lucide-react";
import { Button } from "@/components/ui";

const P = {
  bg:       "#f9fafb",
  card:     "#ffffff",
  border:   "#e5e7eb",
  creme:    "#111827",
  sage:     "#6b7280",
  muted:    "#9ca3af",
  dourado:  "#d97706",
  verde:    "#16a34a",
  vermelho: "#dc2626",
};

interface SetorItem {
  id: number;
  nome: string;
  deposito_id: number | null;
  ativo: boolean;
}

interface FormularioSetorProps {
  editingSetor: SetorItem | null;
  saving: boolean;
  onSalvar: (nome: string) => Promise<void>;
  onCancelar: () => void;
}

export default function FormularioSetor({
  editingSetor,
  saving,
  onSalvar,
  onCancelar,
}: FormularioSetorProps) {
  const [setorNome, setSetorNome] = useState("");

  useEffect(() => {
    if (editingSetor) setSetorNome(editingSetor.nome);
    else setSetorNome("");
  }, [editingSetor]);

  return (
    <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: P.bg, border: `1px solid ${P.border}` }}>
      <div className="flex items-center justify-between">
        <span className="text-[11px]" style={{ color: P.sage }}>
          {editingSetor ? "Editar Setor" : "Novo Setor"}
        </span>
        <button onClick={onCancelar}>
          <X size={12} style={{ color: P.muted }} />
        </button>
      </div>
      <input
        autoFocus
        type="text"
        value={setorNome}
        onChange={e => setSetorNome(e.target.value)}
        placeholder="Nome do setor..."
        className="w-full px-2 py-1.5 rounded-lg text-[12px] focus:outline-none"
        style={{ backgroundColor: P.card, border: `1px solid ${P.border}`, color: P.creme }}
        onKeyDown={e => e.key === "Enter" && onSalvar(setorNome)}
      />
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button variant="primary" size="sm" loading={saving} disabled={!setorNome.trim()} onClick={() => onSalvar(setorNome)}>
          <Save size={10} /> Salvar
        </Button>
      </div>
    </div>
  );
}
