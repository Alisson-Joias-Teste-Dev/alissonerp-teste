"use client";

import NovaOrdemServicoBaseModal from "@/components/ordens/NovaOrdemServicoBaseModal";

export interface NovaOrdemGarantiaModalProps {
  isOpen:     boolean;
  onClose:    () => void;
  onSuccess?: (numeroOrdem: string) => void;
  userId:     string;
  userName:   string;
}

export default function NovaOrdemGarantiaModal(props: NovaOrdemGarantiaModalProps) {
  return <NovaOrdemServicoBaseModal {...props} tipoOrdem="garantia" />;
}
