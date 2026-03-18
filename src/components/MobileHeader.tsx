'use client';

import { Menu } from 'lucide-react';
import { useSidebar } from '@/contexts/SidebarContext';
import { useAuth } from '@/hooks/useAuth';
import UserAvatar from '@/components/UserAvatar';

export default function MobileHeader() {
  const { toggle } = useSidebar();
  const { nome, fotoUrl, user } = useAuth();

  return (
    <header
      className="block md:hidden fixed top-0 left-0 right-0 h-14 z-40 flex items-center justify-between px-4"
      style={{ backgroundColor: '#184036', borderBottom: '1px solid #0F2922' }}
    >
      {/* Botão hamburger */}
      <button
        onClick={toggle}
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

      {/* Avatar do usuário */}
      <UserAvatar
        nome={nome}
        fotoUrl={fotoUrl}
        size={32}
        userId={user?.id}
        clickable={false}
      />
    </header>
  );
}
