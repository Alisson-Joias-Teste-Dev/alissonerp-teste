"use client";

import NovaOrdemServicoBaseModal from "@/components/ordens/NovaOrdemServicoBaseModal";

export interface NovaOrdemServicoVendaModalProps {
  isOpen:     boolean;
  onClose:    () => void;
  onSuccess?: (numeroOrdem: string) => void;
  userId:     string;
  userName:   string;
}

export default function NovaOrdemServicoVendaModal(props: NovaOrdemServicoVendaModalProps) {
  return <NovaOrdemServicoBaseModal {...props} tipoOrdem="servico_venda" />;
}
