"use client";

import { useState, useEffect } from "react";
import { X, Save } from "lucide-react";
import { Button, Spinner, MessageBox } from "@/components/ui";

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

interface DepositoItem {
  id: number;
  nome: string;
  tipo: string;
  ativo: boolean;
}

interface FormularioDepositoProps {
  editingDep: DepositoItem | null;
  saving: boolean;
  erro: string;
  onSalvar: (nome: string) => Promise<void>;
  onCancelar: () => void;
}

export default function FormularioDeposito({
  editingDep,
  saving,
  erro,
  onSalvar,
  onCancelar,
}: FormularioDepositoProps) {
  const [depNome, setDepNome] = useState("");

  useEffect(() => {
    if (editingDep) setDepNome(editingDep.nome);
    else setDepNome("");
  }, [editingDep]);

  return (
    <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: P.card, border: `1px solid ${P.border}` }}>
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold" style={{ color: P.sage }}>
          {editingDep ? "Editar Depósito" : "Novo Depósito"}
        </span>
        <button onClick={onCancelar}>
          <X size={14} style={{ color: P.muted }} />
        </button>
      </div>
      <input
        autoFocus
        type="text"
        value={depNome}
        onChange={e => setDepNome(e.target.value)}
        placeholder="Nome do depósito..."
        className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
        style={{ backgroundColor: P.bg, border: `1px solid ${P.border}`, color: P.creme }}
        onKeyDown={e => e.key === "Enter" && onSalvar(depNome)}
      />
      {erro && (
        <MessageBox tipo="erro" mensagem={erro} onFechar={() => {}} />
      )}
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button variant="primary" size="sm" loading={saving} disabled={!depNome.trim()} onClick={() => onSalvar(depNome)}>
          <Save size={12} /> Salvar
        </Button>
      </div>
    </div>
  );
}
