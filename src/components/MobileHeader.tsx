'use client';

import { useEffect, useState } from 'react';
import { Menu, Download } from 'lucide-react';
import { useSidebar } from '@/contexts/SidebarContext';
import { useAuth } from '@/hooks/useAuth';
import UserAvatar from '@/components/UserAvatar';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Captura o evento antes do React montar (igual ao InstallPrompt)
let _headerDeferredPrompt: BeforeInstallPromptEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _headerDeferredPrompt = e as BeforeInstallPromptEvent;
  });
}

export default function MobileHeader() {
  const { toggleMobileSidebar } = useSidebar();
  const { nome, fotoUrl, user } = useAuth();
  const [podeInstalar, setPodeInstalar] = useState(false);
  const [instalando, setInstalando] = useState(false);

  useEffect(() => {
    // Já instalado como PWA? Não mostra botão
    const jaInstalado = window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (jaInstalado) return;

    // Evento já foi capturado?
    if (_headerDeferredPrompt) {
      setPodeInstalar(true);
      return;
    }

    // Fica escutando caso ainda não tenha disparado
    const handler = (e: Event) => {
      e.preventDefault();
      _headerDeferredPrompt = e as BeforeInstallPromptEvent;
      setPodeInstalar(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function handleInstalar() {
    if (!_headerDeferredPrompt) return;
    setInstalando(true);
    try {
      await _headerDeferredPrompt.prompt();
      const { outcome } = await _headerDeferredPrompt.userChoice;
      if (outcome === 'accepted') {
        _headerDeferredPrompt = null;
        setPodeInstalar(false);
      }
    } finally {
      setInstalando(false);
    }
  }

  return (
    <header
      className="block md:hidden fixed top-0 left-0 right-0 h-14 z-40 flex items-center justify-between px-4"
      style={{ backgroundColor: '#184036', borderBottom: '1px solid #0F2922' }}
    >
      {/* Botão hamburger */}
      <button
        onClick={toggleMobileSidebar}
        aria-label="Abrir menu"
        className="flex items-center justify-center rounded-lg p-1.5 transition-colors hover:bg-white/10"
      >
        <Menu size={24} className="text-white" />
      </button>

      {/* Logo / título */}
      <span
        className="text-white font-medium text-sm tracking-widest uppercase"
        style={{ fontFamily: 'var(--font-playfair)' }}
      >
        Alisson ERP
      </span>

      {/* Direita: botão instalar (quando disponível) + avatar */}
      <div className="flex items-center gap-2">
        {podeInstalar && (
          <button
            onClick={handleInstalar}
            disabled={instalando}
            aria-label="Instalar app"
            title="Instalar app"
            className="flex items-center justify-center rounded-lg p-1.5 transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            <Download size={20} className="text-white" />
          </button>
        )}
        <UserAvatar
          nome={nome}
          fotoUrl={fotoUrl}
          size={32}
          userId={user?.id}
          clickable={false}
        />
      </div>
    </header>
  );
}
