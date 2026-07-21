"use client";

import { useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Info,
  Antenna,
  Cpu,
  RefreshCw,
  RotateCcw,
  Target,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useCalibracao } from "@/hooks/rfid/useCalibracao";
import { useImpressora } from "@/hooks/rfid/useImpressora";

const checklistItems = [
  "Rolo RFID carregado na impressora",
  "Impressora calibrada de comprimento (mídia)",
  "Deixar etiquetas antes e depois da área de calibração",
];

interface TileCalibracaoProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

function TileCalibracao({ icon, label, value }: TileCalibracaoProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-semibold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

/**
 * Painel de calibração da etiqueta RFID para impressora ZD500R.
 *
 * Usa useCalibracao e useImpressora hooks internamente. Envia comando ^HR
 * via Browser Print para calibrar posição de programação, antena e potências.
 */
export function PainelCalibracao() {
  const { calibrar, resultado, isCalibrating, error } = useCalibracao();
  const { device, status } = useImpressora();
  const [calibrado, setCalibrado] = useState(!!resultado);

  const handleCalibrar = async () => {
    if (!device) {
      toast.error("Nenhuma impressora conectada. Conecte a ZD500R primeiro.");
      return;
    }

    try {
      const res = await calibrar(device);
      if (res.sucesso) {
        setCalibrado(true);
        toast.success("Calibração concluída com sucesso!");
      } else {
        toast.error("Calibração falhou. Verifique as etiquetas e tente novamente.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido na calibração";
      toast.error(msg);
    }
  };

  const handleRestaurarPadrao = async () => {
    if (!device) {
      toast.error("Nenhuma impressora conectada.");
      return;
    }

    try {
      toast.info("Restaurando padrão de fábrica...");
      const { enviarComando } = await import("@/lib/rfid/browser-print");
      const zpl = "^XA\n^JUF\n^XZ";
      await enviarComando(device, zpl);
      setCalibrado(false);
      toast.success("Padrão de fábrica restaurado. Recalibre a etiqueta.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao restaurar padrão";
      toast.error(msg);
    }
  };

  const impressoraIndisponivel = status !== "conectado" || !device;

  return (
    <Card title="Calibração da Etiqueta RFID" className="space-y-6">
      {/* Subtítulo */}
      <p className="text-sm text-gray-500">
        Posiciona o inlay sobre a antena para gravação
      </p>

      {/* Checklist estática */}
      <div className="space-y-2 rounded-xl border border-gray-100 bg-gray-50 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Pré-requisitos
        </p>
        <ul className="space-y-1.5">
          {checklistItems.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
              <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-500" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Botões de ação */}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="primary"
          size="md"
          loading={isCalibrating}
          disabled={impressoraIndisponivel}
          startIcon={isCalibrating ? undefined : <Target size={16} />}
          onClick={handleCalibrar}
        >
          {isCalibrating ? "Calibrando... (pode levar alguns minutos)" : "Calibrar etiqueta"}
        </Button>

        {calibrado && (
          <>
            <Button
              variant="outline"
              size="md"
              disabled={impressoraIndisponivel}
              startIcon={<RefreshCw size={16} />}
              onClick={handleCalibrar}
            >
              Calibrar de novo
            </Button>
            <Button
              variant="ghost"
              size="md"
              disabled={impressoraIndisponivel}
              startIcon={<RotateCcw size={16} />}
              onClick={handleRestaurarPadrao}
            >
              Restaurar padrão de fábrica
            </Button>
          </>
        )}
      </div>

      {/* Resultado da calibração */}
      {resultado && calibrado && (
        <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600" />
            <p className="text-sm font-semibold text-emerald-800">
              Calibração bem-sucedida
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {resultado.posicao && (
              <TileCalibracao
                icon={<Target size={18} />}
                label="Posição"
                value={`B${resultado.posicao} mm`}
              />
            )}
            {resultado.antena && (
              <TileCalibracao
                icon={<Antenna size={18} />}
                label="Antena"
                value={resultado.antena}
              />
            )}
            {resultado.readPower !== null && (
              <TileCalibracao
                icon={<Zap size={18} />}
                label="Potência leitura"
                value={String(resultado.readPower)}
              />
            )}
            {resultado.writePower !== null && (
              <TileCalibracao
                icon={<Zap size={18} />}
                label="Potência gravação"
                value={String(resultado.writePower)}
              />
            )}
            {resultado.tidInfo && (
              <TileCalibracao
                icon={<Cpu size={18} />}
                label="Chip detectado"
                value={resultado.tidInfo}
              />
            )}
          </div>
        </div>
      )}

      {/* Erro */}
      {error && !isCalibrating && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-500" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-red-800">Erro na calibração</p>
            <p className="mt-0.5 text-sm text-red-700">{error.message}</p>
          </div>
        </div>
      )}

      {/* Aviso do firmware */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <Info size={16} className="mt-0.5 shrink-0 text-amber-600" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-800">
            Atenção: Firmware V74.19.6Z
          </p>
          <p className="mt-0.5 text-sm text-amber-700">
            Recalibrar o comprimento da mídia redefine a posição de programação
            RFID. Após calibrar o comprimento, execute novamente esta calibração
            RFID na ZD500R.
          </p>
        </div>
      </div>
    </Card>
  );
}
