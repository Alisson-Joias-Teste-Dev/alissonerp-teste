"use client";

import React, { useMemo, useState, useRef, useEffect } from "react";
import BadgePromo from "@/components/ui/BadgePromo";
import { TableRow, DashboardProps } from "@/lib/gestao-estoque/types";
import { updateRecord, saveTableConfig, loadTableConfig } from "@/lib/gestao-estoque/service";
import { useErrorStore } from "@/stores/errorStore";
import { 
  TrendingUp, 
  Scale, 
  Package, 
  DollarSign, 
  AlertCircle, 
  Gem,
  BarChart3,
  ListFilter,
  ArrowDownWideNarrow,
  Activity,
  ChevronDown,
  Check,
  X,
  Weight,
  PieChart,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Columns,
  EyeOff,
  Settings2,
  RefreshCcw,
  Pencil,
  Save,
  Loader2,
  Bookmark,
  Truck,
  Search,
  Circle,
  Watch,
  Tag,
  Download,
  CheckSquare,
  Square,
  Maximize2,
  Minimize2
} from 'lucide-react';

type FilterScope = 'positive' | 'all' | 'zero' | 'stale' | 'critical';
type SortDirection = 'asc' | 'desc';
type SortKey = 'totalValue' | 'stock' | 'price' | 'weight' | 'name' | string;

// Definition of Weight Classes based on specific business rules
const WEIGHT_CLASSES = [
  { label: 'Leves 1', min: 0.1, max: 0.5 },
  { label: 'Leves 2', min: 0.5, max: 1.0 },
  { label: 'Leves 3', min: 1.0, max: 2.0 },
  { label: 'Leves 4', min: 2.0, max: 3.0 },
  { label: 'Leves 5', min: 3.0, max: 4.0 },
  { label: 'Médias 1', min: 4.0, max: 6.0 },
  { label: 'Médias 2', min: 6.0, max: 8.0 },
  { label: 'Médias 3', min: 8.0, max: 10.0 },
  { label: 'Pesadas 1', min: 10.0, max: 15.0 },
  { label: 'Pesadas 2', min: 15.0, max: 20.0 },
  { label: 'Pesadas 3', min: 20.0, max: 30.0 },
  { label: 'Pesadas 4', min: 30.0, max: 60.0 },
  { label: 'Pesadas 5', min: 60.0, max: 100.0 },
];

