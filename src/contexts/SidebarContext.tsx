'use client';
import { createContext, useContext, useState, ReactNode } from 'react';

interface SidebarContextType {
  aberta: boolean;
  setAberta: (v: boolean) => void;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarContextType>({
  aberta: false,
  setAberta: () => {},
  toggle: () => {},
});

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [aberta, setAberta] = useState(false);
  return (
    <SidebarContext.Provider value={{ aberta, setAberta, toggle: () => setAberta(v => !v) }}>
      {children}
    </SidebarContext.Provider>
  );
}

export const useSidebar = () => useContext(SidebarContext);
