"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import Sidebar from "@/components/Sidebar";
import MobileHeader from "@/components/MobileHeader";
import { SidebarProvider } from "@/contexts/SidebarContext";
import ServiceLayout from "@/components/layout/ServiceLayout";
import ServiceApp from "@/components/service/ServiceApp";
import GlobalErrorToast from "@/components/ui/GlobalErrorToast";
import MencaoAlarme from "@/components/MencaoAlarme";
import ReservaAlarme from "@/components/ReservaAlarme";
import VencidosAlarme from "@/components/VencidosAlarme";
import InstallPrompt from "@/components/InstallPrompt";
import EnvironmentBadge from "@/components/EnvironmentBadge";
import { Toaster } from "sonner";

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const { loading, isOperadorService } = useAuth();
  const pathname = usePathname();

  // Enquanto carrega, renderiza shell mínimo (evita flash de sidebar)
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FAFAF7" }}>
        <div className="w-6 h-6 rounded-full border-2 border-[#184036] border-t-transparent animate-spin" />
      </div>
    );
  }

  // Ordem de detecção:
  // 1. loading → spinner (acima)
  // 2. pathname === '/service' && isOperadorService → ServiceLayout + ServiceApp
  // 3. demais → layout ERP normal (Sidebar + main)
  if (pathname === "/service" && isOperadorService) {
    return (
      <ServiceLayout>
        <ServiceApp />
        <GlobalErrorToast />
        <EnvironmentBadge />
        <Toaster position="top-right" richColors closeButton />
      </ServiceLayout>
    );
  }

  // Todas as roles → layout padrão com sidebar (motoboy vê só "Protocolo")
  return (
    <SidebarProvider>
      <MobileHeader />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 md:ml-56 mt-14 md:mt-0 min-h-screen" style={{ backgroundColor: "#FAFAF7" }}>
          {children}
        </main>
      </div>
      {/* Alarme de menções aguardando resposta (som + banner global) */}
      <MencaoAlarme />
      {/* Faixa global de reservas (crediário ③) perto de virar vale-crédito */}
      <ReservaAlarme />
      {/* Faixa global de contas VENCIDAS do crediário (em toda a tela) */}
      <VencidosAlarme />
      {/* Toast de erros global — visível em todas as páginas */}
      <GlobalErrorToast />
      {/* Banner de instalação PWA — só aparece em browsers que disparam beforeinstallprompt */}
      <InstallPrompt />
      <EnvironmentBadge />
      <Toaster position="top-right" richColors closeButton />
    </SidebarProvider>
  );
}
