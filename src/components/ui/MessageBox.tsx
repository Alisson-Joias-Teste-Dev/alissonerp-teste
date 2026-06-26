import { CheckCircle, AlertTriangle, X } from "lucide-react";

interface Props {
  tipo: "ok" | "erro" | "info";
  mensagem: string;
  onFechar?: () => void;
}

const config = {
  ok:   { bg: "#ECFDF5", color: "#065F46", border: "#A7F3D0", Icon: CheckCircle },
  erro: { bg: "#FEF2F2", color: "#DC2626", border: "#FECACA", Icon: AlertTriangle },
  info: { bg: "#EFF6FF", color: "#1D4ED8", border: "#BFDBFE", Icon: AlertTriangle },
};

export default function MessageBox({ tipo, mensagem, onFechar }: Props) {
  const c = config[tipo];
  return (
    <div
      className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm"
      style={{ backgroundColor: c.bg, color: c.color, border: `1px solid ${c.border}` }}
    >
      <c.Icon size={14} className="shrink-0" />
      <span className="flex-1">{mensagem}</span>
      {onFechar && (
        <button onClick={onFechar} className="shrink-0 opacity-60 hover:opacity-100">
          <X size={14} />
        </button>
      )}
    </div>
  );
}
