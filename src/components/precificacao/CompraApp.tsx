"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Gem, Lock, X, Calculator, ShoppingBag, Cloud, ArrowRightLeft,
} from "lucide-react";
import CalculatorTab from "./CalculatorTab";
import PurchaseTab from "./PurchaseTab";
import TradeInTab from "./TradeInTab";
import ConfigurationTab from "./ConfigurationTab";
import Toast from "./ui/Toast";
import { ConfirmModal, Modal } from "./ui/Modal";
import SyncModal from "./SyncModal";
import type {
  Category, ToastMessage, ToastType, AppConfig,
} from "@/types/precificacao";
import {
  loadConfig, saveConfig, saveGoldPrice,
  DEFAULT_PURCHASE_MIN, DEFAULT_PURCHASE_MAX, DEFAULT_PURCHASE_COMM_SPLIT,
  DEFAULT_GOLD_COST_PERCENTAGE, DEFAULT_RECEIVE_MIN, DEFAULT_RECEIVE_MAX,
} from "@/lib/precificacao/storage";
import { fetchConfigAction } from "@/app/(dashboard)/actions-precificacao";

interface CompraAppProps {
  goldPriceFromErp: number;
}

const CompraApp: React.FC<CompraAppProps> = ({ goldPriceFromErp }) => {
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const [goldPrice, setGoldPrice] = useState<string>(
    goldPriceFromErp > 0 ? goldPriceFromErp.toFixed(2) : "",
  );
  const [startMkp, setStartMkp] = useState<number>(3.5);
  const [startCommission, setStartCommission] = useState<number>(5.0);

  const [goldCostPercentage, setGoldCostPercentage] = useState<number>(DEFAULT_GOLD_COST_PERCENTAGE);
  const [receiveMin, setReceiveMin] = useState<number>(DEFAULT_RECEIVE_MIN);
  const [receiveMax, setReceiveMax] = useState<number>(DEFAULT_RECEIVE_MAX);

  const [purchaseMin, setPurchaseMin] = useState<number>(DEFAULT_PURCHASE_MIN);
  const [purchaseMax, setPurchaseMax] = useState<number>(DEFAULT_PURCHASE_MAX);
  const [purchaseCommSplit, setPurchaseCommSplit] = useState<number>(DEFAULT_PURCHASE_COMM_SPLIT);

  const [categories, setCategories] = useState<Category[]>([]);

  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [activeTab, setActiveTab] = useState<"sales" | "purchase" | "receive">("sales");
  const [passwordAttempt, setPasswordAttempt] = useState("");

  const [isConfigFullScreen, setIsConfigFullScreen] = useState(false);

  const isInitializing = useRef(true);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => void;
  }>({ isOpen: false, title: "", message: "", action: () => {} });

  const showToast = (message: string, type: ToastType = "info") => {
    setToast({ id: Date.now().toString(), message, type });
  };

  const handleCloudConfigLoad = (config: AppConfig) => {
    const val = (v: number | undefined, def: number) =>
      v !== undefined && v !== null ? v : def;

    setStartMkp(config.startMkp);
    setStartCommission(val(config.startCommission, 5.0));
    setCategories(config.categories);
    setPurchaseMin(val(config.purchaseMin, DEFAULT_PURCHASE_MIN));
    setPurchaseMax(val(config.purchaseMax, DEFAULT_PURCHASE_MAX));
    setPurchaseCommSplit(val(config.purchaseCommSplit, DEFAULT_PURCHASE_COMM_SPLIT));
    setGoldCostPercentage(val(config.goldCostPercentage, DEFAULT_GOLD_COST_PERCENTAGE));
    setReceiveMin(val(config.receiveMin, DEFAULT_RECEIVE_MIN));
    setReceiveMax(val(config.receiveMax, DEFAULT_RECEIVE_MAX));

    // Gold price: prioriza ERP (prop) sobre backup
    if (goldPriceFromErp > 0) {
      setGoldPrice(goldPriceFromErp.toFixed(2));
      saveGoldPrice(goldPriceFromErp.toFixed(2));
    } else if (config.goldPrice) {
      setGoldPrice(config.goldPrice);
      saveGoldPrice(config.goldPrice);
    }

    saveConfig(
      config.startMkp,
      val(config.startCommission, 5.0),
      config.categories,
      val(config.purchaseMin, DEFAULT_PURCHASE_MIN),
      val(config.purchaseMax, DEFAULT_PURCHASE_MAX),
      val(config.purchaseCommSplit, DEFAULT_PURCHASE_COMM_SPLIT),
      val(config.goldCostPercentage, DEFAULT_GOLD_COST_PERCENTAGE),
      val(config.receiveMin, DEFAULT_RECEIVE_MIN),
      val(config.receiveMax, DEFAULT_RECEIVE_MAX),
    );
  };

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // 1. Load Local Storage
        const config = loadConfig();
        if (config) {
          setStartMkp(config.startMkp);
          setStartCommission(config.startCommission);
          setCategories(config.categories);
          setPurchaseMin(config.purchaseMin);
          setPurchaseMax(config.purchaseMax);
          setPurchaseCommSplit(config.purchaseCommSplit);
          setGoldCostPercentage(config.goldCostPercentage);
          setReceiveMin(config.receiveMin);
          setReceiveMax(config.receiveMax);
        }

        // Gold price vem do ERP (prop)
        if (goldPriceFromErp > 0) {
          setGoldPrice(goldPriceFromErp.toFixed(2));
          saveGoldPrice(goldPriceFromErp.toFixed(2));
        }

        // 2. Load Cloud (server action)
        const cloudConfig = await fetchConfigAction();
        if (cloudConfig) {
          handleCloudConfigLoad(cloudConfig);
          showToast("Sincronizado com o ERP", "success");
        } else {
          showToast("Dados locais carregados", "success");
        }
      } catch (e) {
        console.error("Erro na inicialização", e);
        showToast("Erro ao conectar no ERP", "error");
      } finally {
        setTimeout(() => {
          isInitializing.current = false;
        }, 2000);
      }
    };

    initializeApp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenCloudModal = () => {
    setIsSyncModalOpen(true);
  };

  const handleSaveConfig = () => {
    saveConfig(
      startMkp, startCommission, categories,
      purchaseMin, purchaseMax, purchaseCommSplit,
      goldCostPercentage, receiveMin, receiveMax,
    );
    showToast("Configuração salva localmente!", "success");
  };

  const handleAddCategory = () => {
    const sorted = [...categories].sort((a, b) => a.maxWeight - b.maxWeight);
    const last = sorted[sorted.length - 1];
    const newWeight = last ? last.maxWeight * 2 : 10;

    const newCategory: Category = {
      id: Date.now(),
      name: "Nova",
      maxWeight: newWeight,
      variation: 0.2,
      commVariation: 0.2,
      maxDiscount: 10,
      color: "text-slate-500",
      active: true,
    };

    setCategories([...categories, newCategory]);
    showToast("Nova categoria adicionada!", "success");
  };

  const handleDeleteCategory = (index: number) => {
    if (categories.length <= 1) {
      showToast("Mantenha pelo menos uma categoria.", "error");
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: "Excluir Categoria",
      message: "Deseja realmente excluir esta categoria?",
      action: () => {
        const newCats = [...categories];
        newCats.splice(index, 1);
        setCategories(newCats);
        showToast("Categoria removida.", "success");
      },
    });
  };

  const handleDiamondClick = () => {
    if (isAdminMode) {
      setIsAdminMode(false);
      setIsConfigFullScreen(false);
      return;
    }
    setPasswordAttempt("");
    setIsPasswordModalOpen(true);
  };

  const handlePasswordSubmit = () => {
    if (passwordAttempt === "Perola12") {
      setIsPasswordModalOpen(false);
      setIsAdminMode(true);
      showToast("Modo Admin Ativado", "success");
    } else {
      showToast("Senha incorreta", "error");
      setPasswordAttempt("");
    }
  };

  return (
    <div
      className={`min-h-screen bg-[#F2E8D5] flex items-center justify-center p-4 font-sans transition-all duration-500 ${
        isAdminMode ? "items-start pt-8" : ""
      }`}
    >
      <Toast toast={toast} onClose={() => setToast(null)} />

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        onConfirm={confirmModal.action}
        title={confirmModal.title}
        message={confirmModal.message}
      />

      <Modal isOpen={isPasswordModalOpen} onClose={() => setIsPasswordModalOpen(false)} size="sm">
        <div className="flex flex-col items-center gap-4 py-2 relative">
          <button
            onClick={() => setIsPasswordModalOpen(false)}
            className="absolute -top-2 -right-2 text-slate-300 hover:text-slate-500 p-2"
          >
            <X size={16} />
          </button>

          <div className="bg-[#F2E8D5] p-3 rounded-full">
            <Lock className="w-6 h-6 text-[#1A3C34]" />
          </div>
          <h3 className="text-lg font-bold text-[#1A3C34]">Acesso Restrito</h3>

          <input
            autoFocus
            type="password"
            autoComplete="new-password"
            value={passwordAttempt}
            onChange={(e) => setPasswordAttempt(e.target.value)}
            placeholder="Senha"
            className="w-full bg-white border border-[#C59B6D]/30 rounded-lg px-4 py-2 text-center text-sm font-bold text-[#1A3C34] focus:outline-none focus:ring-2 focus:ring-[#C59B6D]"
            onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
          />
          <button
            onClick={handlePasswordSubmit}
            className="w-full bg-[#1A3C34] text-[#F2E8D5] py-2.5 rounded-xl text-sm font-bold hover:bg-[#132A26] transition-colors"
          >
            Entrar
          </button>
        </div>
      </Modal>

      <SyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        currentConfig={{
          startMkp, startCommission, categories, goldPrice,
          purchaseMin, purchaseMax, purchaseCommSplit,
          goldCostPercentage, receiveMin, receiveMax,
        }}
        onLoadConfig={handleCloudConfigLoad}
        onShowToast={showToast}
      />

      {isAdminMode ? (
        <div className="w-full max-w-[1600px] animate-[fadeIn_0.5s_ease-out]">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className={`lg:col-span-4 flex flex-col gap-4 ${isConfigFullScreen ? "hidden" : ""}`}>
              <div className="bg-[#1A3C34] text-[#F2E8D5] p-4 rounded-2xl shadow-lg flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="bg-[#C59B6D]/20 p-2 rounded-lg">
                    <Lock className="w-5 h-5 text-[#C59B6D]" />
                  </div>
                  <div>
                    <h2 className="font-bold text-sm">Modo Administrador</h2>
                    <p className="text-[10px] opacity-70">Edição em tempo real ativa</p>
                  </div>
                </div>
              </div>

              <div className="w-full bg-white rounded-3xl shadow-xl overflow-hidden border border-[#C59B6D]/20 flex flex-col min-h-[600px]">
                <div className="bg-[#1A3C34] p-6 text-[#F2E8D5] shrink-0 relative flex justify-center items-center">
                  <button
                    onClick={handleOpenCloudModal}
                    className="absolute left-6 top-1/2 -translate-y-1/2 p-2.5 bg-[#C59B6D]/10 hover:bg-[#C59B6D]/20 text-[#C59B6D] rounded-xl transition-all active:scale-90"
                  >
                    <Cloud size={18} />
                  </button>
                  <h1 className="text-3xl font-bold tracking-[0.2em] text-center">ALISSON</h1>
                </div>

                <div className="px-6 pt-4 pb-2 bg-[#F2E8D5]">
                  <div className="flex bg-white/50 p-1 rounded-xl border border-[#C59B6D]/20">
                    <button
                      onClick={() => setActiveTab("sales")}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${
                        activeTab === "sales"
                          ? "bg-[#1A3C34] text-[#C59B6D] shadow-sm"
                          : "text-[#1A3C34]/50 hover:text-[#1A3C34]"
                      }`}
                    >
                      <Calculator size={14} /> Venda
                    </button>
                    <button
                      onClick={() => setActiveTab("purchase")}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${
                        activeTab === "purchase"
                          ? "bg-[#1A3C34] text-[#C59B6D] shadow-sm"
                          : "text-[#1A3C34]/50 hover:text-[#1A3C34]"
                      }`}
                    >
                      <ShoppingBag size={14} /> Compra
                    </button>
                    <button
                      onClick={() => setActiveTab("receive")}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${
                        activeTab === "receive"
                          ? "bg-[#1A3C34] text-[#C59B6D] shadow-sm"
                          : "text-[#1A3C34]/50 hover:text-[#1A3C34]"
                      }`}
                    >
                      <ArrowRightLeft size={14} /> Receber
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scroll bg-[#F2E8D5]">
                  {activeTab === "sales" && (
                    <CalculatorTab
                      goldPrice={goldPrice}
                      setGoldPrice={setGoldPrice}
                      startMkp={startMkp}
                      startCommission={startCommission}
                      categories={categories}
                      purchaseMin={purchaseMin}
                      purchaseMax={purchaseMax}
                      purchaseCommSplit={purchaseCommSplit}
                      goldCostPercentage={goldCostPercentage}
                      onShowToast={showToast}
                    />
                  )}
                  {activeTab === "purchase" && (
                    <PurchaseTab
                      goldPrice={goldPrice}
                      setGoldPrice={setGoldPrice}
                      purchaseMin={purchaseMin}
                      purchaseMax={purchaseMax}
                      purchaseCommSplit={purchaseCommSplit}
                      onShowToast={showToast}
                    />
                  )}
                  {activeTab === "receive" && (
                    <TradeInTab
                      goldPrice={goldPrice}
                      setGoldPrice={setGoldPrice}
                      receiveMin={receiveMin}
                      receiveMax={receiveMax}
                      onShowToast={showToast}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className={`transition-all duration-300 ${isConfigFullScreen ? "lg:col-span-12" : "lg:col-span-8"}`}>
              <ConfigurationTab
                goldPrice={goldPrice}
                startMkp={startMkp}
                setStartMkp={setStartMkp}
                startCommission={startCommission}
                setStartCommission={setStartCommission}
                goldCostPercentage={goldCostPercentage}
                setGoldCostPercentage={setGoldCostPercentage}
                receiveMin={receiveMin}
                setReceiveMin={setReceiveMin}
                receiveMax={receiveMax}
                setReceiveMax={setReceiveMax}
                purchaseMin={purchaseMin}
                setPurchaseMin={setPurchaseMin}
                purchaseMax={purchaseMax}
                setPurchaseMax={setPurchaseMax}
                purchaseCommSplit={purchaseCommSplit}
                setPurchaseCommSplit={setPurchaseCommSplit}
                categories={categories}
                setCategories={setCategories}
                onSave={handleSaveConfig}
                onAddCategory={handleAddCategory}
                onDeleteCategory={handleDeleteCategory}
                onOpenSync={() => setIsSyncModalOpen(true)}
                onClose={() => setIsAdminMode(false)}
                onShowToast={showToast}
                isFullScreen={isConfigFullScreen}
                onToggleFullScreen={() => setIsConfigFullScreen(!isConfigFullScreen)}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-[#F2E8D5] rounded-3xl shadow-2xl overflow-hidden border-4 border-[#1A3C34] flex flex-col transition-all duration-700 ease-in-out w-[95%] max-w-[1400px] h-[90vh]">
          <div className="bg-[#1A3C34] p-6 shrink-0 relative flex justify-center items-center">
            <button
              onClick={handleOpenCloudModal}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-[#C59B6D]/10 hover:bg-[#C59B6D]/20 text-[#C59B6D] rounded-xl transition-all active:scale-90"
            >
              <Cloud size={16} />
            </button>

            <h1 className="text-2xl font-bold tracking-[0.2em] text-[#C59B6D] text-center z-10">
              ALISSON
            </h1>

            <button
              onClick={handleDiamondClick}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-[#C59B6D]/10 hover:bg-[#C59B6D]/20 text-[#C59B6D] rounded-xl transition-all active:scale-90"
            >
              <Gem className="w-4 h-4" />
            </button>
          </div>

          <div className="px-4 pt-3 pb-2 bg-[#F2E8D5]">
            <div className="flex bg-[#1A3C34]/10 p-1 rounded-xl border border-[#1A3C34]/10 max-w-lg mx-auto">
              <button
                onClick={() => setActiveTab("sales")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[10px] font-bold transition-all ${
                  activeTab === "sales"
                    ? "bg-[#1A3C34] text-[#C59B6D] shadow-md"
                    : "text-[#1A3C34]/60 hover:text-[#1A3C34]"
                }`}
              >
                <Calculator size={14} /> Venda
              </button>
              <button
                onClick={() => setActiveTab("purchase")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[10px] font-bold transition-all ${
                  activeTab === "purchase"
                    ? "bg-[#1A3C34] text-[#C59B6D] shadow-md"
                    : "text-[#1A3C34]/60 hover:text-[#1A3C34]"
                }`}
              >
                <ShoppingBag size={14} /> Compra
              </button>
              <button
                onClick={() => setActiveTab("receive")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[10px] font-bold transition-all ${
                  activeTab === "receive"
                    ? "bg-[#1A3C34] text-[#C59B6D] shadow-md"
                    : "text-[#1A3C34]/60 hover:text-[#1A3C34]"
                }`}
              >
                <ArrowRightLeft size={14} /> Receber
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scroll bg-[#F2E8D5] relative">
            <div className="max-w-md mx-auto">
              {activeTab === "sales" && (
                <CalculatorTab
                  goldPrice={goldPrice}
                  setGoldPrice={setGoldPrice}
                  startMkp={startMkp}
                  startCommission={startCommission}
                  categories={categories}
                  purchaseMin={purchaseMin}
                  purchaseMax={purchaseMax}
                  purchaseCommSplit={purchaseCommSplit}
                  goldCostPercentage={goldCostPercentage}
                  onShowToast={showToast}
                />
              )}
              {activeTab === "purchase" && (
                <PurchaseTab
                  goldPrice={goldPrice}
                  setGoldPrice={setGoldPrice}
                  purchaseMin={purchaseMin}
                  purchaseMax={purchaseMax}
                  purchaseCommSplit={purchaseCommSplit}
                  onShowToast={showToast}
                />
              )}
              {activeTab === "receive" && (
                <TradeInTab
                  goldPrice={goldPrice}
                  setGoldPrice={setGoldPrice}
                  receiveMin={receiveMin}
                  receiveMax={receiveMax}
                  onShowToast={showToast}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompraApp;
