"use client";

import { Smartphone, Pencil } from "lucide-react";
import { Button, Badge, StatusBadge } from "@/components/ui";
import FormularioDispositivo from "./FormularioDispositivo";

// ─── Paleta ───────────────────────────────────────────────────────────────────
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

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Vendedor {
  id_vendedor: number;
  nome: string;
}

interface MaqDevice {
  id: number;
  device_id: string;
  nome_legivel: string;
  vendedor_id: number | null;
  is_reserva: boolean;
  ativo: boolean;
  loja: string | null;
  parcelas_padrao_mp: number;
}

interface ListaDispositivosProps {
  devices: MaqDevice[];
  vendedores: Vendedor[];
  editandoId: number | null;
  editNome: string;
  setEditNome: (v: string) => void;
  editLoja: string;
  setEditLoja: (v: string) => void;
  editVendedorId: string;
  setEditVendedorId: (v: string) => void;
  editIsReserva: boolean;
  setEditIsReserva: (v: boolean) => void;
  editAtivo: boolean;
  setEditAtivo: (v: boolean) => void;
  editParcelasPadrao: number;
  setEditParcelasPadrao: (v: number) => void;
  saving: boolean;
  saveErro: string | null;
  onEdit: (d: MaqDevice) => void;
  onSave: (id: number) => void;
  onCancel: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function nomeVendedor(id: number | null, vendedores: Vendedor[]) {
  if (id == null) return "—";
  return vendedores.find(v => v.id_vendedor === id)?.nome ?? String(id);
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function ListaDispositivos({
  devices,
  vendedores,
  editandoId,
  editNome,
  setEditNome,
  editLoja,
  setEditLoja,
  editVendedorId,
  setEditVendedorId,
  editIsReserva,
  setEditIsReserva,
  editAtivo,
  setEditAtivo,
  editParcelasPadrao,
  setEditParcelasPadrao,
  saving,
  saveErro,
  onEdit,
  onSave,
  onCancel,
}: ListaDispositivosProps) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${P.border}` }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ backgroundColor: P.bg, borderBottom: `1px solid ${P.border}` }}>
            {["Nome Legível", "Device ID", "Vendedor Atribuído", "Reserva da Loja", "Status", "Ações"].map(h => (
              <th
                key={h}
                className="px-4 py-3 text-left text-[10px] uppercase tracking-widest font-medium"
                style={{ color: P.muted }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {devices.map(d => {
            if (editandoId === d.id) {
              return (
                <FormularioDispositivo
                  key={d.id}
                  device={d}
                  vendedores={vendedores}
                  editNome={editNome}
                  setEditNome={setEditNome}
                  editLoja={editLoja}
                  setEditLoja={setEditLoja}
                  editVendedorId={editVendedorId}
                  setEditVendedorId={setEditVendedorId}
                  editIsReserva={editIsReserva}
                  setEditIsReserva={setEditIsReserva}
                  editAtivo={editAtivo}
                  setEditAtivo={setEditAtivo}
                  editParcelasPadrao={editParcelasPadrao}
                  setEditParcelasPadrao={setEditParcelasPadrao}
                  saving={saving}
                  saveErro={saveErro}
                  onSave={onSave}
                  onCancel={onCancel}
                />
              );
            }

            return (
              <tr key={d.id} className="border-t" style={{ borderColor: P.border }}>
                {/* Nome Legível */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Smartphone size={13} style={{ color: P.sage }} />
                    <span className="font-medium" style={{ color: P.creme }}>{d.nome_legivel}</span>
                  </div>
                </td>

                {/* Device ID */}
                <td className="px-4 py-3">
                  <span className="font-mono text-[11px] break-all" style={{ color: P.muted }}>
                    {d.device_id}
                  </span>
                </td>

                {/* Vendedor Atribuído */}
                <td className="px-4 py-3">
                  <div>
                    <span style={{ color: d.vendedor_id ? P.creme : P.muted }}>
                      {nomeVendedor(d.vendedor_id, vendedores)}
                    </span>
                    {d.vendedor_id && d.parcelas_padrao_mp > 1 && (
                      <span className="block text-[10px] mt-0.5" style={{ color: P.muted }}>
                        {d.parcelas_padrao_mp}x padrão
                      </span>
                    )}
                  </div>
                </td>

                {/* Reserva da Loja */}
                <td className="px-4 py-3">
                  <Badge color={d.is_reserva ? "dourado" : "neutral"}>
                    {d.is_reserva ? "Sim" : "Não"}
                  </Badge>
                </td>

                {/* Status */}
                <td className="px-4 py-3">
                  <StatusBadge ativo={d.ativo} />
                </td>

                {/* Ações */}
                <td className="px-4 py-3">
                  <Button variant="ghost" size="sm" onClick={() => onEdit(d)}>
                    <Pencil size={11} /> Editar
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
