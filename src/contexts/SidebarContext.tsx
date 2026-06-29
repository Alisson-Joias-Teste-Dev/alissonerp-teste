"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface SidebarContextType {
  aberta: boolean;
  setAberta: (v: boolean) => void;
  toggle: () => void;
  isExpanded: boolean;
  isMobileOpen: boolean;
  isHovered: boolean;
  toggleSidebar: () => void;
  toggleMobileSidebar: () => void;
  setIsHovered: (v: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType>({
  aberta: false, setAberta: () => {}, toggle: () => {},
  isExpanded: true, isMobileOpen: false, isHovered: false,
  toggleSidebar: () => {}, toggleMobileSidebar: () => {}, setIsHovered: () => {},
});

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [aberta, setAberta] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setIsMobileOpen(false);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const toggleSidebar = () => setIsExpanded(prev => !prev);
  const toggleMobileSidebar = () => setIsMobileOpen(prev => !prev);

  return (
    <SidebarContext.Provider value={{
      aberta, setAberta, toggle: () => setAberta(v => !v),
      isExpanded: isMobile ? false : isExpanded,
      isMobileOpen, isHovered,
      toggleSidebar, toggleMobileSidebar, setIsHovered,
    }}>
      {children}
    </SidebarContext.Provider>
  );
}

export const useSidebar = () => useContext(SidebarContext);