const Dashboard: React.FC<DashboardProps> = ({ 
  data, 
  tableName, 
  loading,
  error,
  onRefresh,
  onPromotion
}) => {
  // Local state for client-side pagination (when not provided by parent)
  const [localPage, setLocalPage] = useState(0);
  const PAGE_SIZE = 100;
  
  // Paginacao 100% client-side (a paginacao remota por props nunca foi ligada
  // pelo unico consumidor — removida no pente-fino 18/08)
  const currentPage = localPage;
  
  const handlePrev = () => setLocalPage(p => Math.max(0, p - 1));

  const handleNext = () => setLocalPage(p => p + 1);

  const [filterScope, setFilterScope] = useState<FilterScope>('positive');

  // Mudou QUALQUER filtro -> volta pra pagina 1. Sem isso, quem estava na
  // Pag 3 e filtrava pra 40 itens via 'Nenhum registro encontrado' (slice
  // alem do fim) com os itens existindo.
  // (o useEffect fica logo apos as declaracoes dos filtros, abaixo)
  
  // Purchase/Inventory Date Range State
  const [purchaseDateRange, setPurchaseDateRange] = useState({
    start: '',
    end: ''
  });

  // Sorting State
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'totalValue',
    direction: 'desc'
  });

  // Category State
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [isCatDropdownOpen, setIsCatDropdownOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const catDropdownRef = useRef<HTMLDivElement>(null);

  // Supplier State
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [isSupplierDropdownOpen, setIsSupplierDropdownOpen] = useState(false);
  const supplierDropdownRef = useRef<HTMLDivElement>(null);

  // Weight Class State
  const [selectedWeightClasses, setSelectedWeightClasses] = useState<string[]>([]);
  const [isWeightDropdownOpen, setIsWeightDropdownOpen] = useState(false);
  const weightDropdownRef = useRef<HTMLDivElement>(null);

  // Column Selection State
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [isColumnSelectorOpen, setIsColumnSelectorOpen] = useState(false);
  const columnSelectorRef = useRef<HTMLDivElement>(null);

  // Row Exclusion State
  const [hiddenRowIds, setHiddenRowIds] = useState<Set<string>>(new Set());

  // Reset da paginacao local quando qualquer filtro muda (ver comentario acima)
  useEffect(() => {
    setLocalPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterScope, selectedCategories, selectedSuppliers, selectedWeightClasses, purchaseDateRange, hiddenRowIds]);

  // Editing State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TableRow>({});
  const [isSaving, setIsSaving] = useState(false);

  // Config Persistence State
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  // Selection State
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [bulkSelectCount, setBulkSelectCount] = useState<string>('');

  // ───── Novos recursos Tier 1+2 ─────
  // Cotacao do ouro (header)
  type GoldPrice = {
    preco_24k_g: number;
    preco_18k_g: number;
    variacao_pct_24h: number;
    atualizado_em: string;
    fonte: string;
    estale?: boolean;
  };
  const [goldPrice, setGoldPrice] = useState<GoldPrice | null>(null);

  // Vendas semanais (sparklines + delta)
  type WeeklyPoint = { semana: string; qtd_vendas: number; qtd_itens: number; valor_total: number };
  type WeeklyAgg = { total_vendas: number; total_itens: number; total_valor: number; media_semanal_valor: number; delta_pct_vs_4sem_anteriores: number };
  const [weeklySeries, setWeeklySeries] = useState<WeeklyPoint[]>([]);
  const [weeklyAgg, setWeeklyAgg] = useState<WeeklyAgg | null>(null);

  // Modo de exibicao da distribuicao (classes de peso OU heatmap categoria x peso)
  const [distributionMode, setDistributionMode] = useState<'weight' | 'heatmap'>('weight');

  // Modo de exibicao da matriz (tabela OU galeria visual)
  const [viewMode, setViewMode] = useState<'table' | 'gallery'>('table');
  const [isMatrixFullscreen, setIsMatrixFullscreen] = useState(false);

  // Vistas nomeadas (filtros salvos)
  type SavedView = { id: number; nome: string; filtros: Record<string, unknown>; created_at: string; updated_at: string };
  const [userViews, setUserViews] = useState<SavedView[]>([]);
  const [isViewsDropdownOpen, setIsViewsDropdownOpen] = useState(false);
  const [showSaveViewModal, setShowSaveViewModal] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [isSavingView, setIsSavingView] = useState(false);
  const [activeViewId, setActiveViewId] = useState<number | null>(null);
  const viewsDropdownRef = useRef<HTMLDivElement>(null);

  // Oportunidades de fabricacao (produtos zerados/desativados que JA venderam)
  type Oportunidade = {
    id_produto: number; sku: string; nome: string; situacao: string | null;
    imagem_capa: string | null; categoria: string | null; tipo_metal: string | null;
    peso_precificado: number | null; preco_sync: number | null; markup: number | null;
    saldo: number; qtd_vendida_total: number; qtd_vendas_distintas: number;
    receita_total: number; data_ultima_venda: string | null;
    vendas_365d: number; vendas_90d: number;
  };
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([]);
  const [oportunidadesTotais, setOportunidadesTotais] = useState<{ qtd_skus: number; qtd_vendida_total_historica: number; receita_total_historica: number } | null>(null);
  const [oppExpanded, setOppExpanded] = useState(false);
  const [oppMinVendas, setOppMinVendas] = useState(3);
  const [oppIncluirExcluidos, setOppIncluirExcluidos] = useState(false);
  const [oppLoading, setOppLoading] = useState(false);

  // Reset selection when data changes or table changes
  useEffect(() => {
    setSelectedRows(new Set());
  }, [data, tableName]);

  // Fetch cotacao do ouro ao montar + auto-refresh a cada 30 min
  useEffect(() => {
    let cancel = false;
    const load = async () => {
      try {
        const res = await fetch('/api/cotacao-ouro');
        if (!res.ok) return;
        const data = await res.json() as GoldPrice;
        if (!cancel) setGoldPrice(data);
      } catch {
        // Sem cotacao o header apenas esconde o cartao; avisa baixinho.
        useErrorStore.getState().push("Cotação do ouro indisponível", { level: "warning" });
      }
    };
    load();
    const id = setInterval(load, 30 * 60 * 1000);
    return () => { cancel = true; clearInterval(id); };
  }, []);

  // Fetch vendas semanais (12 sem) ao montar
  useEffect(() => {
    let cancel = false;
    const load = async () => {
      try {
        const res = await fetch('/api/gestao-estoque/vendas-semanais?semanas=12');
        if (!res.ok) return;
        const data = await res.json() as { semanas: WeeklyPoint[]; agregados: WeeklyAgg };
        if (!cancel) {
          setWeeklySeries(data.semanas ?? []);
          setWeeklyAgg(data.agregados ?? null);
        }
      } catch {
        useErrorStore.getState().push("Falha ao carregar vendas semanais", { level: "warning" });
      }
    };
    load();
    return () => { cancel = true; };
  }, []);

  // Fetch vistas salvas do usuario
  useEffect(() => {
    let cancel = false;
    const load = async () => {
      try {
        const res = await fetch('/api/gestao-estoque/user-views');
        if (!res.ok) return;
        const data = await res.json() as { views: SavedView[] };
        if (!cancel) setUserViews(data.views ?? []);
      } catch {
        useErrorStore.getState().push("Falha ao carregar vistas salvas", { level: "warning" });
      }
    };
    load();
    return () => { cancel = true; };
  }, []);

  // ESC fecha modo fullscreen da matriz
  useEffect(() => {
    if (!isMatrixFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMatrixFullscreen(false);
    };
    document.addEventListener('keydown', onKey);
    // Bloqueia scroll do body enquanto fullscreen
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isMatrixFullscreen]);

  // Fetch oportunidades de fabricacao (re-fetch quando min_vendas ou incluir_excluidos mudam)
  useEffect(() => {
    let cancel = false;
    const load = async () => {
      setOppLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('min_vendas', String(oppMinVendas));
        params.set('limit', oppExpanded ? '200' : '24');
        if (oppIncluirExcluidos) params.set('incluir_excluidos', 'true');
        const res = await fetch(`/api/gestao-estoque/oportunidades-fabricacao?${params.toString()}`);
        if (!res.ok) return;
        const data = await res.json() as {
          produtos: Oportunidade[];
          totais: { qtd_skus: number; qtd_vendida_total_historica: number; receita_total_historica: number };
        };
        if (!cancel) {
          setOportunidades(data.produtos ?? []);
          setOportunidadesTotais(data.totais ?? null);
        }
      } catch {
        useErrorStore.getState().push("Falha ao carregar oportunidades de fabricação", { level: "warning" });
      }
      finally { if (!cancel) setOppLoading(false); }
    };
    load();
    return () => { cancel = true; };
  }, [oppMinVendas, oppIncluirExcluidos, oppExpanded]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (catDropdownRef.current && !catDropdownRef.current.contains(event.target as Node)) {
        setIsCatDropdownOpen(false);
      }
      if (weightDropdownRef.current && !weightDropdownRef.current.contains(event.target as Node)) {
        setIsWeightDropdownOpen(false);
      }
      if (columnSelectorRef.current && !columnSelectorRef.current.contains(event.target as Node)) {
        setIsColumnSelectorOpen(false);
      }
      if (supplierDropdownRef.current && !supplierDropdownRef.current.contains(event.target as Node)) {
        setIsSupplierDropdownOpen(false);
      }
      if (viewsDropdownRef.current && !viewsDropdownRef.current.contains(event.target as Node)) {
        setIsViewsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 1. Column & Context Auto-Detection Logic
  const metrics = useMemo(() => {
    if (!data || data.length === 0) return null;

    const sample = data[0];
    const keys = Object.keys(sample);
    const lowerTableName = tableName.toLowerCase();

    // Heuristics to find columns — preco_curva tem prioridade (valor pela curva atual)
    const priceKey = keys.find(k => k === 'preco_curva') ||
                     keys.find(k => /price|preco|valor|amount|custo|total/i.test(k));
    
    const stockKey = keys.find(k => 
      (/qty|quantity|quantidade|items|itens|stock|estoque/i.test(k)) && 
      !/min|max|alert|security|seguranca|minimo|maximo|ideal/i.test(k)
    );
    
    const weightKey = keys.find(k => /peso_precificado|priced_weight/i.test(k)) || 
                      keys.find(k => /weight|peso|gramas|mass/i.test(k));

    const nameKey = keys.find(k => /product_name|nome_produto|name|nome|title|titulo|description/i.test(k)) || keys[0];
    
    const statusKey = keys.find(k => /status|situacao|situation|active|published/i.test(k));

    // O QUE: acha a coluna de categoria com prioridade pro nome EXATO.
    // O PORQUE: o regex frouxo casava 'tipo_metal' (vem antes de 'categoria' na
    // ordem do SELECT) e o filtro rotulado Categoria filtrava por METAL - bug
    // grave n6 do pente-fino 18/08. 'categoria_precificacao' (letra da curva)
    // tambem NAO e categoria de produto.
    // IMPACTO se remover a prioridade: dropdown Categoria volta a listar metais.
    let categoryKey = keys.find(k => /^(categoria|category)$/i.test(k)) ||
                      keys.find(k => /category|categoria|grupo|familia/i.test(k) && k !== 'categoria_precificacao') ||
                      keys.find(k => /type|tipo/i.test(k));

    // Fallback: Value-based heuristic (Check first few rows for jewelry keywords)
    if (!categoryKey) {
        const jewelryKeywords = /anel|brinco|colar|pulseira|pingente|joia|ring|earring|necklace|bracelet|ouro|prata/i;
        // Check string columns that are likely candidates
        categoryKey = keys.find(k => {
            // Check first 15 rows to see if values match jewelry types
            // Ignore numeric/date columns or obvious IDs
            const values = data.slice(0, 15).map(row => String(row[k]));
            if (values.some(v => /^\d+$/.test(v) || /^\d{4}-\d{2}-\d{2}/.test(v))) return false; 
            
            // Count matches
            const matchCount = values.filter(v => jewelryKeywords.test(v)).length;
            return matchCount >= 1; 
        });
    }
    
    // Supplier Detection
    const supplierKey = keys.find(k => /supplier|fornecedor|vendor|parceiro|fabricante/i.test(k));

    const idKey = keys.find(k => /id|uuid/i.test(k)) || nameKey;

    const skuKey = keys.find(k => /sku|referencia|ref|code|codigo|model/i.test(k));

    // Date Column
    const dateKey = keys.find(k => /created_at|date|data_atualizacao|data|criado_em/i.test(k));
    
    // Purchase Date for Inventory Analysis
    const purchaseDateKey = keys.find(k => /ultima_compra|purchase_date|data_compra|dt_compra|entrada|acquisition/i.test(k)) || 
                            keys.find(k => /created_at|data_atualizacao/i.test(k)) || 
                            dateKey;

    return { priceKey, stockKey, weightKey, nameKey, statusKey, idKey, skuKey, categoryKey, dateKey, purchaseDateKey, supplierKey, allKeys: keys };
  }, [data, tableName]);

  // Load Config: roda UMA VEZ por tabela. `metrics` muda de identidade a cada
  // refresh de dados; sem o guard, todo refresh re-aplicava a config salva e
  // descartava colunas/ordenacao que o usuario mudou sem salvar.
  const configLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    let mounted = true;
    const loadConfig = async () => {
      if (!tableName) return;
      if (configLoadedRef.current === tableName) return;
      if (!metrics) return; // espera a 1a carga de dados pra montar defaults
      configLoadedRef.current = tableName;
      
      const savedConfig = (await loadTableConfig(tableName)) as
        | { visibleColumns?: string[]; sortConfig?: { key: SortKey; direction: SortDirection } }
        | null;
      let initialColumns: string[] = [];
      if (mounted && savedConfig) {
        if (savedConfig.visibleColumns && savedConfig.visibleColumns.length > 0) {
           initialColumns = [...savedConfig.visibleColumns];
        }
        if (savedConfig.sortConfig) {
           setSortConfig(savedConfig.sortConfig);
        }
      } else if (mounted && metrics && initialColumns.length === 0) {
        // Default init if no config found
        const defaults = new Set<string>();
        if (metrics.nameKey) defaults.add(metrics.nameKey);
        if (metrics.skuKey) defaults.add(metrics.skuKey);
        if (metrics.statusKey) defaults.add(metrics.statusKey);
        if (metrics.priceKey) defaults.add(metrics.priceKey);
        if (metrics.stockKey) defaults.add(metrics.stockKey);
        if (metrics.dateKey) defaults.add(metrics.dateKey);
        if (metrics.supplierKey) defaults.add(metrics.supplierKey);
        if (metrics.purchaseDateKey) defaults.add(metrics.purchaseDateKey);
        if (metrics.categoryKey) defaults.add(metrics.categoryKey);
        
        if (defaults.size < 3) metrics.allKeys.slice(0, 5).forEach(k => defaults.add(k));
        initialColumns = Array.from(defaults);
      }

      // Auto-inject colunas de analise (3 separadas, cada uma com badge proprio)
      const autoCols = ['qtd_vendas', 'data_ultima_venda', 'data_ultima_compra'];
      if (mounted && metrics) {
        for (const col of autoCols) {
          if (metrics.allKeys.includes(col) && !initialColumns.includes(col)) {
            initialColumns.push(col);
          }
        }
      }

      if (mounted && initialColumns.length > 0) {
         setVisibleColumns(initialColumns);
      }
    };
    loadConfig();
    return () => { mounted = false; };
  }, [tableName, metrics]);

  // 2. Extract Available Categories (Memoized)
  const availableCategories = useMemo(() => {
    if (!data || !metrics?.categoryKey) return [];
    
    const cats = new Set<string>();
    data.forEach(row => {
        const val = row[metrics.categoryKey!];
        const label = val ? String(val).trim() : 'Sem Categoria';
        if (label && label !== 'null' && label !== 'undefined') cats.add(label);
    });
    
    return Array.from(cats).sort();
  }, [data, metrics]);

  const filteredCategories = useMemo(() => {
      return availableCategories.filter(c => c.toLowerCase().includes(categorySearch.toLowerCase()));
  }, [availableCategories, categorySearch]);

  // 2.1 Extract Available Suppliers
  const availableSuppliers = useMemo(() => {
    if (!data || !metrics?.supplierKey) return [];
    
    const supps = new Set<string>();
    data.forEach(row => {
        const val = row[metrics.supplierKey!];
        const label = val ? String(val).trim() : 'N/A';
        if (label) supps.add(label);
    });
    
    return Array.from(supps).sort();
  }, [data, metrics]);

  // 3. Data Filtering & Calculation Logic (Unified)
  const analysis = useMemo(() => {
    if (!data || !metrics) return null;
    const { priceKey, stockKey, weightKey, statusKey, nameKey, skuKey, categoryKey, dateKey, purchaseDateKey, supplierKey, idKey } = metrics;

    let totalStockValue = 0;
    let totalWeight = 0;
    let totalItems = 0;
    let productsInStock = 0;
    let productsInReplenishment = 0;
    let idleCapital = 0;
    let idleItemsCount = 0;
    let missingDateCount = 0;
    let criticalCapital = 0;
    let criticalCount = 0;
    let maxCriticalScore = -1;
    let maxCriticalValue = -1;
    let topCriticalItem: any = null;
    const staleThreshold = new Date();
    staleThreshold.setDate(staleThreshold.getDate() - 180);

    // ─── Modelo de Criticidade (score composto 0-100) ──────────────────────
    // Fatores (quanto maior o valor de cada um, mais crítico):
    //   - idadeDias        : dias desde a compra (quanto mais velho, pior)
    //   - diasSemVenda     : dias desde a última venda (null = nunca vendeu)
    //   - quantidade       : estoque parado (mais peças = mais crítico)
    //   - valorTotal       : capital imobilizado (R$ parado)
    //
    // Normalização (cada fator vira 0-100 antes de aplicar peso):
    //   idade:      dias / 365  (1 ano+ satura em 100)
    //   semVenda:   dias / 365  (nunca vendeu = 100 direto)
    //   quantidade: log10(stock+1) / log10(100)   (100 un+ satura)
    //   valor:      log10(total+1) / log10(100000) (R$ 100k+ satura)
    //
    // Pesos (soma = 100%):
    const W_IDADE    = 0.25;
    const W_SEM_VENDA = 0.35;
    const W_QTD       = 0.15;
    const W_VALOR     = 0.25;
    const CRITICO_MIN = 60; // score >= 60 já conta como "crítico" no KPI/filtro

    const hojeMs = Date.now();
    const diaMs  = 86400000;
    const cap = (v: number) => Math.max(0, Math.min(100, v));
    const normIdade   = (dias: number) => cap((dias / 365) * 100);
    const normSemV    = (dias: number | null) => dias === null ? 100 : cap((dias / 365) * 100);
    const normQtd     = (q: number) => q <= 0 ? 0 : cap((Math.log10(q + 1) / Math.log10(101)) * 100);
    const normValor   = (v: number) => v <= 0 ? 0 : cap((Math.log10(v + 1) / Math.log10(100001)) * 100);

    // Maps for aggregation
    const distributionMap = new Map<string, { weight: number, value: number, count: number }>();
    WEIGHT_CLASSES.forEach(c => distributionMap.set(c.label, { weight: 0, value: 0, count: 0 }));
    distributionMap.set('Outros', { weight: 0, value: 0, count: 0 });

    // Process and Filter Data
    const allItems = data.map((row, idx) => {
       // Unique ID for hiding logic (fallback to index if necessary, but stringified to match set)
       const uniqueId = idKey && row[idKey] ? String(row[idKey]) : `row-${idx}`;

       const stock = stockKey ? (parseFloat(row[stockKey]) || 0) : 0;
       // preco_curva pode ser null (sem peso/markup) → cai em preco_tiny.
       // Promo: se em_promocao=true, prioriza preco_vigente para refletir valor atual.
       const emPromo = Boolean(row['em_promocao']);
       const precoFonte = emPromo
         ? (row['preco_vigente'] ?? row['preco_curva'] ?? row['preco_tiny'])
         : (row['preco_curva'] ?? row['preco_tiny'] ?? (priceKey ? row[priceKey] : 0));
       const price = priceKey ? (parseFloat(String(precoFonte ?? 0)) || 0) : 0;
       const weight = weightKey ? (parseFloat(row[weightKey]) || 0) : 0;
       
       const totalValue = stock * price;

       // Date Parsing
       let rowDate: Date | null = null;
       if (dateKey && row[dateKey]) {
          rowDate = new Date(row[dateKey]);
       }

       // Purchase Date Parsing
       let purchaseDate: Date | null = null;
       if (purchaseDateKey && row[purchaseDateKey]) {
         purchaseDate = new Date(row[purchaseDateKey]);
         if (isNaN(purchaseDate.getTime())) purchaseDate = null;
       } 
       
       // SEM fallback pra outra data: usar a data da ultima VENDA como "compra"
       // fazia peca velha SEM registro de compra parecer recem-chegada (idade
       // errada no score de criticidade e no cartao 'Parado > 180 dias').

       // Last Sale Date parsing
       let lastSaleDate: Date | null = null;
       if (row['data_ultima_venda']) {
          lastSaleDate = new Date(row['data_ultima_venda']);
          if (isNaN(lastSaleDate.getTime())) lastSaleDate = null;
       }

       // ── Score composto de criticidade (0-100) ────────────────────────
       const idadeDias = purchaseDate
         ? Math.max(0, Math.floor((hojeMs - purchaseDate.getTime()) / diaMs))
         : 0;
       const diasSemVenda = lastSaleDate
         ? Math.max(0, Math.floor((hojeMs - lastSaleDate.getTime()) / diaMs))
         : null;

       const fIdade   = normIdade(idadeDias);
       const fSemV    = normSemV(diasSemVenda);
       const fQtd     = normQtd(stock);
       const fValor   = normValor(totalValue);

       // Só tem risco se tem estoque (stock <= 0 → score 0, sem risco de capital)
       const criticScore = stock <= 0 ? 0 : Math.round(
         fIdade * W_IDADE + fSemV * W_SEM_VENDA + fQtd * W_QTD + fValor * W_VALOR
       );
       const isCritical = stock > 0 && criticScore >= CRITICO_MIN;

       // Normalize Status
       let rawStatus = statusKey ? row[statusKey] : 'N/A';
       if (typeof rawStatus === 'boolean') rawStatus = rawStatus ? 'Ativo' : 'Inativo';
       
       const category = categoryKey ? String(row[categoryKey] || 'Sem Categoria').trim() : 'N/A';
       const supplier = supplierKey ? String(row[supplierKey] || 'N/A').trim() : 'N/A';
       const name = row[nameKey] ? String(row[nameKey]) : 'Item Desconhecido';
       const sku = skuKey ? String(row[skuKey]) : '-';

       // ── DIO (Dias de Inventario Outstanding) ──
       // Formula: saldo_atual / (vendas_ultimos_90d / 90)
       // null se nao vendeu nos ultimos 90d
       const qtdVendida90d = Number(row['qtd_vendida_90d'] ?? 0);
       const vendaDiariaMedia = qtdVendida90d > 0 ? qtdVendida90d / 90 : 0;
       const dio = stock > 0 && vendaDiariaMedia > 0
         ? Math.round(stock / vendaDiariaMedia)
         : null;

       return {
         original: row,
         uniqueId,
         name,
         sku,
         stock,
         price,
         weight,
         totalValue,
         status: String(rawStatus).trim(),
         category,
         supplier,
         date: rowDate,
         purchaseDate,
         lastSaleDate,
         idadeDias,
         diasSemVenda,
         criticScore,
         isCritical,
         dio,
         qtdVendida90d,
         receita12m: Number(row['receita_total_12m'] ?? 0),
         imagemCapa: (row['imagem_capa'] as string | undefined) ?? null,
         // abcClass preenchido logo abaixo (base = receita_total_12m, lista COMPLETA)
         abcClass: 'C' as 'A' | 'B' | 'C',
       };
    });

    // ── Classificacao ABC (Pareto sobre receita 12m) — na BASE COMPLETA ──
    // A = SKUs que concentram os primeiros 80% da receita 12m
    // B = proximos ate 95% | C = cauda + quem nao vendeu em 12m
    // 1) Roda ANTES dos filtros: a classe e do PRODUTO, nao do recorte da tela
    //    (filtrar por categoria nao pode rebaixar o best-seller pra B/C).
    // 2) Corte classico: classifica pelo acumulado ANTES de somar o proprio
    //    item — o item que CRUZA os 80% pertence a A (antes, um SKU com 85%
    //    da receita sozinho virava B e ninguem recebia A).
    const totalReceita12m = allItems.reduce((a, i) => a + (i.receita12m ?? 0), 0);
    const vendidos12m = allItems.filter(i => (i.receita12m ?? 0) > 0)
                                .sort((a, b) => (b.receita12m ?? 0) - (a.receita12m ?? 0));
    let acumulado = 0;
    for (const item of vendidos12m) {
      const percAntes = totalReceita12m > 0 ? (acumulado / totalReceita12m) * 100 : 0;
      acumulado += item.receita12m ?? 0;
      if (percAntes < 80) item.abcClass = 'A';
      else if (percAntes < 95) item.abcClass = 'B';
      else item.abcClass = 'C';
    }
    // (Itens sem receita 12m ja nascem 'C'.)

    const processedList = allItems.filter(item => {
       // 0. Hidden Rows Check
       if (hiddenRowIds.has(item.uniqueId)) return false;

       // Global Exclusions: SKUs starting with "Is" and Display Items ("Mostruário")
       const isExcludedSku = /^is/i.test(item.sku.trim());
       const isMostruario = /mostru[aá]rio/i.test(item.name) || /mostru[aá]rio/i.test(item.category);
       if (isExcludedSku || isMostruario) return false;

       // A. Purchase Date Filter
       if (purchaseDateRange.start && purchaseDateRange.end && item.purchaseDate) {
           const start = new Date(purchaseDateRange.start);
           const end = new Date(purchaseDateRange.end);
           end.setHours(23, 59, 59, 999);
           if (item.purchaseDate < start || item.purchaseDate > end) return false;
       }

       // B. Category Filter
       if (selectedCategories.length > 0) {
           if (!selectedCategories.includes(item.category)) return false;
       }

       // B2. Supplier Filter
       if (selectedSuppliers.length > 0) {
          if (!selectedSuppliers.includes(item.supplier)) return false;
       }

       // C. Weight Class Filter
       let matchesClass = true;
       if (selectedWeightClasses.length > 0) {
           matchesClass = selectedWeightClasses.some(className => {
               const range = WEIGHT_CLASSES.find(w => w.label === className);
               if (!range) return false;
               
               const isFirstClass = range.label === WEIGHT_CLASSES[0].label;
               if (isFirstClass) {
                   return item.weight >= range.min && item.weight <= range.max;
               }
               return item.weight > range.min && item.weight <= range.max;
           });
       }
       if (!matchesClass) return false;

       // D. Scope Filter
       if (filterScope === 'positive') return item.stock > 0;
       if (filterScope === 'zero') return item.stock <= 0;
       if (filterScope === 'stale') return item.stock > 0 && item.purchaseDate && item.purchaseDate < staleThreshold;
       if (filterScope === 'critical') return item.stock > 0 && item.isCritical;
       
       return true;  
    });

    // Calculate Totals & Distribution based on filtered list
    processedList.forEach(item => {
       const itemTotalWeight = item.weight * item.stock;
       const itemTotalValue = item.totalValue;

       totalStockValue += itemTotalValue;
       totalWeight += itemTotalWeight;
       totalItems += item.stock;
       
       if (item.stock > 0) {
         productsInStock++;
         if (item.purchaseDate) {
           if (item.purchaseDate < staleThreshold) {
             idleCapital += itemTotalValue;
             idleItemsCount += item.stock;
           }
         } else {
           missingDateCount += item.stock;
         }
         
         if (item.isCritical) {
           criticalCount += item.stock;
           criticalCapital += itemTotalValue;

           // Top risco = maior criticScore; desempate por valorTotal.
           // Comparacao em 2 campos (o truque score*1M+valor estourava quando
           // um item passava de R$ 1 milhao e vencia com score menor).
           if (item.criticScore > maxCriticalScore ||
               (item.criticScore === maxCriticalScore && itemTotalValue > maxCriticalValue)) {
              maxCriticalScore = item.criticScore;
              maxCriticalValue = itemTotalValue;
              topCriticalItem = item;
           }
         }
       } else {
         productsInReplenishment++;
       }

       // Add to distribution buckets
       let foundClass = false;
       for (let i = 0; i < WEIGHT_CLASSES.length; i++) {
           const cls = WEIGHT_CLASSES[i];
           const isFirst = i === 0;
           const matches = isFirst 
             ? (item.weight >= cls.min && item.weight <= cls.max)
             : (item.weight > cls.min && item.weight <= cls.max);

           if (matches) {
             const bucket = distributionMap.get(cls.label)!;
             bucket.weight += itemTotalWeight;
             bucket.value += itemTotalValue;
             bucket.count += item.stock;
             foundClass = true;
             break;
           }
       }
       
       if (!foundClass) {
           const bucket = distributionMap.get('Outros')!;
           bucket.weight += itemTotalWeight;
           bucket.value += itemTotalValue;
           bucket.count += item.stock;
       }
    });

    // Process Distribution Stats
    const distributionStats = Array.from(distributionMap.entries())
        .map(([label, stats]) => ({
            label,
            ...stats,
            weightShare: totalWeight > 0 ? (stats.weight / totalWeight) * 100 : 0,
            valueShare: totalStockValue > 0 ? (stats.value / totalStockValue) * 100 : 0
        }))
        .filter(d => d.weight > 0 || d.value > 0);

    // (Classificacao ABC roda la em cima, na base COMPLETA — antes dos filtros.)

    // ── Heatmap Categoria × Classe de Peso ──
    // Matriz: categoria (linhas) x classe de peso (colunas) → soma do totalValue
    const heatmapMap = new Map<string, Map<string, { value: number; count: number; weight: number }>>();
    const heatmapCategorias = new Set<string>();
    for (const item of processedList) {
      if (item.stock <= 0) continue;
      let classeLabel = 'Outros';
      for (let i = 0; i < WEIGHT_CLASSES.length; i++) {
        const cls = WEIGHT_CLASSES[i];
        const isFirst = i === 0;
        const ok = isFirst ? (item.weight >= cls.min && item.weight <= cls.max) : (item.weight > cls.min && item.weight <= cls.max);
        if (ok) { classeLabel = cls.label; break; }
      }
      heatmapCategorias.add(item.category);
      if (!heatmapMap.has(item.category)) heatmapMap.set(item.category, new Map());
      const row = heatmapMap.get(item.category)!;
      if (!row.has(classeLabel)) row.set(classeLabel, { value: 0, count: 0, weight: 0 });
      const cell = row.get(classeLabel)!;
      cell.value += item.totalValue;
      cell.count += item.stock;
      cell.weight += item.weight * item.stock;
    }
    // 'Outros' (peso 0/nulo ou >100g) entrava no Total da linha mas nao tinha
    // coluna — o Total parecia 'fantasma'. Se existir, vira coluna visivel.
    const temOutrosHeatmap = Array.from(heatmapMap.values()).some(r => r.has('Outros'));
    const heatmap = {
      categorias: Array.from(heatmapCategorias).sort(),
      classes: temOutrosHeatmap
        ? [...WEIGHT_CLASSES.map(w => w.label), 'Outros']
        : WEIGHT_CLASSES.map(w => w.label),
      cells: heatmapMap,
      maxValue: 0 as number,
    };
    // Calcula maior valor pra normalizar intensidade da cor
    heatmapMap.forEach(row => {
      row.forEach(cell => {
        if (cell.value > heatmap.maxValue) heatmap.maxValue = cell.value;
      });
    });

    // Sort List based on Sort Config
    processedList.sort((a, b) => {
        let valA, valB;

        // Custom Sort Keys mapping
        if (sortConfig.key === 'totalValue') { valA = a.totalValue; valB = b.totalValue; }
        else if (sortConfig.key === 'stock') { valA = a.stock; valB = b.stock; }
        else if (sortConfig.key === 'price') { valA = a.price; valB = b.price; }
        else if (sortConfig.key === 'weight') { valA = a.weight; valB = b.weight; }
        else if (sortConfig.key === 'criticScore') { valA = a.criticScore; valB = b.criticScore; }
        else if (sortConfig.key === 'dio') {
          // null (sem venda) sempre ultimo em asc, primeiro em desc — "pior" caso
          valA = a.dio ?? Number.MAX_SAFE_INTEGER;
          valB = b.dio ?? Number.MAX_SAFE_INTEGER;
        }
        else if (sortConfig.key === 'abcClass') { valA = a.abcClass; valB = b.abcClass; }
        else {
             // Generic column sort
             valA = a.original[sortConfig.key];
             valB = b.original[sortConfig.key];
        }

        // Handle nulls/undefined for generic sorting
        if (valA === undefined || valA === null) valA = '';
        if (valB === undefined || valB === null) valB = '';

        if ((valA as number | string) < (valB as number | string)) return sortConfig.direction === 'asc' ? -1 : 1;
        if ((valA as number | string) > (valB as number | string)) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

    return {
      totalStockValue,
      totalWeight,
      totalItems,
      productsInStock,
      productsInReplenishment,
      idleCapital,
      idleItemsCount,
      missingDateCount,
      criticalCapital,
      criticalCount,
      avgCriticalPrice: criticalCount > 0 ? criticalCapital / criticalCount : 0,
      topCriticalItem,
      filteredCount: processedList.length,
      avgPricePerGram: totalWeight > 0 ? totalStockValue / totalWeight : 0,
      fullList: processedList,
      distributionStats,
      heatmap,
    };
  }, [data, metrics, filterScope, selectedCategories, selectedWeightClasses, selectedSuppliers, sortConfig, purchaseDateRange, hiddenRowIds]);

  // Handlers
  const scrollToMatrix = () => {
    setTimeout(() => {
      document.getElementById('detailed-matrix')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleEstoqueParadoClick = () => {
    setFilterScope(filterScope === 'stale' ? 'all' : 'stale');
    if (filterScope !== 'stale') scrollToMatrix();
  };

  const handleCriticalClick = () => {
    const isActivating = filterScope !== 'critical';
    setFilterScope(isActivating ? 'critical' : 'all');
    if (isActivating) {
        setSortConfig({ key: 'totalValue', direction: 'desc' });
        scrollToMatrix();
    } else {
        scrollToMatrix();
    }
  };

  const toggleCategory = (cat: string) => {
      setSelectedCategories(prev => {
          if (prev.includes(cat)) return prev.filter(c => c !== cat);
          return [...prev, cat];
      });
      scrollToMatrix();
  };

  const toggleSupplier = (sup: string) => {
      setSelectedSuppliers(prev => {
          if (prev.includes(sup)) return prev.filter(s => s !== sup);
          return [...prev, sup];
      });
      scrollToMatrix();
  };

  const toggleWeightClass = (cls: string) => {
      setSelectedWeightClasses(prev => {
          if (prev.includes(cls)) return prev.filter(c => c !== cls);
          return [...prev, cls];
      });
      scrollToMatrix();
  };

  const handleSort = (key: SortKey) => {
      setSortConfig(current => ({
          key,
          direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc'
      }));
  };

  const toggleColumn = (col: string) => {
    setVisibleColumns(prev => {
      if (prev.includes(col)) return prev.filter(c => c !== col);
      return [...prev, col];
    });
  };

  const hideRow = (uniqueId: string) => {
    setHiddenRowIds(prev => new Set(prev).add(uniqueId));
  };

  const resetHiddenRows = () => {
    setHiddenRowIds(new Set());
  };

  const handleSaveConfig = async () => {
      setIsSavingConfig(true);
      const success = await saveTableConfig(tableName, {
          visibleColumns,
          sortConfig
      });
      setIsSavingConfig(false);
      if (success) {
          setConfigSaved(true);
          setTimeout(() => setConfigSaved(false), 2000);
      }
  };

  // ────── Vistas nomeadas (filtros salvos) ──────
  const applySavedView = (view: SavedView) => {
    const f = view.filtros ?? {};
    setSelectedCategories(Array.isArray(f.categorias) ? f.categorias as string[] : []);
    setSelectedSuppliers(Array.isArray(f.fornecedores) ? f.fornecedores as string[] : []);
    setSelectedWeightClasses(Array.isArray(f.classes_peso) ? f.classes_peso as string[] : []);
    setFilterScope((f.scope as FilterScope) ?? 'all');
    setPurchaseDateRange({
      start: (f.data_inicio as string) ?? '',
      end: (f.data_fim as string) ?? ''
    });
    setActiveViewId(view.id);
    setIsViewsDropdownOpen(false);
  };

  const saveAsView = async () => {
    const nome = newViewName.trim();
    if (!nome) return;
    setIsSavingView(true);
    try {
      const res = await fetch('/api/gestao-estoque/user-views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome,
          filtros: {
            categorias: selectedCategories,
            fornecedores: selectedSuppliers,
            classes_peso: selectedWeightClasses,
            scope: filterScope,
            data_inicio: purchaseDateRange.start,
            data_fim: purchaseDateRange.end
          }
        })
      });
      if (res.ok) {
        const { view } = await res.json() as { view: SavedView };
        setUserViews(prev => {
          const filtered = prev.filter(v => v.id !== view.id);
          return [view, ...filtered];
        });
        setActiveViewId(view.id);
        setShowSaveViewModal(false);
        setNewViewName('');
      } else {
        useErrorStore.getState().push("Não foi possível salvar a vista");
      }
    } catch {
      useErrorStore.getState().push("Não foi possível salvar a vista");
    }
    finally { setIsSavingView(false); }
  };

  const deleteView = async (id: number) => {
    try {
      const res = await fetch(`/api/gestao-estoque/user-views?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setUserViews(prev => prev.filter(v => v.id !== id));
        if (activeViewId === id) setActiveViewId(null);
      } else {
        useErrorStore.getState().push("Não foi possível excluir a vista");
      }
    } catch {
      useErrorStore.getState().push("Não foi possível excluir a vista");
    }
  };

  const toggleRow = (uniqueId: string) => {
    const newSelection = new Set(selectedRows);
    if (newSelection.has(uniqueId)) {
      newSelection.delete(uniqueId);
    } else {
      newSelection.add(uniqueId);
    }
    setSelectedRows(newSelection);
  };

  const toggleAll = () => {
    if (!analysis) return;
    if (selectedRows.size === analysis.fullList.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(analysis.fullList.map(item => item.uniqueId)));
    }
  };

  const handleBulkSelect = () => {
    if (!analysis) return;
    const countToSelect = parseInt(bulkSelectCount);
    if (isNaN(countToSelect) || countToSelect <= 0) return;

    const newSelection = new Set<string>();
    analysis.fullList.slice(0, countToSelect).forEach(item => {
      newSelection.add(item.uniqueId);
    });
    setSelectedRows(newSelection);
  };

  const downloadCSV = () => {
    if (!analysis || selectedRows.size === 0) return;

    const selectedData = analysis.fullList.filter(item => selectedRows.has(item.uniqueId));
    const headers = visibleColumns.join(',');
    const rows = selectedData.map(item => 
      visibleColumns.map(col => {
        const val = item.original[col];
        if (val === null || val === undefined) return '';
        if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(',')
    );

    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${tableName}_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url); // libera o blob da memoria (sessao longa acumulava)
  };

  // --- Editing Logic ---
  const startEditing = (row: any) => {
    setEditingId(row.uniqueId);
    setEditForm({ ...row.original }); // Clone original data
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleEditChange = (colKey: string, value: string) => {
    setEditForm(prev => ({ ...prev, [colKey]: value }));
  };

  const saveEditing = async (pkField: string) => {
    if (!editingId) return;

    // Determine the Primary Key Value. 
    // We use the 'pkField' detected in metrics, or we try to find 'id' in the form data.
    const pkValue = editForm[pkField] || editForm['id'];

    if (!pkValue) {
      alert("Não foi possível identificar o ID do registro para salvar.");
      return;
    }

    setIsSaving(true);
    
    // Call service
    const { success, error } = await updateRecord(pkValue, editForm, pkField);
    
    setIsSaving(false);

    if (success) {
      setEditingId(null);
      if (onRefresh) onRefresh(); // Trigger data reload
    } else {
      alert(`Erro ao salvar: ${(error as { message?: string })?.message || 'Desconhecido'}`);
    }
  };

  // Cores de badge ABC e Score — FONTE UNICA pra galeria e tabela (eram 2 copias
  // que podiam divergir; pente-fino 18/08)
  const abcCorClass = (abc: 'A' | 'B' | 'C') =>
    abc === 'A' ? 'bg-emerald-500 text-white' :
    abc === 'B' ? 'bg-yellow-400 text-yellow-900' :
                  'bg-gray-200 text-gray-600';
  const scoreCorClass = (score: number) =>
    score >= 80 ? 'bg-red-600' :
    score >= 60 ? 'bg-red-500' :
    score >= 40 ? 'bg-orange-400' :
    score >= 20 ? 'bg-yellow-400' :
                  'bg-emerald-500';

  // Helper: Get Icon for Jewelry Category
  const getCategoryIcon = (catName: string) => {
      const lower = catName.toLowerCase();
      if (lower.includes('anel') || lower.includes('ring')) return <Circle size={14} className="text-alisson-gold" />;
      if (lower.includes('colar') || lower.includes('neck')) return <div className="w-3 h-3 rounded-full border border-alisson-gold"></div>;
      if (lower.includes('pulseira') || lower.includes('bracelet')) return <div className="w-3.5 h-1 bg-alisson-gold rounded-full"></div>;
      if (lower.includes('relogio') || lower.includes('watch')) return <Watch size={14} className="text-gray-600" />;
      return <Gem size={14} className="text-gray-500" />;
  };


  // Helper to render sort icon
  const SortIcon = ({ colKey }: { colKey: SortKey }) => {
      if (sortConfig.key !== colKey) return <ArrowUpDown size={12} className="opacity-20 ml-1 group-hover:opacity-50 transition-opacity" />;
      return sortConfig.direction === 'asc' 
        ? <ArrowUp size={12} className="text-alisson-gold ml-1" />
        : <ArrowDown size={12} className="text-alisson-gold ml-1" />;
  };

  // Prepare table data with pagination (Client-side slice)
  const tableData = useMemo(() => {
    if (!analysis) return [];
    const start = currentPage * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    return analysis.fullList.slice(start, end);
  }, [analysis, currentPage, PAGE_SIZE]);


  if (error) {
    return (
      <div className="flex-1 p-8 bg-creme-50 h-full overflow-y-auto">
        <div className="bg-red-900/20 border border-red-900/50 p-6 rounded-lg text-center">
          <AlertCircle className="mx-auto mb-2 text-red-400" size={32} />
          <h3 className="text-gray-900 font-bold mb-2">Erro ao Carregar Dados</h3>
          <p className="text-red-300 text-sm">{error}</p>
          <button 
            onClick={onRefresh}
            className="mt-4 px-4 py-2 bg-red-900/40 hover:bg-red-900/60 text-gray-900 rounded-lg transition-colors text-xs font-bold uppercase tracking-widest"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-creme-50 text-alisson-gold h-full">
        <div className="animate-pulse flex flex-col items-center">
          <Gem size={48} className="mb-4" />
          <h2 className="text-xl font-serif">Processando Métricas...</h2>
          <p className="text-xs text-gray-500 mt-2">Carregando lote de dados...</p>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-creme-50 text-gray-500 h-full">
        <BarChart3 size={48} className="mb-4 opacity-50" />
        <p>Sem dados disponíveis para análise na tabela <span className="text-alisson-gold">{tableName}</span>.</p>
      </div>
    );
  }

  if (!analysis || !metrics) {
    return (
      <div className="flex-1 p-8 bg-creme-50 h-full overflow-y-auto">
        <div className="bg-red-900/20 border border-red-900/50 p-6 rounded-lg text-center">
          <AlertCircle className="mx-auto mb-2 text-red-400" size={32} />
          <h3 className="text-gray-900 font-bold mb-2">Estrutura Incompatível</h3>
          <p className="text-red-300 text-sm">
            Não foi possível detectar automaticamente as colunas de Preço, Estoque ou Peso nesta tabela.
          </p>
        </div>
      </div>
    );
  }

  const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  const formatNumber = (val: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(val);
  // Moeda sem decimais: R$ 4.950 / R$ 12.300
  const formatCurrencyFull = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
  // Moeda compacta pra cards/métricas: R$ 12,3k / R$ 1,2M
  const formatCurrencyShort = (val: number) => {
    if (!Number.isFinite(val)) return 'R$ 0';
    const abs = Math.abs(val);
    if (abs >= 1_000_000) return `R$ ${(val / 1_000_000).toFixed(1).replace('.', ',')}M`;
    if (abs >= 10_000)    return `R$ ${(val / 1_000).toFixed(0)}k`;
    if (abs >= 1_000)     return `R$ ${(val / 1_000).toFixed(1).replace('.', ',')}k`;
    return `R$ ${Math.round(val)}`;
  };

  // Layout por tipo de coluna — largura, alinhamento, font mono
  // Retorna classes pra <th> e <td> ficarem sincronizados em largura
  const colLayout = (key: string): { cls: string; align: 'left' | 'center' | 'right'; mono: boolean; nowrap: boolean } => {
    const k = key.toLowerCase();
    // Nome / descrição: flex, truncate
    if (k === 'nome' || k.includes('descri') || k === 'title' || k === 'titulo') return { cls: 'min-w-[200px] max-w-[320px]', align: 'left', mono: false, nowrap: false };
    // SKU / código
    if (k === 'sku' || k === 'codigo' || k === 'ref' || k === 'referencia' || k === 'model') return { cls: 'w-[92px]', align: 'left', mono: true, nowrap: true };
    // Situação / status (usa bolinha visual)
    if (k === 'situacao' || k === 'status' || k === 'ativo') return { cls: 'w-[42px]', align: 'center', mono: false, nowrap: true };
    // Qtd vendas dedicada (badge próprio)
    if (k === 'qtd_vendas') return { cls: 'w-[68px]', align: 'center', mono: true, nowrap: true };
    // Preço / valor
    if (k.match(/preco|valor|price/)) return { cls: 'w-[88px]', align: 'right', mono: true, nowrap: true };
    // Saldo / estoque / quantidade
    if (k.match(/saldo|estoque|qtd_|qty|quantidade|quant$/)) return { cls: 'w-[64px]', align: 'right', mono: true, nowrap: true };
    // Peso / gramas
    if (k.match(/peso|gram|weight/)) return { cls: 'w-[68px]', align: 'right', mono: true, nowrap: true };
    // Datas (venda / compra / atualização)
    if (k.match(/data|date|_at$|_em$/)) return { cls: 'w-[124px]', align: 'center', mono: false, nowrap: true };
    // Markup / fator / percentual
    if (k === 'markup' || k === 'fator' || k.includes('percent') || k.endsWith('_pct')) return { cls: 'w-[60px]', align: 'right', mono: true, nowrap: true };
    // Booleanos
    if (k.startsWith('tem_') || k.includes('eh_') || k === 'n8n') return { cls: 'w-[52px]', align: 'center', mono: false, nowrap: true };
    // Categoria / tipo (texto curto)
    if (k.includes('categoria') || k.includes('tipo') || k.includes('type')) return { cls: 'min-w-[100px] max-w-[180px]', align: 'left', mono: false, nowrap: false };
    // Default
    return { cls: 'min-w-[80px]', align: 'left', mono: false, nowrap: false };
  };

  // ── Sparkline SVG inline (zero deps) ──
  const Sparkline = ({ values, color = '#184036', width = 140, height = 32 }: { values: number[]; color?: string; width?: number; height?: number }) => {
    if (!values || values.length < 2) {
      return <div style={{ width, height }} className="flex items-center justify-center text-[10px] text-gray-300">sem dados</div>;
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const pad = 2;
    const stepX = (width - pad * 2) / (values.length - 1);
    const pts = values.map((v, i) => {
      const x = pad + i * stepX;
      const y = height - pad - ((v - min) / range) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const d = `M ${pts.join(' L ')}`;
    const areaD = `${d} L ${(pad + (values.length - 1) * stepX).toFixed(1)},${height} L ${pad},${height} Z`;
    const lastX = pad + (values.length - 1) * stepX;
    const lastY = height - pad - ((values[values.length - 1] - min) / range) * (height - pad * 2);
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
        <path d={areaD} fill={color} opacity={0.08} />
        <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={lastX} cy={lastY} r={2.5} fill={color} />
      </svg>
    );
  };

  // Progressive disclosure: só mostra Distribuição + Matriz quando algum filtro é aplicado.
  // Default ('positive' + datas vazias + nada selecionado) = só KPIs.
  const hasActiveFilter =
    selectedCategories.length > 0 ||
    selectedSuppliers.length > 0 ||
    selectedWeightClasses.length > 0 ||
    filterScope !== 'positive' ||
    !!purchaseDateRange.start ||
    !!purchaseDateRange.end ||
    hiddenRowIds.size > 0;

  return (
    <div className="flex-1 min-w-0 max-w-full bg-creme-50 text-gray-900 overflow-y-auto overflow-x-hidden scrollbar-thin h-full">
      <div className="px-6 lg:px-10 py-6 lg:py-8 flex flex-col gap-6">

        {/* HERO HEADER */}
        <header className="order-1 flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4 pb-5 border-b border-creme-200">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-gray-500 font-semibold mb-1.5">
              {tableName}
            </p>
            <h1 className="text-3xl lg:text-4xl font-serif font-semibold text-esmeralda-500 tracking-tight leading-tight">
              Inteligência de Estoque
            </h1>
            <p className="text-sm text-gray-600 mt-2 max-w-2xl">
              Visão executiva do capital em joias · <span className="font-semibold text-gray-900">{analysis.filteredCount.toLocaleString('pt-BR')}</span> peças na seleção atual
              {hiddenRowIds.size > 0 && (
                <> · <span className="text-red-600 font-medium">{hiddenRowIds.size} ocultas</span></>
              )}
            </p>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            {/* Cotacao ouro — 24k e a referencia de mercado */}
            {goldPrice && (
              <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${goldPrice.estale ? 'bg-creme-50 border-creme-200' : 'bg-dourado-light/20 border-dourado-light'}`}
                   title={`${goldPrice.fonte} · atualizado ${goldPrice.atualizado_em}${goldPrice.estale ? ' (cache estálico)' : ''}`}>
                <div className="p-1.5 rounded-lg bg-dourado-light/50 text-dourado-dark">
                  <Gem size={18} />
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-widest text-dourado-dark font-bold leading-none">Ouro 24k hoje</p>
                  <p className="text-lg font-mono font-bold text-gray-900 tabular-nums leading-tight mt-1">
                    {formatCurrency(goldPrice.preco_24k_g)}<span className="text-xs font-sans text-gray-500">/g</span>
                  </p>
                  <p className={`text-[11px] font-mono leading-none mt-0.5 ${goldPrice.variacao_pct_24h > 0 ? 'text-emerald-600' : goldPrice.variacao_pct_24h < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                    {goldPrice.variacao_pct_24h > 0 ? '▲' : goldPrice.variacao_pct_24h < 0 ? '▼' : '—'} {Math.abs(goldPrice.variacao_pct_24h).toFixed(2)}% · 18k {formatCurrency(goldPrice.preco_18k_g)}
                  </p>
                </div>
              </div>
            )}

            <div className="text-right">
              <p className="text-[11px] uppercase tracking-widest text-gray-500 font-semibold">Capital exposto</p>
              <p className="text-2xl lg:text-3xl font-mono font-bold text-esmeralda-500 tabular-nums leading-none mt-1">
                {formatCurrency(analysis.totalStockValue)}
              </p>
              {goldPrice && analysis.totalWeight > 0 && (
                /* Joia e 18k (75% ouro): avaliar o peso pela cotacao 24k inflava
                   o lastro em ~33% pra quem decide compra de ouro. */
                <p className="text-[11px] text-gray-500 mt-1 font-mono">
                  Metal contido (18k): {formatCurrency(analysis.totalWeight * goldPrice.preco_18k_g)}
                </p>
              )}
            </div>
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="p-3 rounded-xl bg-white border border-creme-200 text-gray-600 hover:text-esmeralda-500 hover:border-esmeralda-300 transition-colors"
                title="Atualizar"
              >
                <RefreshCcw size={18} />
              </button>
            )}
          </div>
        </header>

        {/* FILTERS BAR */}
        <section className="order-2 bg-white border border-creme-200 rounded-2xl p-5">
          <div className="flex flex-wrap items-end gap-4">

            {/* Date range */}
            {metrics.purchaseDateKey && (
              <div className="flex flex-col">
                <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                  <CalendarDays size={14} /> Data da compra
                </label>
                <div className="flex items-center gap-2 h-10 px-3 bg-creme-50 rounded-lg border border-creme-200">
                  <input
                    type="date"
                    value={purchaseDateRange.start}
                    onChange={(e) => setPurchaseDateRange(prev => ({ ...prev, start: e.target.value }))}
                    className="bg-transparent text-sm text-gray-900 font-mono focus:outline-none focus:text-esmeralda-500 w-[125px]"
                  />
                  <span className="text-gray-400">–</span>
                  <input
                    type="date"
                    value={purchaseDateRange.end}
                    onChange={(e) => setPurchaseDateRange(prev => ({ ...prev, end: e.target.value }))}
                    className="bg-transparent text-sm text-gray-900 font-mono focus:outline-none focus:text-esmeralda-500 w-[125px]"
                  />
                </div>
              </div>
            )}

            {/* Categories */}
            {availableCategories.length > 0 && (
              <div className="relative flex flex-col" ref={catDropdownRef}>
                <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                  <Gem size={14} /> Categoria
                </label>
                <button
                  onClick={() => setIsCatDropdownOpen(!isCatDropdownOpen)}
                  className={`h-10 flex items-center justify-between gap-3 px-4 bg-creme-50 border rounded-lg min-w-[180px] text-sm transition-all ${
                    selectedCategories.length > 0
                      ? 'border-esmeralda-300 text-esmeralda-500 font-semibold'
                      : 'border-creme-200 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="truncate">
                    {selectedCategories.length === 0 ? 'Todas' : `${selectedCategories.length} selecionada(s)`}
                  </span>
                  <ChevronDown size={14} className={`transition-transform shrink-0 ${isCatDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {isCatDropdownOpen && (
                  <div className="absolute top-full left-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white border border-creme-200 rounded-xl shadow-2xl z-50 scrollbar-thin flex flex-col">
                    <div className="p-3 border-b border-creme-200 bg-white z-10 sticky top-0 space-y-2">
                      <div className="flex justify-between items-center">
                        <button onClick={() => setSelectedCategories(availableCategories)} className="text-[11px] uppercase font-bold tracking-wider text-gray-500 hover:text-esmeralda-500 px-2 py-1">Todas</button>
                        <button onClick={() => { setSelectedCategories([]); setCategorySearch(''); }} className="text-[11px] uppercase font-bold tracking-wider text-gray-500 hover:text-red-500 px-2 py-1">Limpar</button>
                      </div>
                      {availableCategories.length > 8 && (
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input
                            type="text"
                            value={categorySearch}
                            onChange={(e) => setCategorySearch(e.target.value)}
                            placeholder="Filtrar..."
                            className="w-full bg-creme-50 border border-creme-200 rounded-md text-sm py-2 pl-9 pr-3 text-gray-700 focus:outline-none focus:border-esmeralda-300"
                          />
                        </div>
                      )}
                    </div>
                    <div className="p-2 space-y-1">
                      {filteredCategories.map(cat => (
                        <button
                          key={cat}
                          onClick={() => toggleCategory(cat)}
                          className={`w-full text-left px-3 py-2.5 rounded-md text-sm flex items-center justify-between group transition-colors ${selectedCategories.includes(cat) ? 'bg-esmeralda-50 text-esmeralda-500 font-semibold' : 'text-gray-700 hover:bg-creme-100'}`}
                        >
                          <div className="flex items-center gap-2">
                            {getCategoryIcon(cat)}
                            <span className="truncate max-w-[200px]">{cat}</span>
                          </div>
                          {selectedCategories.includes(cat) && <Check size={16} />}
                        </button>
                      ))}
                      {filteredCategories.length === 0 && (
                        <p className="text-center text-sm text-gray-500 py-4">Nenhuma encontrada.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Supplier */}
            {availableSuppliers.length > 0 && (
              <div className="relative flex flex-col" ref={supplierDropdownRef}>
                <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                  <Truck size={14} /> Fornecedor
                </label>
                <button
                  onClick={() => setIsSupplierDropdownOpen(!isSupplierDropdownOpen)}
                  className={`h-10 flex items-center justify-between gap-3 px-4 bg-creme-50 border rounded-lg min-w-[160px] text-sm transition-all ${
                    selectedSuppliers.length > 0
                      ? 'border-purple-400 text-purple-700 font-semibold'
                      : 'border-creme-200 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="truncate">{selectedSuppliers.length === 0 ? 'Todos' : `${selectedSuppliers.length} sel.`}</span>
                  <ChevronDown size={14} className={`transition-transform shrink-0 ${isSupplierDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {isSupplierDropdownOpen && (
                  <div className="absolute top-full left-0 mt-2 w-72 max-h-80 overflow-y-auto bg-white border border-creme-200 rounded-xl shadow-2xl z-50 scrollbar-thin flex flex-col">
                    <div className="p-3 border-b border-creme-200 flex justify-between sticky top-0 bg-white z-10">
                      <button onClick={() => setSelectedSuppliers(availableSuppliers)} className="text-[11px] uppercase font-bold tracking-wider text-gray-500 hover:text-gray-900 px-2 py-1">Todos</button>
                      <button onClick={() => setSelectedSuppliers([])} className="text-[11px] uppercase font-bold tracking-wider text-gray-500 hover:text-purple-500 px-2 py-1">Limpar</button>
                    </div>
                    <div className="p-2 space-y-1">
                      {availableSuppliers.map(sup => (
                        <button
                          key={sup}
                          onClick={() => toggleSupplier(sup)}
                          className={`w-full text-left px-3 py-2.5 rounded-md text-sm flex items-center justify-between group transition-colors ${selectedSuppliers.includes(sup) ? 'bg-purple-50 text-purple-700 font-semibold' : 'text-gray-700 hover:bg-creme-100'}`}
                        >
                          <span className="truncate">{sup}</span>
                          {selectedSuppliers.includes(sup) && <Check size={16} />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Weight class */}
            <div className="relative flex flex-col" ref={weightDropdownRef}>
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                <Scale size={14} /> Classe de peso
              </label>
              <button
                onClick={() => setIsWeightDropdownOpen(!isWeightDropdownOpen)}
                className={`h-10 flex items-center justify-between gap-3 px-4 bg-creme-50 border rounded-lg min-w-[160px] text-sm transition-all ${
                  selectedWeightClasses.length > 0
                    ? 'border-blue-400 text-blue-700 font-semibold'
                    : 'border-creme-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="truncate">{selectedWeightClasses.length === 0 ? 'Todas' : `${selectedWeightClasses.length} sel.`}</span>
                <ChevronDown size={14} className={`transition-transform shrink-0 ${isWeightDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {isWeightDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white border border-creme-200 rounded-xl shadow-2xl z-50 scrollbar-thin flex flex-col">
                  <div className="p-3 border-b border-creme-200 flex justify-between sticky top-0 bg-white z-10">
                    <span className="text-[11px] uppercase font-bold tracking-wider text-gray-500 px-2 py-1">Classificação</span>
                    <button onClick={() => setSelectedWeightClasses([])} className="text-[11px] uppercase font-bold tracking-wider text-gray-500 hover:text-blue-500 px-2 py-1">Limpar</button>
                  </div>
                  <div className="p-2 space-y-1">
                    {WEIGHT_CLASSES.map(cls => (
                      <button
                        key={cls.label}
                        onClick={() => toggleWeightClass(cls.label)}
                        className={`w-full text-left px-3 py-2.5 rounded-md text-sm flex items-center justify-between group transition-colors ${selectedWeightClasses.includes(cls.label) ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-creme-100'}`}
                      >
                        <div className="flex flex-col">
                          <span>{cls.label}</span>
                          <span className="text-xs text-gray-500 font-mono">{cls.min}g – {cls.max}g</span>
                        </div>
                        {selectedWeightClasses.includes(cls.label) && <Check size={16} />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Scope segmented control */}
            <div className="flex flex-col">
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                <ListFilter size={14} /> Escopo
              </label>
              <div className="flex h-10 bg-creme-50 p-1 rounded-lg border border-creme-200">
                <button onClick={() => setFilterScope('positive')} className={`px-4 text-sm font-medium rounded-md transition-all ${filterScope === 'positive' ? 'bg-white text-esmeralda-500 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>Em estoque</button>
                <button onClick={() => setFilterScope('all')} className={`px-4 text-sm font-medium rounded-md transition-all ${filterScope === 'all' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>Todos</button>
                <button onClick={() => setFilterScope('critical')} className={`px-4 text-sm font-medium rounded-md transition-all ${filterScope === 'critical' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>Críticos</button>
                <button onClick={() => setFilterScope('zero')} className={`px-4 text-sm font-medium rounded-md transition-all ${filterScope === 'zero' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>Zerados</button>
              </div>
            </div>

          </div>

          {/* Active filter chips */}
          {(selectedCategories.length > 0 || selectedSuppliers.length > 0 || selectedWeightClasses.length > 0 || hiddenRowIds.size > 0) && (
            <div className="flex flex-wrap gap-2 items-center pt-4 mt-4 border-t border-creme-200">
              <span className="text-xs text-gray-500 uppercase tracking-widest font-semibold">Ativos:</span>
              {hiddenRowIds.size > 0 && (
                <button onClick={resetHiddenRows} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 rounded-full text-sm text-red-700 hover:bg-red-100 transition-colors font-medium">
                  <EyeOff size={12} /> {hiddenRowIds.size} ocultos <RefreshCcw size={12} />
                </button>
              )}
              {selectedCategories.map(cat => (
                <button key={cat} onClick={() => toggleCategory(cat)} className="flex items-center gap-1.5 px-3 py-1.5 bg-esmeralda-50 border border-esmeralda-200 rounded-full text-sm text-esmeralda-500 hover:bg-red-50 hover:border-red-200 hover:text-red-700 transition-colors font-medium">
                  {cat} <X size={12} />
                </button>
              ))}
              {selectedSuppliers.map(sup => (
                <button key={sup} onClick={() => toggleSupplier(sup)} className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-full text-sm text-purple-700 hover:bg-red-50 hover:border-red-200 hover:text-red-700 transition-colors font-medium">
                  <Truck size={12} /> {sup} <X size={12} />
                </button>
              ))}
              {selectedWeightClasses.map(cls => (
                <button key={cls} onClick={() => toggleWeightClass(cls)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-full text-sm text-blue-700 hover:bg-red-50 hover:border-red-200 hover:text-red-700 transition-colors font-medium">
                  <Weight size={12} /> {cls} <X size={12} />
                </button>
              ))}
              <button onClick={() => { setSelectedCategories([]); setSelectedSuppliers([]); setSelectedWeightClasses([]); resetHiddenRows(); }} className="text-sm text-gray-500 underline hover:text-gray-900 ml-2">Limpar tudo</button>
            </div>
          )}
        </section>

        {/* KPI HERO ROW — os quatro numeros que importam */}
        <section className="order-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-5">
          {/* Capital em estoque */}
          <div className="bg-white border border-creme-200 rounded-2xl p-6 relative overflow-hidden hover:border-esmeralda-300 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs uppercase tracking-[0.15em] font-semibold text-gray-500">Capital em estoque</p>
              <div className="p-2 rounded-lg bg-esmeralda-50 text-esmeralda-500">
                <DollarSign size={20} />
              </div>
            </div>
            <p className="text-3xl lg:text-4xl font-mono font-bold text-esmeralda-500 tabular-nums leading-none">
              {formatCurrency(analysis.totalStockValue)}
            </p>
            <p className="text-sm text-gray-500 mt-3">
              <span className="font-semibold text-gray-900">{formatNumber(analysis.totalItems)}</span> unidades em{' '}
              <span className="font-semibold text-gray-900">{formatNumber(analysis.productsInStock)}</span> SKUs ativos
            </p>
          </div>

          {/* Peso em ouro */}
          <div className="bg-white border border-creme-200 rounded-2xl p-6 hover:border-dourado transition-colors">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs uppercase tracking-[0.15em] font-semibold text-gray-500">Peso em ouro</p>
              <div className="p-2 rounded-lg bg-dourado-light/30 text-dourado-dark">
                <Scale size={20} />
              </div>
            </div>
            <p className="text-3xl lg:text-4xl font-mono font-bold text-gray-900 tabular-nums leading-none">
              {analysis.totalWeight > 0 ? formatNumber(analysis.totalWeight) : '—'} <span className="text-xl text-gray-500 font-sans">g</span>
            </p>
            <p className="text-sm text-gray-500 mt-3">
              Equivalente a <span className="font-semibold text-gray-900">{formatNumber(analysis.totalWeight / 1000)}&nbsp;kg</span> de metal
            </p>
          </div>

          {/* Vendas 12 semanas (com sparkline) */}
          <div className="bg-white border border-creme-200 rounded-2xl p-6 hover:border-emerald-300 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs uppercase tracking-[0.15em] font-semibold text-gray-500">Vendas · 12 sem</p>
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                <TrendingUp size={20} />
              </div>
            </div>
            <p className="text-3xl lg:text-4xl font-mono font-bold text-gray-900 tabular-nums leading-none">
              {weeklyAgg ? formatCurrency(weeklyAgg.total_valor) : '—'}
            </p>
            <div className="flex items-end justify-between gap-2 mt-3">
              <p className="text-sm text-gray-500">
                {weeklyAgg ? (
                  <>
                    <span className={weeklyAgg.delta_pct_vs_4sem_anteriores >= 0 ? 'text-emerald-600 font-semibold' : 'text-red-600 font-semibold'}>
                      {weeklyAgg.delta_pct_vs_4sem_anteriores >= 0 ? '▲' : '▼'} {Math.abs(weeklyAgg.delta_pct_vs_4sem_anteriores).toFixed(1)}%
                    </span>
                    {' '}vs 4 sem anteriores
                  </>
                ) : 'Carregando série…'}
              </p>
              <Sparkline values={weeklySeries.map(w => w.valor_total)} color="#059669" width={110} height={30} />
            </div>
          </div>

          {/* Preço médio / grama */}
          <div className="bg-white border border-creme-200 rounded-2xl p-6 hover:border-purple-300 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs uppercase tracking-[0.15em] font-semibold text-gray-500">Preço médio / grama</p>
              <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
                <DollarSign size={20} />
              </div>
            </div>
            <p className="text-3xl lg:text-4xl font-mono font-bold text-gray-900 tabular-nums leading-none">
              {formatCurrency(analysis.avgPricePerGram)}
            </p>
            <p className="text-sm text-gray-500 mt-3">
              {goldPrice && analysis.avgPricePerGram > 0 ? (
                <>Multiplicador <span className="font-semibold text-gray-900">{(analysis.avgPricePerGram / goldPrice.preco_24k_g).toFixed(2)}×</span> sobre o ouro 24k</>
              ) : 'Saída média por grama comercializada'}
            </p>
          </div>
        </section>

        {/* KPI ALERT ROW — tres cartoes de situacao (clicaveis) */}
        <section className="order-4 grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5">
          {/* Alerta crítico */}
          <button
            onClick={handleCriticalClick}
            className={`text-left bg-white border rounded-2xl p-6 transition-all ${filterScope === 'critical' ? 'border-red-400 shadow-[0_0_30px_rgba(248,113,113,0.15)] ring-1 ring-red-200' : 'border-creme-200 hover:border-red-300'}`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                </span>
                <p className="text-xs uppercase tracking-widest font-bold text-red-600">Alerta crítico</p>
              </div>
              <AlertCircle size={18} className="text-red-500" />
            </div>
            <p className="text-3xl font-mono font-bold text-red-600 tabular-nums leading-none">
              {formatCurrency(analysis.criticalCapital)}
            </p>
            <div className="flex items-center gap-4 mt-4 text-sm">
              <span className="text-gray-600"><span className="font-semibold text-red-600">{analysis.criticalCount}</span> peças</span>
              <span className="text-gray-400">·</span>
              <span className="text-gray-600">Ticket <span className="font-semibold text-gray-900">{formatCurrency(analysis.avgCriticalPrice)}</span></span>
            </div>
            <p className="text-[11px] uppercase tracking-wider text-gray-400 mt-3">Score ≥ 60 · Clique para filtrar</p>
          </button>

          {/* Estoque parado */}
          <button
            onClick={handleEstoqueParadoClick}
            className={`text-left bg-white border rounded-2xl p-6 transition-all ${filterScope === 'stale' ? 'border-orange-400 shadow-[0_0_30px_rgba(249,115,22,0.15)] ring-1 ring-orange-200' : 'border-creme-200 hover:border-orange-300'}`}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs uppercase tracking-widest font-bold text-orange-600">Parado &gt; 180 dias</p>
              <CalendarDays size={18} className="text-orange-500" />
            </div>
            <p className="text-3xl font-mono font-bold text-orange-600 tabular-nums leading-none">
              {formatCurrency(analysis.idleCapital)}
            </p>
            <div className="flex items-center gap-4 mt-4 text-sm">
              <span className="text-gray-600"><span className="font-semibold text-orange-600">{formatNumber(analysis.idleItemsCount)}</span> peças sem giro</span>
              {analysis.missingDateCount > 0 && (
                <>
                  <span className="text-gray-400">·</span>
                  <span className="text-red-500 font-medium">{analysis.missingDateCount} sem data</span>
                </>
              )}
            </div>
            <p className="text-[11px] uppercase tracking-wider text-gray-400 mt-3">Capital congelado · Clique para filtrar</p>
          </button>

          {/* Em reposição */}
          <div className="bg-white border border-creme-200 rounded-2xl p-6 hover:border-gray-300 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs uppercase tracking-widest font-bold text-gray-600">Em reposição</p>
              <Package size={18} className="text-gray-500" />
            </div>
            <p className="text-3xl font-mono font-bold text-gray-900 tabular-nums leading-none">
              {formatNumber(analysis.productsInReplenishment)}
            </p>
            <div className="flex items-center gap-4 mt-4 text-sm">
              <span className="text-gray-600">SKUs com saldo zero ou negativo</span>
            </div>
            <p className="text-[11px] uppercase tracking-wider text-gray-400 mt-3">Oportunidade de produção</p>
          </div>
        </section>

        {/* TOP CRITICAL ITEM — faixa destacada */}
        {analysis.topCriticalItem && (
          <section className="order-7 bg-gradient-to-r from-red-50 via-red-50 to-orange-50 border border-red-200 rounded-2xl p-5 lg:p-6">
            <div className="flex items-center justify-between gap-6 flex-wrap">
              <div className="flex items-start gap-4 min-w-0">
                <div className="p-3 bg-red-100 rounded-xl text-red-600 shrink-0">
                  <AlertCircle size={24} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-widest font-bold text-red-600 mb-1">Maior risco de capital</p>
                  <p className="font-mono text-sm text-gray-900 font-semibold truncate">
                    {analysis.topCriticalItem.sku} · {analysis.topCriticalItem.name}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    {analysis.topCriticalItem.stock} un × {formatCurrency(analysis.topCriticalItem.price)}
                    {analysis.topCriticalItem.idadeDias > 0 && <> · <span className="text-orange-600 font-medium">{analysis.topCriticalItem.idadeDias}d em estoque</span></>}
                    {' · '}
                    {analysis.topCriticalItem.diasSemVenda === null
                      ? <span className="text-red-600 font-semibold">nunca vendeu</span>
                      : <span className="text-red-600 font-semibold">{analysis.topCriticalItem.diasSemVenda}d sem venda</span>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-5">
                <div className="text-right">
                  <p className="text-[11px] uppercase tracking-widest text-gray-500 font-semibold">Capital parado</p>
                  <p className="text-2xl font-mono font-bold text-red-700 tabular-nums">{formatCurrency(analysis.topCriticalItem.totalValue)}</p>
                </div>
                <span className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-red-600 text-white font-mono font-bold text-xl shadow-lg">
                  {analysis.topCriticalItem.criticScore}
                </span>
              </div>
            </div>
          </section>
        )}

        {/* OPORTUNIDADES DE FABRICACAO — produtos zerados/desativados que JA venderam */}
        {oportunidades.length > 0 && (
          <section className="order-8 bg-white border border-esmeralda-200 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="px-6 py-5 border-b border-creme-200 bg-gradient-to-r from-esmeralda-50 via-white to-white">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-emerald-100 rounded-xl text-emerald-700 shrink-0">
                    <TrendingUp size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-serif font-semibold text-gray-900">
                      Oportunidades de fabricação
                    </h2>
                    <p className="text-sm text-gray-600 mt-1 max-w-2xl">
                      Peças <strong>que já venderam</strong> mas estão <strong>sem estoque</strong> ou desativadas.
                      Possível &ldquo;esquecimento&rdquo; de re-fabricação.
                    </p>
                  </div>
                </div>
                {oportunidadesTotais && (
                  <div className="flex gap-6 items-center flex-wrap">
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">SKUs candidatos</p>
                      <p className="text-2xl font-mono font-bold text-emerald-700 tabular-nums leading-none mt-1">
                        {formatNumber(oportunidadesTotais.qtd_skus)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Un vendidas (mostradas)</p>
                      <p className="text-2xl font-mono font-bold text-gray-900 tabular-nums leading-none mt-1">
                        {formatNumber(oportunidadesTotais.qtd_vendida_total_historica)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Receita histórica (mostradas)</p>
                      <p className="text-2xl font-mono font-bold text-esmeralda-500 tabular-nums leading-none mt-1">
                        {formatCurrency(oportunidadesTotais.receita_total_historica)}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Controles */}
              <div className="flex items-center gap-4 mt-5 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Mínimo de vendas</label>
                  <div className="flex h-9 bg-creme-50 p-1 rounded-lg border border-creme-200">
                    {[3, 5, 10, 25, 50].map(n => (
                      <button
                        key={n}
                        onClick={() => setOppMinVendas(n)}
                        className={`px-3 text-xs font-semibold rounded-md transition-all ${oppMinVendas === n ? 'bg-white text-esmeralda-500 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                      >
                        ≥ {n}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={oppIncluirExcluidos}
                    onChange={(e) => setOppIncluirExcluidos(e.target.checked)}
                    className="w-4 h-4 rounded border-creme-300 text-esmeralda-500 focus:ring-esmeralda-200"
                  />
                  <span className="text-sm text-gray-700">Incluir excluídos (situação &quot;E&quot;)</span>
                </label>
                {oppLoading && <Loader2 size={16} className="animate-spin text-esmeralda-500" />}
              </div>
            </div>

            {/* Grid de cards */}
            <div className="p-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                {oportunidades.map((opp) => {
                  const sitLabel = opp.situacao === 'A' ? 'Ativo · Zerado'
                                 : opp.situacao === 'I' ? 'Inativo'
                                 : opp.situacao === 'E' ? 'Excluído'
                                 : 'Sem situação';
                  const sitCor = opp.situacao === 'A' ? 'bg-amber-50 text-amber-700 border-amber-200'
                               : opp.situacao === 'I' ? 'bg-gray-100 text-gray-700 border-gray-200'
                                                       : 'bg-red-50 text-red-700 border-red-200';
                  const diasUltVenda = opp.data_ultima_venda
                    ? Math.floor((Date.now() - new Date(opp.data_ultima_venda).getTime()) / 86400000)
                    : null;
                  const isQuente = opp.vendas_90d > 0;
                  return (
                    <div
                      key={opp.id_produto}
                      className={`group relative flex flex-col bg-white border rounded-xl overflow-hidden transition-all hover:shadow-lg ${isQuente ? 'border-emerald-300 hover:border-emerald-400' : 'border-creme-200 hover:border-esmeralda-300'}`}
                    >
                      {/* Imagem */}
                      <div className="relative w-full aspect-square bg-creme-100 overflow-hidden">
                        {opp.imagem_capa ? (
                          <img
                            src={opp.imagem_capa}
                            alt={opp.nome}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300">
                            <Gem size={40} />
                          </div>
                        )}
                        {/* Badge situacao */}
                        <span className={`absolute top-2 left-2 px-2 py-0.5 text-[10px] font-bold rounded-md border backdrop-blur-sm bg-white/85 ${sitCor}`}>
                          {sitLabel}
                        </span>
                        {/* Quantidade vendida — NUMERO GRANDE no canto dir */}
                        <div className="absolute bottom-0 right-0 bg-gradient-to-bl from-esmeralda-600 to-esmeralda-500 text-white px-3 py-1.5 rounded-tl-xl">
                          <p className="text-[9px] uppercase tracking-wider font-bold leading-none opacity-80">Vendidos</p>
                          <p className="text-lg font-mono font-bold tabular-nums leading-tight">
                            {formatNumber(opp.qtd_vendida_total)}
                          </p>
                        </div>
                        {/* Flag "ainda quente" (vendeu nos ultimos 90d) */}
                        {isQuente && (
                          <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-white bg-red-500 rounded-full shadow-md">
                            🔥 {opp.vendas_90d} em 90d
                          </span>
                        )}
                      </div>

                      {/* Info */}
                      <div className="p-3 space-y-1">
                        <p className="font-mono text-xs text-gray-500 truncate">{opp.sku}</p>
                        <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-tight min-h-[2.5rem]">
                          {opp.nome}
                        </p>
                        {opp.categoria && (
                          <p className="text-[10px] text-gray-500 truncate uppercase tracking-wider">{opp.categoria}</p>
                        )}
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-sm font-mono font-bold text-esmeralda-500 tabular-nums">
                            {formatCurrency(opp.receita_total)}
                          </span>
                          {opp.peso_precificado && opp.peso_precificado > 0 && (
                            <span className="text-[11px] text-gray-500 font-mono">
                              {opp.peso_precificado.toFixed(2)}g
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500">
                          {diasUltVenda === null
                            ? 'sem data'
                            : diasUltVenda < 30
                            ? <span className="text-emerald-600 font-semibold">Vendeu há {diasUltVenda}d</span>
                            : diasUltVenda < 180
                            ? <span className="text-amber-600">Vendeu há {diasUltVenda}d</span>
                            : <>Vendeu há {diasUltVenda >= 365 ? `${Math.floor(diasUltVenda / 365)}a` : `${diasUltVenda}d`}</>}
                          {opp.vendas_365d > 0 && (
                            <> · <span className="font-semibold text-gray-700">{opp.vendas_365d}</span> em 12m</>
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Ver mais / menos */}
              {oportunidadesTotais && oportunidadesTotais.qtd_skus > 0 && (
                <div className="flex items-center justify-between mt-5 pt-5 border-t border-creme-200 flex-wrap gap-3">
                  <p className="text-sm text-gray-600">
                    Mostrando <strong className="text-gray-900">{oportunidades.length}</strong> de <strong className="text-esmeralda-500">{oportunidadesTotais.qtd_skus}</strong> candidatos.
                    {(() => {
                      const quentes = oportunidades.filter(o => o.vendas_90d > 0).length;
                      return quentes > 0 ? (
                        <> · <span className="text-red-600 font-semibold">{quentes} ainda vendendo em 90d 🔥</span></>
                      ) : null;
                    })()}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setOppExpanded(!oppExpanded)}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-esmeralda-500 text-white hover:bg-esmeralda-600 transition-colors"
                    >
                      {oppExpanded ? 'Ver menos' : `Ver top 200`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* DISTRIBUTION BY WEIGHT CLASS */}
        {analysis.distributionStats.length > 0 && (
          <section className="order-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h2 className="text-xl font-serif font-semibold text-gray-900 flex items-center gap-2">
                <PieChart size={20} className="text-esmeralda-500" />
                {distributionMode === 'weight' ? 'Distribuição por classe de peso' : 'Heatmap Categoria × Peso'}
              </h2>
              <div className="flex items-center gap-3">
                <p className="text-sm text-gray-500">
                  {distributionMode === 'weight'
                    ? `${analysis.distributionStats.length} classes com volume`
                    : `${analysis.heatmap.categorias.length} categorias · ${analysis.heatmap.classes.length} classes`}
                </p>
                <div className="flex h-9 bg-creme-50 p-1 rounded-lg border border-creme-200">
                  <button
                    onClick={() => setDistributionMode('weight')}
                    className={`px-3 text-xs font-semibold rounded-md transition-all ${distributionMode === 'weight' ? 'bg-white text-esmeralda-500 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                  >
                    Cartões
                  </button>
                  <button
                    onClick={() => setDistributionMode('heatmap')}
                    className={`px-3 text-xs font-semibold rounded-md transition-all ${distributionMode === 'heatmap' ? 'bg-white text-esmeralda-500 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                  >
                    Heatmap
                  </button>
                </div>
              </div>
            </div>

            {distributionMode === 'weight' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {analysis.distributionStats.map((stat) => {
                  const range = WEIGHT_CLASSES.find(w => w.label === stat.label);
                  const isSelected = selectedWeightClasses.includes(stat.label);
                  return (
                    <button
                      key={stat.label}
                      onClick={() => toggleWeightClass(stat.label)}
                      className={`text-left bg-white border rounded-xl p-5 cursor-pointer transition-all ${isSelected ? 'border-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.15)] ring-1 ring-blue-200' : 'border-creme-200 hover:border-gray-300'}`}
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <p className="text-base font-semibold text-gray-900">{stat.label}</p>
                          {range && (
                            <p className="text-xs text-gray-500 font-mono mt-0.5">{range.min}g – {range.max}g</p>
                          )}
                        </div>
                        <span className="text-xs font-semibold text-gray-700 bg-creme-100 px-2.5 py-1 rounded-full">
                          {formatNumber(stat.count)} un
                        </span>
                      </div>
                      <div className="mb-3">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-blue-600 font-semibold">Peso</span>
                          <span className="text-gray-500 font-mono">{formatNumber(stat.weightShare)}%</span>
                        </div>
                        <div className="w-full bg-creme-100 h-2 rounded-full overflow-hidden">
                          <div className="bg-blue-500 h-full rounded-full" style={{ width: `${stat.weightShare}%` }} />
                        </div>
                        <p className="text-xs text-gray-500 text-right mt-1 font-mono">{formatNumber(stat.weight)}g</p>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-esmeralda-500 font-semibold">Valor</span>
                          <span className="text-gray-500 font-mono">{formatNumber(stat.valueShare)}%</span>
                        </div>
                        <div className="w-full bg-creme-100 h-2 rounded-full overflow-hidden">
                          <div className="bg-esmeralda-500 h-full rounded-full" style={{ width: `${stat.valueShare}%` }} />
                        </div>
                        <p className="text-xs text-gray-500 text-right mt-1 font-mono">{formatCurrency(stat.value)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              /* HEATMAP Categoria × Classe de Peso */
              <div className="bg-white border border-creme-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-creme-50">
                      <tr>
                        <th className="px-4 py-3 border-b border-creme-200 text-xs uppercase tracking-widest font-bold text-gray-600 sticky left-0 bg-creme-50 z-10">
                          Categoria
                        </th>
                        {analysis.heatmap.classes.map(cls => (
                          <th key={cls} className="px-3 py-3 border-b border-creme-200 text-xs uppercase tracking-wider font-bold text-gray-600 text-center whitespace-nowrap">
                            {cls}
                          </th>
                        ))}
                        <th className="px-4 py-3 border-b border-creme-200 text-xs uppercase tracking-widest font-bold text-esmeralda-500 text-right">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.heatmap.categorias.map(cat => {
                        const rowMap = analysis.heatmap.cells.get(cat);
                        const rowTotal = rowMap ? Array.from(rowMap.values()).reduce((a, c) => a + c.value, 0) : 0;
                        return (
                          <tr key={cat} className="hover:bg-creme-50/50 transition-colors">
                            <td className="px-4 py-3 border-b border-creme-200 font-semibold text-gray-900 text-sm sticky left-0 bg-white z-10 whitespace-nowrap">
                              {cat}
                            </td>
                            {analysis.heatmap.classes.map(cls => {
                              const cell = rowMap?.get(cls);
                              const value = cell?.value ?? 0;
                              const intensity = analysis.heatmap.maxValue > 0 ? value / analysis.heatmap.maxValue : 0;
                              // Gradiente esmeralda: claro quando frio, saturado quando quente
                              const alpha = intensity === 0 ? 0 : 0.15 + intensity * 0.75;
                              const bg = `rgba(24, 64, 54, ${alpha})`;
                              const textColor = intensity > 0.55 ? 'text-white' : 'text-gray-700';
                              const isSelectable = cell && cell.count > 0;
                              return (
                                <td
                                  key={cls}
                                  className={`px-3 py-3 border-b border-creme-200 text-center text-xs font-mono tabular-nums transition-all ${textColor} ${isSelectable ? 'cursor-pointer hover:scale-[1.03]' : ''}`}
                                  style={{ backgroundColor: bg }}
                                  title={cell ? `${formatCurrency(cell.value)} · ${cell.count} un · ${formatNumber(cell.weight)}g` : '—'}
                                  onClick={() => {
                                    if (!isSelectable) return;
                                    // Clique aplica filtro combinado: categoria + classe de peso
                                    setSelectedCategories([cat]);
                                    setSelectedWeightClasses([cls]);
                                  }}
                                >
                                  {value > 0 ? (
                                    <>
                                      {value >= 1000 ? `R$ ${(value / 1000).toFixed(0)}k` : `R$ ${value.toFixed(0)}`}
                                      <br />
                                      <span className="opacity-70">{cell?.count} un</span>
                                    </>
                                  ) : <span className="text-gray-300">—</span>}
                                </td>
                              );
                            })}
                            <td className="px-4 py-3 border-b border-creme-200 text-right font-mono font-semibold text-esmeralda-500 tabular-nums text-sm whitespace-nowrap">
                              {formatCurrency(rowTotal)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2 bg-creme-50 border-t border-creme-200 flex items-center gap-2 text-xs text-gray-600">
                  <span>Intensidade ∝ capital imobilizado.</span>
                  <span>Clique em uma célula para filtrar categoria + classe de peso.</span>
                </div>
              </div>
            )}
          </section>
        )}

        {/* DETAILED MATRIX — sempre visivel, logo apos os KPIs via order-5. Suporta fullscreen. */}
        {(
          <section
            id="detailed-matrix"
            className={
              isMatrixFullscreen
                ? 'fixed inset-0 z-[55] bg-white border border-creme-200 overflow-hidden flex flex-col'
                : 'order-5 bg-white border border-creme-200 rounded-2xl overflow-hidden flex flex-col scroll-mt-6'
            }
            style={isMatrixFullscreen ? undefined : { minHeight: '720px' }}
          >
            {/* Toolbar */}
            <div className="px-6 py-4 border-b border-creme-200 flex flex-wrap items-center justify-between gap-4 bg-white">
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-serif font-semibold text-gray-900 flex items-center gap-2">
                  <ArrowDownWideNarrow size={20} className="text-esmeralda-500" />
                  {viewMode === 'gallery' ? 'Galeria de ativos' : 'Matriz detalhada de ativos'}
                </h2>
                {/* Toggle tabela / galeria */}
                <div className="flex h-9 bg-creme-50 p-1 rounded-lg border border-creme-200">
                  <button
                    onClick={() => setViewMode('table')}
                    className={`px-3 text-xs font-semibold rounded-md transition-all ${viewMode === 'table' ? 'bg-white text-esmeralda-500 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                    title="Tabela"
                  >
                    Tabela
                  </button>
                  <button
                    onClick={() => setViewMode('gallery')}
                    className={`px-3 text-xs font-semibold rounded-md transition-all ${viewMode === 'gallery' ? 'bg-white text-esmeralda-500 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                    title="Galeria visual"
                  >
                    Galeria
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Seleção em massa (compacto) */}
                <div className="flex items-center gap-1 bg-creme-50 rounded-lg border border-creme-200 px-1.5 h-9">
                  <button
                    onClick={toggleAll}
                    className="p-1.5 rounded hover:bg-white text-gray-600 hover:text-esmeralda-500 transition-colors"
                    title={selectedRows.size === analysis.fullList.length && analysis.fullList.length > 0 ? 'Limpar seleção' : 'Selecionar todos'}
                  >
                    {selectedRows.size === analysis.fullList.length && analysis.fullList.length > 0
                      ? <CheckSquare size={16} className="text-esmeralda-500" />
                      : <Square size={16} />}
                  </button>
                  <input
                    type="number"
                    value={bulkSelectCount}
                    onChange={(e) => setBulkSelectCount(e.target.value)}
                    placeholder="N"
                    className="w-12 bg-transparent text-sm text-center text-gray-700 focus:outline-none placeholder-gray-400"
                    title="Selecionar os primeiros N"
                  />
                  <button
                    onClick={handleBulkSelect}
                    disabled={!bulkSelectCount}
                    className="p-1.5 rounded bg-esmeralda-50 text-esmeralda-500 hover:bg-esmeralda-500 hover:text-white disabled:opacity-30 transition-all"
                    title="Selecionar os primeiros N itens"
                  >
                    <Check size={14} />
                  </button>
                  {selectedRows.size > 0 && (
                    <span className="text-xs font-mono text-gray-600 px-2 border-l border-creme-200 ml-1">
                      {selectedRows.size} sel.
                    </span>
                  )}
                </div>

                {selectedRows.size > 0 && (
                  <div className="flex items-center gap-2">
                    {onPromotion && (
                      <button
                        onClick={() => onPromotion(analysis.fullList.filter(item => selectedRows.has(item.uniqueId)).map(item => item.original))}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-esmeralda-300 bg-esmeralda-50 text-esmeralda-500 text-sm font-semibold hover:bg-esmeralda-100 transition-colors"
                      >
                        <Tag size={14} />
                        Promoção
                      </button>
                    )}
                    <button
                      onClick={downloadCSV}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-esmeralda-500 text-white text-sm font-semibold hover:bg-esmeralda-600 transition-colors shadow-sm"
                    >
                      <Download size={14} />
                      Exportar
                    </button>
                  </div>
                )}

                {/* VISTAS NOMEADAS (filtros salvos) */}
                <div className="relative" ref={viewsDropdownRef}>
                  <button
                    onClick={() => setIsViewsDropdownOpen(!isViewsDropdownOpen)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${activeViewId !== null ? 'bg-esmeralda-50 text-esmeralda-500 border-esmeralda-300' : 'bg-white border-creme-200 text-gray-700 hover:border-esmeralda-300'}`}
                    title="Vistas salvas (filtros)"
                  >
                    <Bookmark size={14} />
                    <span className="hidden sm:inline">
                      {activeViewId !== null
                        ? userViews.find(v => v.id === activeViewId)?.nome ?? 'Vistas'
                        : 'Vistas'}
                    </span>
                    {userViews.length > 0 && (
                      <span className="px-1.5 text-[10px] font-mono font-bold bg-esmeralda-500 text-white rounded-full">{userViews.length}</span>
                    )}
                    <ChevronDown size={12} className={`transition-transform ${isViewsDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isViewsDropdownOpen && (
                    <div className="absolute top-full right-0 mt-2 w-80 max-h-[450px] overflow-y-auto bg-white border border-creme-200 rounded-xl shadow-2xl z-50 scrollbar-thin">
                      <div className="p-3 border-b border-creme-200 bg-white sticky top-0 flex items-center justify-between">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Minhas vistas</h4>
                        <button
                          onClick={() => { setShowSaveViewModal(true); setIsViewsDropdownOpen(false); }}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-esmeralda-500 text-white text-xs font-semibold hover:bg-esmeralda-600 transition-colors"
                        >
                          + Nova
                        </button>
                      </div>
                      <div className="p-2 space-y-1">
                        {userViews.length === 0 ? (
                          <p className="text-center text-sm text-gray-500 py-6 px-3">
                            Nenhuma vista salva ainda. Configure filtros e clique em <strong className="text-esmeralda-500">Nova</strong>.
                          </p>
                        ) : (
                          userViews.map(v => (
                            <div key={v.id} className={`group flex items-center justify-between gap-2 px-3 py-2.5 rounded-md transition-colors ${activeViewId === v.id ? 'bg-esmeralda-50' : 'hover:bg-creme-100'}`}>
                              <button
                                onClick={() => applySavedView(v)}
                                className="flex-1 text-left min-w-0"
                              >
                                <p className={`text-sm font-semibold truncate ${activeViewId === v.id ? 'text-esmeralda-500' : 'text-gray-900'}`}>{v.nome}</p>
                                <p className="text-xs text-gray-500 truncate">
                                  {[
                                    (v.filtros.scope as string) && (v.filtros.scope as string) !== 'all' ? `escopo: ${v.filtros.scope}` : null,
                                    Array.isArray(v.filtros.categorias) && v.filtros.categorias.length ? `${v.filtros.categorias.length} cat.` : null,
                                    Array.isArray(v.filtros.classes_peso) && v.filtros.classes_peso.length ? `${v.filtros.classes_peso.length} peso` : null,
                                  ].filter(Boolean).join(' · ') || 'sem filtros'}
                                </p>
                              </button>
                              <button
                                onClick={() => deleteView(v.id)}
                                className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Excluir"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleSaveConfig}
                  disabled={isSavingConfig}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${configSaved ? 'bg-green-50 text-green-700 border-green-300' : 'bg-white border-creme-200 text-gray-700 hover:border-esmeralda-300'}`}
                  title="Salvar colunas e ordenação como padrão"
                >
                  {isSavingConfig ? <Loader2 size={14} className="animate-spin" /> : configSaved ? <Check size={14} /> : <Save size={14} />}
                  <span className="hidden sm:inline">{configSaved ? 'Salvo' : 'Salvar colunas'}</span>
                </button>

                <div className="relative" ref={columnSelectorRef}>
                  <button
                    onClick={() => setIsColumnSelectorOpen(!isColumnSelectorOpen)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${isColumnSelectorOpen ? 'bg-esmeralda-500 text-white border-esmeralda-500' : 'bg-white border-creme-200 text-gray-700 hover:border-esmeralda-300'}`}
                  >
                    <Columns size={14} />
                    <span className="hidden sm:inline">Colunas</span>
                    <ChevronDown size={12} className={`transition-transform ${isColumnSelectorOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isColumnSelectorOpen && (
                    <div className="absolute top-full right-0 mt-2 w-72 max-h-96 overflow-y-auto bg-white border border-creme-200 rounded-xl shadow-2xl z-50 scrollbar-thin">
                      <div className="p-3 border-b border-creme-200 bg-white sticky top-0">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Personalizar colunas</h4>
                      </div>
                      <div className="p-2 space-y-1">
                        {metrics.allKeys.map(key => (
                          <button
                            key={key}
                            onClick={() => toggleColumn(key)}
                            className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between group transition-colors ${visibleColumns.includes(key) ? 'bg-esmeralda-50 text-esmeralda-500 font-semibold' : 'text-gray-700 hover:bg-creme-100'}`}
                          >
                            <span className="truncate">{key}</span>
                            {visibleColumns.includes(key) && <Check size={14} />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Fullscreen toggle */}
                <button
                  onClick={() => setIsMatrixFullscreen(!isMatrixFullscreen)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all bg-white border-creme-200 text-gray-700 hover:border-esmeralda-300 hover:text-esmeralda-500"
                  title={isMatrixFullscreen ? 'Sair da tela cheia (Esc)' : 'Expandir em tela cheia'}
                >
                  {isMatrixFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  <span className="hidden lg:inline">{isMatrixFullscreen ? 'Sair' : 'Tela cheia'}</span>
                </button>

                <div className="flex items-center gap-1 bg-creme-50 rounded-lg p-1 border border-creme-200">
                  <button
                    onClick={handlePrev}
                    disabled={currentPage === 0 || loading}
                    className="p-2 rounded hover:bg-white text-gray-600 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm font-mono w-16 text-center text-gray-700">Pág {currentPage + 1}</span>
                  <button
                    onClick={handleNext}
                    disabled={loading || (analysis && (currentPage + 1) * PAGE_SIZE >= analysis.filteredCount)}
                    className="p-2 rounded hover:bg-white text-gray-600 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* Table / Gallery */}
            {viewMode === 'gallery' ? (
              <div className="flex-1 min-w-0 overflow-auto scrollbar-thin p-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4">
                  {tableData.map((row) => {
                    const img = row.imagemCapa ?? null;
                    const scoreCor = scoreCorClass(row.criticScore ?? 0);
                    const abcCor = abcCorClass(row.abcClass);
                    return (
                      <button
                        key={row.uniqueId}
                        onClick={() => toggleRow(row.uniqueId)}
                        className={`group relative flex flex-col bg-white border rounded-xl overflow-hidden transition-all text-left ${selectedRows.has(row.uniqueId) ? 'border-esmeralda-400 shadow-[0_0_0_2px_rgba(24,64,54,0.2)]' : 'border-creme-200 hover:border-esmeralda-300 hover:shadow-md'}`}
                      >
                        {/* Imagem */}
                        <div className="relative w-full aspect-square bg-creme-100 overflow-hidden">
                          {img ? (
                            <img
                              src={img}
                              alt={row.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-300">
                              <Gem size={48} />
                            </div>
                          )}
                          {/* Badges sobrepostos */}
                          <div className="absolute top-2 left-2 flex gap-1">
                            <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-xs font-bold font-mono shadow-md ${abcCor}`}>
                              {row.abcClass}
                            </span>
                          </div>
                          <div className="absolute top-2 right-2">
                            <span className={`inline-flex items-center justify-center w-10 h-7 rounded-md text-xs font-bold font-mono text-white shadow-md ${scoreCor}`}>
                              {row.criticScore ?? 0}
                            </span>
                          </div>
                          {selectedRows.has(row.uniqueId) && (
                            <div className="absolute inset-0 bg-esmeralda-500/20 flex items-center justify-center">
                              <div className="bg-esmeralda-500 text-white p-2 rounded-full shadow-lg">
                                <Check size={20} />
                              </div>
                            </div>
                          )}
                        </div>
                        {/* Info */}
                        <div className="p-3 space-y-1">
                          <p className="font-mono text-xs text-gray-500 truncate">{row.sku}</p>
                          <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-tight min-h-[2.5rem]">{row.name}</p>
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-sm font-mono font-bold text-esmeralda-500 tabular-nums">
                              {formatCurrency(row.totalValue)}
                            </span>
                            <span className="text-xs text-gray-500">
                              {row.stock}un
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-500">
                            {row.diasSemVenda === null
                              ? <span className="text-red-600 font-semibold">sem venda</span>
                              : <>{row.diasSemVenda}d parado</>}
                            {row.dio !== null && <> · DIO {row.dio > 999 ? '999+' : row.dio}d</>}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {tableData.length === 0 && (
                  <div className="py-16 text-center text-gray-500 text-base">
                    Nenhum registro encontrado para este filtro.
                  </div>
                )}
              </div>
            ) : (
            <div className="flex-1 min-w-0 overflow-auto scrollbar-thin">
              <table className="w-full text-left table-fixed">
                <thead className="bg-creme-50 sticky top-0 z-10 text-xs uppercase tracking-widest font-bold text-gray-600">
                  <tr>
                    {/* Coluna única fixa: checkbox + ações on-hover */}
                    <th className="px-2 py-3 border-b border-creme-200 w-[52px] text-center sticky left-0 z-30 bg-creme-50">
                      <button
                        onClick={toggleAll}
                        className="p-1 rounded hover:bg-white text-gray-600 hover:text-esmeralda-500 transition-colors"
                        title={selectedRows.size === analysis.fullList.length && analysis.fullList.length > 0 ? 'Limpar seleção' : 'Selecionar todos'}
                      >
                        {selectedRows.size === analysis.fullList.length && analysis.fullList.length > 0
                          ? <CheckSquare size={16} className="text-esmeralda-500" />
                          : <Square size={16} />}
                      </button>
                    </th>

                    {visibleColumns.map(colKey => {
                      const lay = colLayout(colKey);
                      const alignCls = lay.align === 'right' ? 'text-right justify-end' : lay.align === 'center' ? 'text-center justify-center' : 'text-left';
                      // Label amigavel — sem underscores
                      const label = colKey
                        .replace(/_/g, ' ')
                        .replace(/\bdata ultima\b/gi, 'Últ.')
                        .replace(/\bpreco tiny\b/gi, 'Preço')
                        .replace(/\bpreco sync\b/gi, 'Preço calc')
                        .replace(/\bsaldo estoque\b/gi, 'Estoque')
                        .replace(/\bqtd vendas\b/gi, 'Vendas')
                        .replace(/\btipo metal\b/gi, 'Metal')
                        .replace(/\btem pedra preciosa\b/gi, 'Pedra')
                        .replace(/\bpeso precificado\b/gi, 'Peso');
                      return (
                        <th
                          key={colKey}
                          className={`px-2 py-2.5 border-b border-creme-200 cursor-pointer hover:text-esmeralda-500 hover:bg-white transition-colors ${lay.cls} ${alignCls}`}
                          onClick={() => handleSort(colKey)}
                          title={colKey}
                        >
                          <div className={`flex items-center gap-1 ${alignCls}`}>
                            <span className="truncate">{label}</span>
                            <SortIcon colKey={colKey} />
                          </div>
                        </th>
                      );
                    })}

                    <th
                      className="px-1 py-2.5 border-b border-creme-200 text-center cursor-pointer hover:bg-white transition-colors w-[44px] whitespace-nowrap"
                      onClick={() => handleSort('abcClass' as SortKey)}
                      title="ABC · Pareto sobre a receita dos últimos 12 meses (sem venda em 12m = C)"
                    >
                      <div className="flex items-center justify-center gap-0.5">
                        ABC
                        <SortIcon colKey={'abcClass' as SortKey} />
                      </div>
                    </th>
                    <th
                      className="px-1 py-2.5 border-b border-creme-200 text-center cursor-pointer hover:bg-white transition-colors w-[56px] whitespace-nowrap"
                      onClick={() => handleSort('dio' as SortKey)}
                      title="DIO · dias até esgotar no ritmo atual (estoque / vendas 90d × 90)"
                    >
                      <div className="flex items-center justify-center gap-0.5">
                        DIO
                        <SortIcon colKey={'dio' as SortKey} />
                      </div>
                    </th>
                    <th
                      className="px-1 py-2.5 border-b border-creme-200 text-center text-red-600 cursor-pointer hover:bg-white transition-colors w-[56px] whitespace-nowrap"
                      onClick={() => handleSort('criticScore' as SortKey)}
                      title="Score de criticidade 0-100"
                    >
                      <div className="flex items-center justify-center gap-0.5">
                        Score
                        <SortIcon colKey={'criticScore' as SortKey} />
                      </div>
                    </th>
                    <th
                      className="px-2 py-2.5 border-b border-creme-200 text-right text-esmeralda-500 cursor-pointer hover:bg-white transition-colors w-[88px] whitespace-nowrap"
                      onClick={() => handleSort('totalValue')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Valor
                        <SortIcon colKey="totalValue" />
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-creme-200">
                  {tableData.length === 0 ? (
                    <tr>
                      <td colSpan={visibleColumns.length + 5} className="px-6 py-16 text-center text-gray-500 text-base">
                        Nenhum registro encontrado para este filtro.
                      </td>
                    </tr>
                  ) : (
                    tableData.map((row, idx) => {
                      const isEditing = editingId === row.uniqueId;
                      const isSelected = selectedRows.has(row.uniqueId);

                      return (
                        <tr key={idx} className={`transition-colors group ${isEditing ? 'bg-esmeralda-50/50' : isSelected ? 'bg-esmeralda-50/30' : 'hover:bg-creme-50'}`}>
                          {/* Coluna única fixa: checkbox visível, ações aparecem on-hover à direita */}
                          <td className="px-2 py-2 sticky left-0 z-20 bg-white group-hover:bg-creme-50 border-r border-creme-200 w-[52px]">
                            <div className="flex items-center justify-center gap-0.5 relative">
                              <button
                                onClick={() => toggleRow(row.uniqueId)}
                                className={`p-1 rounded transition-colors ${isSelected ? 'text-esmeralda-500' : 'text-gray-400 hover:text-gray-700'}`}
                                title="Selecionar"
                              >
                                {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                              </button>
                              {/* Ações flutuantes on-hover (não ocupam coluna) */}
                              <div className="absolute left-full top-1/2 -translate-y-1/2 flex items-center gap-0.5 pl-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white group-hover:bg-creme-50 pr-1 rounded-r-md z-30">
                                {isEditing ? (
                                  <>
                                    <button
                                      onClick={() => saveEditing(metrics.idKey!)}
                                      className="p-1 rounded-md bg-esmeralda-50 text-esmeralda-500 hover:bg-esmeralda-500 hover:text-white transition-colors"
                                      title="Salvar"
                                      disabled={isSaving}
                                    >
                                      {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                    </button>
                                    <button
                                      onClick={cancelEditing}
                                      className="p-1 rounded-md text-red-500 hover:bg-red-50 transition-colors"
                                      title="Cancelar"
                                      disabled={isSaving}
                                    >
                                      <X size={12} />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => startEditing(row)}
                                      className="p-1 rounded-md text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                      title="Editar"
                                    >
                                      <Pencil size={12} />
                                    </button>
                                    <button
                                      onClick={() => hideRow(row.uniqueId)}
                                      className="p-1 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                                      title="Ocultar"
                                    >
                                      <EyeOff size={12} />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Dynamic columns */}
                          {visibleColumns.map(colKey => {
                            // preco_curva null → fallback preco_tiny para exibição
                            const rawVal = row.original[colKey];
                            const emPromocaoRow = Boolean(row.original['em_promocao']);
                            const precoVigenteRow = row.original['preco_vigente'];
                            const val = (colKey === 'preco_curva' && (rawVal === null || rawVal === undefined))
                              ? (row.original['preco_tiny'] ?? null)
                              : rawVal;
                            let display: React.ReactNode = val;

                            if (isEditing) {
                              const isNumber = typeof val === 'number';
                              const isBoolean = typeof val === 'boolean';
                              if (isBoolean) {
                                display = (
                                  <select
                                    value={String(editForm[colKey])}
                                    onChange={(e) => handleEditChange(colKey, e.target.value)}
                                    className="bg-white border border-esmeralda-300 text-gray-900 text-sm rounded px-2 py-1 focus:outline-none"
                                  >
                                    <option value="true">Sim</option>
                                    <option value="false">Não</option>
                                  </select>
                                );
                              } else {
                                display = (
                                  <input
                                    type={isNumber ? "number" : "text"}
                                    value={editForm[colKey] || ''}
                                    onChange={(e) => handleEditChange(colKey, e.target.value)}
                                    className="bg-white border border-esmeralda-300 text-gray-900 text-sm rounded px-2 py-1 w-full min-w-[80px] focus:border-esmeralda-500 focus:outline-none"
                                  />
                                );
                              }
                            } else {
                              // ── data_ultima_venda: só data + cor por recência ──
                              if (colKey === 'data_ultima_venda') {
                                if (!val) {
                                  display = <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700">sem venda</span>;
                                } else {
                                  let dataFmt = String(val);
                                  let dias = 0;
                                  try {
                                    const datePart = String(val).split('T')[0];
                                    const [yyyy, mm, dd] = datePart.split('-');
                                    dataFmt = `${dd}/${mm}/${yyyy}`;
                                    dias = Math.floor((Date.now() - new Date(`${yyyy}-${mm}-${dd}`).getTime()) / 86400000);
                                  } catch { /* keep raw */ }
                                  const cls =
                                    dias < 30  ? 'bg-emerald-50 text-emerald-700'  :
                                    dias < 180 ? 'bg-creme-100 text-gray-700'       :
                                    dias < 365 ? 'bg-orange-50 text-orange-700'    :
                                                 'bg-red-50 text-red-600';
                                  display = (
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono ${cls}`} title={`Vendeu há ${dias} dias`}>
                                      {dataFmt}
                                    </span>
                                  );
                                }
                              }
                              // ── qtd_vendas: badge com saude propria ──
                              else if (colKey === 'qtd_vendas') {
                                const qtd = Number(val ?? 0);
                                if (qtd === 0) {
                                  display = <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700">0</span>;
                                } else {
                                  const cls =
                                    qtd >= 50 ? 'bg-emerald-500 text-white'        :
                                    qtd >= 20 ? 'bg-emerald-100 text-emerald-700' :
                                    qtd >= 6  ? 'bg-blue-50 text-blue-700'         :
                                                'bg-creme-100 text-gray-700';
                                  display = (
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold font-mono ${cls}`} title={`${qtd} venda${qtd === 1 ? '' : 's'} no histórico`}>
                                      {qtd}
                                    </span>
                                  );
                                }
                              }
                              // ── data_ultima_compra: badge de frescor do estoque ──
                              else if (colKey === 'data_ultima_compra' || colKey === 'ultima_compra') {
                                if (!val) {
                                  display = <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-gray-100 text-gray-400">sem registro</span>;
                                } else {
                                  let dataFmt = String(val);
                                  let dias = 0;
                                  try {
                                    const datePart = String(val).split('T')[0];
                                    const [yyyy, mm, dd] = datePart.split('-');
                                    dataFmt = `${dd}/${mm}/${yyyy}`;
                                    dias = Math.floor((Date.now() - new Date(`${yyyy}-${mm}-${dd}`).getTime()) / 86400000);
                                  } catch { /* keep raw */ }
                                  const cls =
                                    dias < 30  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                    dias < 90  ? 'bg-blue-50 text-blue-700 border border-blue-200'           :
                                    dias < 180 ? 'bg-creme-100 text-gray-700'                               :
                                    dias < 365 ? 'bg-amber-50 text-amber-700'                               :
                                                 'bg-red-50 text-red-600';
                                  display = (
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono ${cls}`} title={`Entrou no estoque há ${dias} dias`}>
                                      {dataFmt}
                                    </span>
                                  );
                                }
                              }
                              // ── situacao: bolinha colorida ──
                              else if (colKey === 'situacao' || colKey === 'status' || colKey === 'ativo') {
                                const s = String(val ?? '').toUpperCase();
                                const isAtivo = s === 'A' || val === true;
                                const isInativo = s === 'I' || val === false;
                                const cor = isAtivo ? 'bg-emerald-500' : isInativo ? 'bg-gray-400' : 'bg-red-500';
                                const lbl = isAtivo ? 'Ativo' : isInativo ? 'Inativo' : s === 'E' ? 'Excluído' : (s || '—');
                                display = <span className={`inline-block w-2.5 h-2.5 rounded-full ${cor}`} title={lbl} />;
                              }
                              // ── nome: truncate ──
                              else if ((colKey === 'nome' || colKey.includes('descri')) && typeof val === 'string') {
                                display = <span className="block truncate" title={val}>{val}</span>;
                              }
                              // ── sku: mono ──
                              else if (colKey === 'sku' && typeof val === 'string') {
                                display = <span className="font-mono text-gray-900">{val}</span>;
                              }
                              // ── precos: formato completo pt-BR sem decimais (R$ 4.950) ──
                              // se em_promocao=true e a coluna eh um preco, mostra lista riscada + promo + badge
                              else if (typeof val === 'number' && (colKey.includes('price') || colKey.includes('valor') || colKey.includes('preco'))) {
                                if (emPromocaoRow && (colKey === 'preco_curva' || colKey === 'preco_tiny') && typeof precoVigenteRow === 'number' && precoVigenteRow > 0 && precoVigenteRow !== val) {
                                  display = (
                                    <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                                      <s className="text-gray-400">{formatCurrencyFull(val)}</s>
                                      <span className="text-emerald-700 font-bold">{formatCurrencyFull(precoVigenteRow)}</span>
                                      <BadgePromo campanha={row.original['nome_campanha'] as string | null | undefined} />
                                    </span>
                                  );
                                } else {
                                  display = <span className="font-mono tabular-nums text-gray-900">{formatCurrencyFull(val)}</span>;
                                }
                              }
                              // ── saldo/estoque: número simples ──
                              else if (typeof val === 'number' && colKey.match(/saldo|estoque|qtd_|quantidade/)) {
                                display = <span className="font-mono tabular-nums">{val}</span>;
                              }
                              // ── peso: com g ──
                              else if (typeof val === 'number' && (colKey.includes('peso') || colKey.includes('weight') || colKey.includes('gram'))) {
                                display = <span className="font-mono tabular-nums text-gray-700">{val.toFixed(2)}g</span>;
                              }
                              // ── markup / fator: 2 casas ──
                              else if (typeof val === 'number' && (colKey === 'markup' || colKey === 'fator')) {
                                display = <span className="font-mono tabular-nums">{val.toFixed(2)}</span>;
                              }
                              // ── número genérico ──
                              else if (typeof val === 'number') {
                                display = <span className="font-mono tabular-nums">{formatNumber(val)}</span>;
                              } else if (typeof val === 'boolean') {
                                display = val
                                  ? <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" title="Sim" />
                                  : <span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-300" title="Não" />;
                              } else if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
                                try {
                                  const datePart = val.split('T')[0];
                                  const [yyyy, mm, dd] = datePart.split('-');
                                  display = <span className="font-mono text-xs">{`${dd}/${mm}/${yyyy}`}</span>;
                                } catch { display = val; }
                              } else if (typeof val === 'string') {
                                display = <span className="block truncate" title={val}>{val}</span>;
                              } else if (val === null || val === undefined) {
                                display = <span className="text-gray-300">—</span>;
                              } else if (typeof val === 'object') {
                                display = '{…}';
                              }
                            }

                            const lay = colLayout(colKey);
                            const tdAlign = lay.align === 'right' ? 'text-right' : lay.align === 'center' ? 'text-center' : 'text-left';
                            return (
                              <td
                                key={`${idx}-${colKey}`}
                                className={`px-2 py-2 text-gray-700 text-sm ${lay.cls} ${tdAlign} ${lay.nowrap ? 'whitespace-nowrap' : ''} ${lay.mono && typeof display === 'string' ? 'font-mono' : ''} overflow-hidden`}
                              >
                                {display}
                              </td>
                            );
                          })}

                          {/* ABC */}
                          <td className="px-1 py-2 text-center">
                            {(() => {
                              const cor = abcCorClass(row.abcClass);
                              return (
                                <span
                                  className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold font-mono ${cor}`}
                                  title={
                                    (row.receita12m ?? 0) === 0
                                      ? `C · Sem venda em 12 meses`
                                      : `${row.abcClass} · ${formatCurrency(row.receita12m ?? 0)} em 12m`
                                  }
                                >
                                  {row.abcClass}
                                </span>
                              );
                            })()}
                          </td>
                          {/* DIO */}
                          <td className="px-1 py-2 text-center">
                            {(() => {
                              const d = row.dio;
                              if (d === null) {
                                return <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[11px] font-bold font-mono bg-red-100 text-red-700" title="Sem vendas em 90d">∞</span>;
                              }
                              const cor =
                                d > 365 ? 'bg-red-500 text-white' :
                                d > 180 ? 'bg-red-400 text-white' :
                                d > 90 ?  'bg-orange-300 text-orange-900' :
                                d > 45 ?  'bg-yellow-200 text-yellow-800' :
                                          'bg-emerald-100 text-emerald-700';
                              return (
                                <span
                                  className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[11px] font-bold font-mono ${cor}`}
                                  title={`${d} dias pra esgotar (venda média: ${row.qtdVendida90d ? (row.qtdVendida90d / 90).toFixed(2) : 0} un/dia)`}
                                >
                                  {d > 999 ? '999+' : d}
                                </span>
                              );
                            })()}
                          </td>
                          {/* Score */}
                          <td className="px-1 py-2 text-center">
                            {(() => {
                              const s = row.criticScore ?? 0;
                              const cor =
                                s >= 80 ? "bg-red-600 text-white" :
                                s >= 60 ? "bg-red-500 text-white" :
                                s >= 40 ? "bg-orange-400 text-white" :
                                s >= 20 ? "bg-yellow-300 text-yellow-900" :
                                          "bg-emerald-100 text-emerald-700";
                              return (
                                <span
                                  className={`inline-flex items-center justify-center w-9 h-6 rounded text-xs font-bold font-mono ${cor}`}
                                  title={`Idade: ${row.idadeDias ?? 0}d · Sem venda: ${row.diasSemVenda === null ? 'nunca' : `${row.diasSemVenda}d`}`}
                                >
                                  {s}
                                </span>
                              );
                            })()}
                          </td>
                          {/* Total — compacto (R$ 12k) com tooltip valor cheio */}
                          <td
                            className="px-2 py-2 text-right font-mono font-semibold text-esmeralda-500 text-sm tabular-nums whitespace-nowrap"
                            title={formatCurrency(row.totalValue)}
                          >
                            {formatCurrencyShort(row.totalValue)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            )}
          </section>
        )}

        {/* Overlay escuro atrás da matriz em fullscreen (fora do flex-col) */}
        {isMatrixFullscreen && (
          <div
            className="fixed inset-0 z-[54] bg-black/40 backdrop-blur-sm"
            onClick={() => setIsMatrixFullscreen(false)}
            aria-hidden
          />
        )}

      </div>

      {/* MODAL: Nova vista */}
      {showSaveViewModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => !isSavingView && setShowSaveViewModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-creme-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-esmeralda-50 rounded-xl text-esmeralda-500">
                <Bookmark size={20} />
              </div>
              <div>
                <h3 className="text-lg font-serif font-semibold text-gray-900">Nova vista</h3>
                <p className="text-xs text-gray-500">Salva os filtros atuais com um nome</p>
              </div>
            </div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Nome da vista
            </label>
            <input
              type="text"
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              autoFocus
              maxLength={80}
              placeholder='Ex: "Anéis pesados parados"'
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newViewName.trim()) saveAsView();
                if (e.key === 'Escape') { setShowSaveViewModal(false); setNewViewName(''); }
              }}
              className="w-full h-11 px-4 bg-creme-50 border border-creme-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-esmeralda-400 focus:ring-2 focus:ring-esmeralda-100"
            />
            <div className="mt-3 p-3 bg-creme-50 border border-creme-200 rounded-lg text-xs text-gray-600 space-y-1">
              <p className="font-semibold text-gray-700 uppercase tracking-wider text-[10px] mb-1">Filtros que serão salvos:</p>
              <p>Escopo: <span className="font-mono font-semibold text-gray-900">{filterScope}</span></p>
              <p>Categorias: <span className="font-mono">{selectedCategories.length === 0 ? '—' : selectedCategories.join(', ')}</span></p>
              <p>Fornecedores: <span className="font-mono">{selectedSuppliers.length === 0 ? '—' : selectedSuppliers.join(', ')}</span></p>
              <p>Classes de peso: <span className="font-mono">{selectedWeightClasses.length === 0 ? '—' : selectedWeightClasses.join(', ')}</span></p>
              <p>Data compra: <span className="font-mono">{purchaseDateRange.start || '—'} → {purchaseDateRange.end || '—'}</span></p>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => { setShowSaveViewModal(false); setNewViewName(''); }}
                disabled={isSavingView}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-creme-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={saveAsView}
                disabled={isSavingView || !newViewName.trim()}
                className="flex items-center gap-2 px-5 py-2 bg-esmeralda-500 text-white text-sm font-semibold rounded-lg hover:bg-esmeralda-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSavingView ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Salvar vista
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;