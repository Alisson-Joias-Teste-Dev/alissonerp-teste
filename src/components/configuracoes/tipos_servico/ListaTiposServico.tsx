"use client";

import {
  Save,
  Pencil,
  CheckCircle,
  X,
} from "lucide-react";
import { Button, Toggle, StatusBadge, MessageBox } from "@/components/ui";

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

interface TipoServico {
  id: number;
  nome: string;
  ativo: boolean;
  created_at: string;
}

interface ListaTiposServicoProps {
  tipos: TipoServico[];
  erro?: string;
  editandoId: number | null;
  setEditandoId: (id: number | null) => void;
  editNome: string;
  setEditNome: (v: string) => void;
  salvandoId: number | null;
  savedId: number | null;
  onEditar: (id: number, nome: string) => void;
  onToggleAtivo: (t: TipoServico) => void;
}

export default function ListaTiposServico({
  tipos,
  erro,
  editandoId,
  setEditandoId,
  editNome,
  setEditNome,
  salvandoId,
  savedId,
  onEditar,
  onToggleAtivo,
}: ListaTiposServicoProps) {
  return (
    <>
      {/* Erro geral */}
      {erro && (
        <MessageBox tipo="erro" mensagem={erro} onFechar={() => {}} />
      )}

      {/* Tabela */}
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${P.border}` }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: P.bg, borderBottom: `1px solid ${P.border}` }}>
              {["Nome", "Status", "Ações"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[10px] uppercase tracking-widest font-medium" style={{ color: P.muted }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tipos.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-sm" style={{ color: P.muted }}>
                  Nenhum tipo cadastrado
                </td>
              </tr>
            ) : (
              tipos.map(t => (
                <tr key={t.id} style={{ borderBottom: `1px solid ${P.bg}` }} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    {editandoId === t.id ? (
                      <input
                        type="text"
                        value={editNome}
                        onChange={e => setEditNome(e.target.value)}
                        className="border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-[#184036] w-full max-w-xs"
                        style={{ borderColor: P.border, color: P.creme }}
                        autoFocus
                        onKeyDown={e => { if (e.key === "Enter") onEditar(t.id, editNome); if (e.key === "Escape") setEditandoId(null); }}
                      />
                    ) : (
                      <span className="font-medium" style={{ color: P.creme }}>
                        {t.nome}
                        {savedId === t.id && (
                          <span className="ml-2 text-xs" style={{ color: P.verde }}>
                            <CheckCircle size={12} className="inline" /> Salvo
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge ativo={t.ativo} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {editandoId === t.id ? (
                        <>
                          <Button variant="primary" size="sm" loading={salvandoId === t.id} onClick={() => onEditar(t.id, editNome)}>
                            <Save size={11} /> Salvar
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setEditandoId(null)}>
                            <X size={11} /> Cancelar
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => { setEditandoId(t.id); setEditNome(t.nome); }}>
                            <Pencil size={11} /> Editar
                          </Button>
                          <Button
                            variant={t.ativo ? "danger" : "primary"}
                            size="sm"
                            loading={salvandoId === t.id}
                            onClick={() => onToggleAtivo(t)}
                          >
                            {t.ativo ? "Desativar" : "Ativar"}
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
