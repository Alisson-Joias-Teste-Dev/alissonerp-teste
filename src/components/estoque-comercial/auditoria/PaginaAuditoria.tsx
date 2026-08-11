"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, ClipboardCheck } from "lucide-react";
import AuditoriaLista from "./AuditoriaLista";
import AuditoriaDetalhe from "./AuditoriaDetalhe";

export default function PaginaAuditoria() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const auditoriaId = searchParams.get("id");

  if (auditoriaId) {
    return <AuditoriaDetalhe auditoriaId={Number(auditoriaId)} />;
  }

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push("/estoque-comercial")} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          <ArrowLeft size={15} /> Estoque Comercial
        </button>
        <span className="text-gray-300">|</span>
        <ClipboardCheck size={18} className="text-gray-700" />
        <div>
          <h1 className="text-xl font-semibold tracking-wide text-gray-800">Auditoria de Estoque</h1>
          <p className="text-xs mt-0.5 text-gray-500">Registro de divergências — contagem física vs. sistema</p>
        </div>
      </div>
      <AuditoriaLista />
    </div>
  );
}
