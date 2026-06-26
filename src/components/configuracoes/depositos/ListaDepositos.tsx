"use client";

import { useState } from "react";
import {
  Warehouse,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  Plus,
} from "lucide-react";
import { Button, Spinner, StatusBadge } from "@/components/ui";
import FormularioSetor from "./FormularioSetor";

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

interface SetorItem {
  id: number;
  nome: string;
  deposito_id: number | null;
  ativo: boolean;
}

interface ListaDepositosProps {
  depositos: DepositoItem[];
  setores: SetorItem[];
  loading: boolean;
  onToggleDeposito: (dep: DepositoItem) => void;
  onEditDeposito: (dep: DepositoItem) => void;
  onToggleSetor: (s: SetorItem) => void;
  // Sector form state
  showSetorForm: number | null;
  setShowSetorForm: (id: number | null) => void;
  editingSetor: SetorItem | null;
  setEditingSetor: (s: SetorItem | null) => void;
  savingSetor: boolean;
  onSalvarSetor: (depositoId: number, nome: string) => Promise<void>;
}

export default function ListaDepositos({
  depositos,
  setores,
  loading,
  onToggleDeposito,
  onEditDeposito,
  onToggleSetor,
  showSetorForm,
  setShowSetorForm,
  editingSetor,
  setEditingSetor,
  savingSetor,
  onSalvarSetor,
}: ListaDepositosProps) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8" style={{ color: P.sage }}>
        <Spinner size={16} /> Carregando...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {depositos.map(dep => {
        const depSetores = setores.filter(s => s.deposito_id === dep.id);
        const isOpen = expanded === dep.id;

        return (
          <div key={dep.id} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${P.border}` }}>
            {/* Linha do depósito */}
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer"
              style={{ backgroundColor: isOpen ? P.card : P.bg }}
              onClick={() => setExpanded(isOpen ? null : dep.id)}
            >
              {isOpen ? (
                <ChevronDown size={14} style={{ color: P.sage }} />
              ) : (
                <ChevronRight size={14} style={{ color: P.muted }} />
              )}
              <Warehouse size={14} style={{ color: dep.ativo ? P.sage : P.muted }} />
              <span className="flex-1 text-sm font-medium" style={{ color: dep.ativo ? P.creme : P.muted }}>
                {dep.nome}
              </span>
              <StatusBadge ativo={dep.ativo} />
              <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                <Button variant="ghost" size="sm" title="Editar" onClick={() => onEditDeposito(dep)}>
                  <Pencil size={12} />
                </Button>
                {dep.id !== 1 && (
                  <Button variant="ghost" size="sm" title={dep.ativo ? "Desativar" : "Ativar"} onClick={() => onToggleDeposito(dep)}>
                    <Trash2 size={12} />
                  </Button>
                )}
              </div>
            </div>

            {/* Setores do depósito (expandido) */}
            {isOpen && (
              <div className="px-4 pb-3 space-y-2" style={{ borderTop: `1px solid ${P.border}`, backgroundColor: P.card }}>
                <div className="flex items-center justify-between pt-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: P.muted }}>
                    Setores ({depSetores.length})
                  </span>
                  <Button variant="secondary" size="sm" onClick={() => { setShowSetorForm(dep.id); setEditingSetor(null); }}>
                    <Plus size={11} /> Novo Setor
                  </Button>
                </div>

                {/* Formulário setor (novo/editar) */}
                {showSetorForm === dep.id && (
                  <FormularioSetor
                    editingSetor={editingSetor}
                    saving={savingSetor}
                    onSalvar={async (nome) => {
                      await onSalvarSetor(dep.id, nome);
                    }}
                    onCancelar={() => {
                      setShowSetorForm(null);
                      setEditingSetor(null);
                    }}
                  />
                )}

                {depSetores.length === 0 ? (
                  <p className="text-[12px] py-1" style={{ color: P.muted }}>Nenhum setor vinculado.</p>
                ) : (
                  <div className="space-y-1">
                    {depSetores.map(s => (
                      <div
                        key={s.id}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg"
                        style={{ backgroundColor: P.bg }}
                      >
                        <span className="flex-1 text-[12px]" style={{ color: s.ativo ? P.creme : P.muted }}>
                          {s.nome}
                        </span>
                        <StatusBadge ativo={s.ativo} />
                        <Button variant="ghost" size="sm" title="Editar" onClick={() => {
                          setEditingSetor(s);
                          setShowSetorForm(dep.id);
                        }}>
                          <Pencil size={11} />
                        </Button>
                        <Button variant="ghost" size="sm" title={s.ativo ? "Desativar" : "Ativar"} onClick={() => onToggleSetor(s)}>
                          <Trash2 size={11} />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
