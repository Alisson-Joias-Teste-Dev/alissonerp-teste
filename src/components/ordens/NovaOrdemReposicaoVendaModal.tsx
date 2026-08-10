"use client";

import NovaOrdemVendaBaseModal from "@/components/ordens/NovaOrdemVendaBaseModal";

export interface NovaOrdemReposicaoVendaModalProps {
  isOpen:     boolean;
  onClose:    () => void;
  onSuccess?: (numeroOrdem: string) => void;
  userId:     string;
  userName:   string;
}

export default function NovaOrdemReposicaoVendaModal(props: NovaOrdemReposicaoVendaModalProps) {
  return <NovaOrdemVendaBaseModal {...props} tipoOrdem="reposicao_venda" />;
}
