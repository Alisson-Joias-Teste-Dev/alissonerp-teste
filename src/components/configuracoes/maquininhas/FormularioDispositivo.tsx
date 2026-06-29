"use client";

import { Save, X, Smartphone } from "lucide-react";
import { Button, Toggle, Spinner } from "@/components/ui";

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

interface FormularioDispositivoProps {
  device: MaqDevice;
  vendedores: Vendedor[];
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
  onSave: (id: number) => void;
  onCancel: () => void;
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function FormularioDispositivo({
  device,
  vendedores,
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
  onSave,
  onCancel,
}: FormularioDispositivoProps) {
  return (
    <tr key={device.id} className="border-t" style={{ borderColor: P.border }}>
      {/* Nome Legível */}
      <td className="px-4 py-3">
        <input
          value={editNome}
          onChange={e => setEditNome(e.target.value)}
          className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none"
          style={{ borderColor: P.border, color: P.creme }}
        />
      </td>

      {/* Device ID */}
      <td className="px-4 py-3">
        <span className="font-mono text-[11px] break-all" style={{ color: P.muted }}>
          {device.device_id}
        </span>
      </td>

      {/* Vendedor Atribuído */}
      <td className="px-4 py-3">
        <div className="space-y-2">
          <select
            value={editVendedorId}
            onChange={e => {
              setEditVendedorId(e.target.value);
              if (e.target.value) setEditIsReserva(false);
            }}
            className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none"
            style={{ borderColor: P.border, color: P.creme }}
          >
            <option value="">— Nenhum / Reserva</option>
            {vendedores.map(v => (
              <option key={v.id_vendedor} value={v.id_vendedor}>
                {v.nome}
              </option>
            ))}
          </select>
          {/* Campo parcelas padrão — só habilitado quando há vendedor selecionado */}
          <div>
            <label
              className="text-[10px] uppercase tracking-wider block mb-1"
              style={{ color: editVendedorId ? P.muted : P.muted + "80" }}
            >
              Parcelas padrão
            </label>
            <select
              value={editParcelasPadrao}
              disabled={!editVendedorId}
              onChange={e => setEditParcelasPadrao(Number(e.target.value))}
              className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none disabled:opacity-40"
              style={{ borderColor: P.border, color: P.creme }}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
                <option key={n} value={n}>{n}x</option>
              ))}
            </select>
          </div>
        </div>
      </td>

      {/* Reserva da Loja */}
      <td className="px-4 py-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={editIsReserva}
            disabled={!!editVendedorId}
            onChange={e => setEditIsReserva(e.target.checked)}
            className="rounded"
          />
          <span className="text-xs" style={{ color: editVendedorId ? P.muted : P.creme }}>
            Reserva
          </span>
        </label>
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Toggle ativo={editAtivo} onChange={setEditAtivo} />
          <span className="text-xs" style={{ color: editAtivo ? P.verde : P.muted }}>
            {editAtivo ? "Ativo" : "Inativo"}
          </span>
        </div>
      </td>

      {/* Ações */}
      <td className="px-4 py-3">
        <div className="space-y-1">
          {saveErro && (
            <p className="text-[11px]" style={{ color: P.vermelho }}>{saveErro}</p>
          )}
          <div className="flex items-center gap-1">
            <Button variant="primary" size="sm" loading={saving} onClick={() => onSave(device.id)}>
              <Save size={11} /> Salvar
            </Button>
            <Button variant="outline" size="sm" onClick={onCancel}>
              <X size={11} /> Cancelar
            </Button>
          </div>
        </div>
      </td>
    </tr>
  );
}
