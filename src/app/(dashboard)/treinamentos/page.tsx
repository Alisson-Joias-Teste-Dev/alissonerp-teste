import Link from "next/link";
import { GraduationCap, ArrowRight, PackageOpen, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

const C = { esmeralda: "#184036", creme: "#F3EADA", cremeBorder: "#E8DCC8", cremeBg: "#FAFAF7" };

/**
 * Central de Treinamentos — página de documentação/onboarding do sistema.
 * Lista os treinamentos disponíveis. Cada treinamento tem sua própria página
 * com simulador automático + passo a passo. Começa por Movimentação Interna.
 * Acessível a qualquer usuário logado (não gateado por módulo).
 */
const TREINAMENTOS: {
  href: string; titulo: string; desc: string; publico: string; disponivel: boolean;
}[] = [
  {
    href: "/treinamentos/movimentacao-interna",
    titulo: "Movimentação Interna",
    desc: "Como solicitar uma peça, entregar, receber e finalizar (cliente levou ou voltou ao estoque).",
    publico: "Consultoras e estoque",
    disponivel: true,
  },
];

const EM_BREVE = ["Crediário", "Vendas / PDV", "Protocolo (Loja ↔ Fábrica)", "Conferência"];

export default function TreinamentosPage() {
  return (
    <div className="px-3 md:px-6 py-4 md:py-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#18403612", color: C.esmeralda }}>
          <GraduationCap size={22} />
        </div>
        <div>
          <h2 className="text-xl md:text-2xl font-semibold" style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}>
            Central de Treinamentos
          </h2>
          <p className="text-sm mt-0.5" style={{ color: "#6B7280" }}>
            Aprenda a usar cada módulo do sistema, no seu ritmo.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {TREINAMENTOS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="group rounded-2xl border bg-white p-5 transition-shadow hover:shadow-md flex flex-col"
            style={{ borderColor: C.cremeBorder }}
          >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3" style={{ backgroundColor: C.esmeralda, color: C.creme }}>
              <PackageOpen size={18} />
            </div>
            <h3 className="text-base font-semibold" style={{ color: "#111827" }}>{t.titulo}</h3>
            <p className="text-sm mt-1 flex-1" style={{ color: "#6B7280" }}>{t.desc}</p>
            <div className="flex items-center justify-between mt-3">
              <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ backgroundColor: C.cremeBg, color: "#6B7280" }}>{t.publico}</span>
              <span className="flex items-center gap-1 text-sm font-medium transition-transform group-hover:translate-x-0.5" style={{ color: C.esmeralda }}>
                Abrir <ArrowRight size={14} />
              </span>
            </div>
          </Link>
        ))}

        {EM_BREVE.map((nome) => (
          <div key={nome} className="rounded-2xl border p-5 flex flex-col opacity-70" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3" style={{ backgroundColor: "#E5E7EB", color: "#9CA3AF" }}>
              <Clock size={18} />
            </div>
            <h3 className="text-base font-semibold" style={{ color: "#6B7280" }}>{nome}</h3>
            <p className="text-sm mt-1 flex-1" style={{ color: "#9CA3AF" }}>Treinamento em preparação.</p>
            <span className="text-[11px] px-2 py-0.5 rounded-full self-start mt-3" style={{ backgroundColor: "#EEF0EE", color: "#9CA3AF" }}>Em breve</span>
          </div>
        ))}
      </div>
    </div>
  );
}
