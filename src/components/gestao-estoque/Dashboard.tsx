"use client";

import React, { useMemo, useState, useRef, useEffect } from "react";
import { TableRow, DashboardProps, SchemaName } from "@/lib/gestao-estoque/types";
import { updateRecord, saveTableConfig, loadTableConfig } from "@/lib/gestao-estoque/service";
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
  Square
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
  page,
  totalCount,
  onNextPage,
  onPrevPage,
  onRefresh,
  onPromotion,
  schema = 'public'
}) => {
  // Local state for client-side pagination (when not provided by parent)
  const [localPage, setLocalPage] = useState(0);
  const PAGE_SIZE = 100;
  
  const currentPage = page !== undefined ? page : localPage;
  
  const handlePrev = () => {
    if (onPrevPage) onPrevPage();
    else setLocalPage(p => Math.max(0, p - 1));
  };

  const handleNext = () => {
    if (onNextPage) onNextPage();
    else setLocalPage(p => p + 1);
  };

  const [filterScope, setFilterScope] = useState<FilterScope>('positive');
  
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

  // Reset selection when data changes or table changes
  useEffect(() => {
    setSelectedRows(new Set());
  }, [data, tableName]);

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

    // Heuristics to find columns
    const priceKey = keys.find(k => /price|preco|valor|amount|custo|total/i.test(k));
    
    const stockKey = keys.find(k => 
      (/qty|quantity|quantidade|items|itens|stock|estoque/i.test(k)) && 
      !/min|max|alert|security|seguranca|minimo|maximo|ideal/i.test(k)
    );
    
    const weightKey = keys.find(k => /peso_precificado|priced_weight/i.test(k)) || 
                      keys.find(k => /weight|peso|gramas|mass/i.test(k));

    const nameKey = keys.find(k => /product_name|nome_produto|name|nome|title|titulo|description/i.test(k)) || keys[0];
    
    const statusKey = keys.find(k => /status|situacao|situation|active|published/i.test(k));

    // Improved Category Detection (Name or Content)
    let categoryKey = keys.find(k => /category|categoria|grupo|familia|type|tipo/i.test(k));

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

  // Load Config on Mount (or table change)
  useEffect(() => {
    let mounted = true;
    const loadConfig = async () => {
      if (!tableName) return;
      
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

      // Auto-inject data_ultima_venda if the dataset contains it, so the user can immediately see the requested column
      if (mounted && metrics && metrics.allKeys.includes('data_ultima_venda') && !initialColumns.includes('data_ultima_venda')) {
         initialColumns.push('data_ultima_venda');
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
    const processedList = data.map((row, idx) => {
       // Unique ID for hiding logic (fallback to index if necessary, but stringified to match set)
       const uniqueId = idKey && row[idKey] ? String(row[idKey]) : `row-${idx}`;

       const stock = stockKey ? (parseFloat(row[stockKey]) || 0) : 0; 
       const price = priceKey ? (parseFloat(row[priceKey]) || 0) : 0;
       const weight = weightKey ? (parseFloat(row[weightKey]) || 0) : 0;
       
       let totalValue = stock * price;

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
       
       if (!purchaseDate && dateKey && row[dateKey]) { // Extended fallback
         purchaseDate = new Date(row[dateKey]);
         if (isNaN(purchaseDate.getTime())) purchaseDate = null;
       }

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
       };
    }).filter(item => {
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

           // Top risco = maior criticScore. Desempate por valorTotal.
           const key = item.criticScore * 1_000_000 + itemTotalValue;
           if (key > maxCriticalScore) {
              maxCriticalScore = key;
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

    // Sort List based on Sort Config
    processedList.sort((a, b) => {
        let valA, valB;

        // Custom Sort Keys mapping
        if (sortConfig.key === 'totalValue') { valA = a.totalValue; valB = b.totalValue; }
        else if (sortConfig.key === 'stock') { valA = a.stock; valB = b.stock; }
        else if (sortConfig.key === 'price') { valA = a.price; valB = b.price; }
        else if (sortConfig.key === 'weight') { valA = a.weight; valB = b.weight; }
        else if (sortConfig.key === 'criticScore') { valA = a.criticScore; valB = b.criticScore; }
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
      distributionStats
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
    const { success, error } = await updateRecord(schema as SchemaName, tableName, pkValue, editForm, pkField);
    
    setIsSaving(false);

    if (success) {
      setEditingId(null);
      if (onRefresh) onRefresh(); // Trigger data reload
    } else {
      alert(`Erro ao salvar: ${(error as { message?: string })?.message || 'Desconhecido'}`);
    }
  };

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

  return (
    <div className="flex-1 min-w-0 bg-creme-50 text-gray-900 overflow-y-auto overflow-x-hidden scrollbar-thin p-4 h-full">
      {/* Header */}
      <div className="mb-4 flex flex-col xl:flex-row justify-between items-start xl:items-end gap-6">
        <div>
          <h1 className="text-3xl font-serif font-bold text-alisson-gold mb-1">
            Inteligência de Estoque
          </h1>
          <p className="text-gray-500 text-sm uppercase tracking-widest flex items-center gap-2">
            Análise para: <span className="text-gray-900 font-semibold">{tableName}</span>
          </p>
        </div>
        
        <div className="flex flex-col md:flex-row items-start md:items-end gap-3 w-full xl:w-auto">
          
           {/* INVENTORY: PURCHASE DATE FILTER */}
           {metrics.purchaseDateKey && (
             <div className="flex flex-col">
                <div className="flex items-center gap-2 mb-1 px-1">
                   <CalendarDays size={12} className="text-gray-500" />
                   <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Data Compra</span>
                </div>
                <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-creme-200">
                  <input 
                    type="date" 
                    value={purchaseDateRange.start}
                    onChange={(e) => setPurchaseDateRange(prev => ({ ...prev, start: e.target.value }))}
                    className="bg-transparent text-gray-900 text-xs px-2 py-1.5 focus:outline-none focus:text-alisson-gold font-mono"
                  />
                  <span className="text-gray-600">-</span>
                  <input 
                    type="date" 
                    value={purchaseDateRange.end}
                    onChange={(e) => setPurchaseDateRange(prev => ({ ...prev, end: e.target.value }))}
                    className="bg-transparent text-gray-900 text-xs px-2 py-1.5 focus:outline-none focus:text-alisson-gold font-mono"
                  />
                </div>
             </div>
          )}

          {/* Category Filter */}
          {availableCategories.length > 0 && (
              <div className="relative" ref={catDropdownRef}>
                <div className="flex items-center gap-2 mb-1 px-1">
                     <Gem size={12} className="text-gray-500" />
                     <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Categorias</span>
                </div>
                <button 
                    onClick={() => setIsCatDropdownOpen(!isCatDropdownOpen)}
                    className={`flex items-center justify-between gap-3 px-4 py-2 bg-white border rounded-lg min-w-[180px] transition-all ${
                        selectedCategories.length > 0 
                        ? 'border-alisson-gold/50 text-gray-900' 
                        : 'border-creme-200 text-gray-600 hover:border-creme-200'
                    }`}
                >
                    <span className="text-sm truncate max-w-[140px]">
                        {selectedCategories.length === 0 
                            ? 'Todas' 
                            : `${selectedCategories.length} selecionada(s)`}
                    </span>
                    <ChevronDown size={14} className={`transition-transform ${isCatDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {isCatDropdownOpen && (
                   /* Dropdown Content */
                   <div className="absolute top-full left-0 mt-2 w-72 max-h-96 overflow-y-auto bg-white border border-creme-200 rounded-xl shadow-2xl z-50 scrollbar-thin flex flex-col">
                        <div className="p-2 border-b border-creme-200 bg-white z-10 sticky top-0">
                            <div className="flex justify-between items-center mb-2">
                                <button onClick={() => setSelectedCategories(availableCategories)} className="text-[10px] uppercase font-bold text-gray-500 hover:text-gray-900 px-2 py-1 rounded">Todas</button>
                                <button onClick={() => { setSelectedCategories([]); setCategorySearch(''); }} className="text-[10px] uppercase font-bold text-gray-500 hover:text-alisson-gold px-2 py-1 rounded">Limpar</button>
                            </div>
                            {availableCategories.length > 8 && (
                                <div className="relative">
                                    <Search size={12} className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-500" />
                                    <input 
                                        type="text" 
                                        value={categorySearch}
                                        onChange={(e) => setCategorySearch(e.target.value)}
                                        placeholder="Filtrar..."
                                        className="w-full bg-creme-50/50 border border-creme-200 rounded text-xs py-1.5 pl-7 pr-2 text-gray-700 focus:outline-none focus:border-alisson-gold/30"
                                    />
                                </div>
                            )}
                        </div>
                        <div className="p-2 space-y-1">
                            {filteredCategories.map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => toggleCategory(cat)}
                                    className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between group transition-colors ${selectedCategories.includes(cat) ? 'bg-alisson-gold/10 text-alisson-gold font-medium' : 'text-gray-600 hover:bg-creme-100'}`}
                                >
                                    <div className="flex items-center gap-2">
                                        {getCategoryIcon(cat)}
                                        <span className="truncate max-w-[180px]">{cat}</span>
                                    </div>
                                    {selectedCategories.includes(cat) && <Check size={14} />}
                                </button>
                            ))}
                            {filteredCategories.length === 0 && (
                                <p className="text-center text-xs text-gray-500 py-4">Nenhuma categoria encontrada.</p>
                            )}
                        </div>
                    </div>
                )}
              </div>
          )}

          {/* Supplier Filter (New) */}
          {availableSuppliers.length > 0 && (
              <div className="relative" ref={supplierDropdownRef}>
                <div className="flex items-center gap-2 mb-1 px-1">
                     <Truck size={12} className="text-gray-500" />
                     <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Fornecedor</span>
                </div>
                <button 
                    onClick={() => setIsSupplierDropdownOpen(!isSupplierDropdownOpen)}
                    className={`flex items-center justify-between gap-3 px-4 py-2 bg-white border rounded-lg min-w-[180px] transition-all ${
                        selectedSuppliers.length > 0 
                        ? 'border-purple-500/50 text-gray-900' 
                        : 'border-creme-200 text-gray-600 hover:border-creme-200'
                    }`}
                >
                    <span className="text-sm truncate max-w-[140px]">
                        {selectedSuppliers.length === 0 
                            ? 'Todos' 
                            : `${selectedSuppliers.length} selecionado(s)`}
                    </span>
                    <ChevronDown size={14} className={`transition-transform ${isSupplierDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {isSupplierDropdownOpen && (
                   <div className="absolute top-full left-0 mt-2 w-64 max-h-80 overflow-y-auto bg-white border border-creme-200 rounded-xl shadow-2xl z-50 scrollbar-thin flex flex-col">
                        <div className="p-2 border-b border-creme-200 flex justify-between sticky top-0 bg-white z-10">
                            <button onClick={() => setSelectedSuppliers(availableSuppliers)} className="text-[10px] uppercase font-bold text-gray-500 hover:text-gray-900 px-2 py-1 rounded">Todos</button>
                            <button onClick={() => setSelectedSuppliers([])} className="text-[10px] uppercase font-bold text-gray-500 hover:text-purple-400 px-2 py-1 rounded">Limpar</button>
                        </div>
                        <div className="p-2 space-y-1">
                            {availableSuppliers.map(sup => (
                                <button
                                    key={sup}
                                    onClick={() => toggleSupplier(sup)}
                                    className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between group transition-colors ${selectedSuppliers.includes(sup) ? 'bg-purple-500/10 text-purple-400 font-medium' : 'text-gray-600 hover:bg-creme-100'}`}
                                >
                                    <span className="truncate">{sup}</span>
                                    {selectedSuppliers.includes(sup) && <Check size={14} />}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
              </div>
          )}

          {/* Weight Class Filter */}
          <div className="relative" ref={weightDropdownRef}>
            <div className="flex items-center gap-2 mb-1 px-1">
                 <Scale size={12} className="text-gray-500" />
                 <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Peso</span>
            </div>
            <button 
                onClick={() => setIsWeightDropdownOpen(!isWeightDropdownOpen)}
                className={`flex items-center justify-between gap-3 px-4 py-2 bg-white border rounded-lg min-w-[180px] transition-all ${
                    selectedWeightClasses.length > 0 
                    ? 'border-blue-500/50 text-gray-900' 
                    : 'border-creme-200 text-gray-600 hover:border-creme-200'
                }`}
            >
                <span className="text-sm truncate max-w-[140px]">
                    {selectedWeightClasses.length === 0 ? 'Todas as Classes' : `${selectedWeightClasses.length} selecionada(s)`}
                </span>
                <ChevronDown size={14} className={`transition-transform ${isWeightDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {isWeightDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 w-72 max-h-96 overflow-y-auto bg-white border border-creme-200 rounded-xl shadow-2xl z-50 scrollbar-thin flex flex-col">
                    <div className="p-2 border-b border-creme-200 flex justify-between sticky top-0 bg-white z-10">
                        <span className="text-[10px] uppercase font-bold text-gray-500 px-2 py-1">Classificação</span>
                        <button onClick={() => setSelectedWeightClasses([])} className="text-[10px] uppercase font-bold text-gray-500 hover:text-blue-400 px-2 py-1 rounded hover:bg-creme-100">Limpar</button>
                    </div>
                    <div className="p-2 space-y-1">
                        {WEIGHT_CLASSES.map(cls => (
                            <button
                                key={cls.label}
                                onClick={() => toggleWeightClass(cls.label)}
                                className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between group transition-colors ${selectedWeightClasses.includes(cls.label) ? 'bg-blue-900/20 text-blue-400 font-medium' : 'text-gray-600 hover:bg-creme-100'}`}
                            >
                                <div className="flex flex-col"><span>{cls.label}</span><span className="text-[10px] text-gray-600 font-mono">{cls.min}g - {cls.max}g</span></div>
                                {selectedWeightClasses.includes(cls.label) && <Check size={14} />}
                            </button>
                        ))}
                    </div>
                </div>
            )}
          </div>

          {/* Filter Scope Controller */}
          <div>
            <div className="flex items-center gap-2 mb-1 px-1">
                 <ListFilter size={12} className="text-gray-500" />
                 <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Escopo</span>
            </div>
            <div className="flex gap-1 bg-white p-1 rounded-lg border border-creme-200">
                <button onClick={() => setFilterScope('positive')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all border ${filterScope === 'positive' ? 'bg-green-900/30 text-green-400 border-green-500/50 shadow-[0_0_10px_rgba(74,222,128,0.2)]' : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-creme-100'}`}>Em Estoque</button>
                <button onClick={() => setFilterScope('all')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all border ${filterScope === 'all' ? 'bg-blue-900/30 text-blue-400 border-blue-500/50 shadow-[0_0_10px_rgba(96,165,250,0.2)]' : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-creme-100'}`}>Todos</button>
                <button onClick={() => setFilterScope('critical')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all border ${filterScope === 'critical' ? 'bg-red-900/30 text-red-400 border-red-500/50 shadow-[0_0_10px_rgba(248,113,113,0.2)]' : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-creme-100'}`}>Crítico</button>
                <button onClick={() => setFilterScope('zero')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all border ${filterScope === 'zero' ? 'bg-red-900/30 text-red-400 border-red-500/50 shadow-[0_0_10px_rgba(248,113,113,0.2)]' : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-creme-100'}`}>Sem Estoque</button>
             </div>
          </div>
          
        </div>
      </div>
      
      {/* Active Filters & Hidden Rows Alert */}
      {(selectedCategories.length > 0 || selectedSuppliers.length > 0 || selectedWeightClasses.length > 0 || hiddenRowIds.size > 0) && (
          <div className="mb-6 flex flex-wrap gap-2 items-center">
              <span className="text-xs text-gray-500 mr-2 uppercase tracking-wide font-semibold">Filtros Ativos:</span>
              
              {/* Hidden Rows Badge */}
              {hiddenRowIds.size > 0 && (
                 <button onClick={resetHiddenRows} className="flex items-center gap-1.5 px-3 py-1 bg-red-500/10 border border-red-500/40 rounded-full text-xs text-red-400 hover:bg-red-500/20 transition-colors animate-fade-in">
                    <EyeOff size={10} /> {hiddenRowIds.size} Itens Ocultos <RefreshCcw size={10} className="ml-1" />
                 </button>
              )}

              {selectedCategories.map(cat => (
                  <button key={cat} onClick={() => toggleCategory(cat)} className="flex items-center gap-1.5 px-3 py-1 bg-alisson-gold/10 border border-alisson-gold/30 rounded-full text-xs text-alisson-gold hover:bg-red-900/20 hover:border-red-500/50 hover:text-red-400 transition-colors">
                      {cat} <X size={10} />
                  </button>
              ))}
              {selectedSuppliers.map(sup => (
                  <button key={sup} onClick={() => toggleSupplier(sup)} className="flex items-center gap-1.5 px-3 py-1 bg-purple-500/10 border border-purple-500/30 rounded-full text-xs text-purple-400 hover:bg-red-900/20 hover:border-red-500/50 hover:text-red-400 transition-colors">
                      <Truck size={10} /> {sup} <X size={10} />
                  </button>
              ))}
              {selectedWeightClasses.map(cls => (
                  <button key={cls} onClick={() => toggleWeightClass(cls)} className="flex items-center gap-1.5 px-3 py-1 bg-blue-900/20 border border-blue-500/30 rounded-full text-xs text-blue-400 hover:bg-red-900/20 hover:border-red-500/50 hover:text-red-400 transition-colors">
                      <Weight size={10} /> {cls} <X size={10} />
                  </button>
              ))}
              <button onClick={() => { setSelectedCategories([]); setSelectedSuppliers([]); setSelectedWeightClasses([]); resetHiddenRows(); }} className="text-xs text-gray-500 underline hover:text-gray-900 ml-2">Limpar tudo</button>
          </div>
      )}

      {/* KPI Disclaimer */}
      <div className="mb-4 px-4 py-2 bg-white border border-creme-200 rounded-lg flex items-center gap-3">
          <Activity size={16} className="text-gray-500" />
          <span className="text-xs text-gray-600">
             <strong className="text-alisson-gold">Nota:</strong> As métricas abaixo refletem a análise da página atual ({analysis.filteredCount} itens visíveis). Itens ocultos não são contabilizados.
          </span>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 mb-5">
        {/* KPI 1: Valuation / Revenue */}
        <div className="bg-white border border-creme-200 p-3 rounded-lg hover:border-alisson-gold/50 transition-colors group relative overflow-hidden">
          <div className="flex items-start justify-between mb-4 relative z-10">
            <div>
              <p className="text-gray-600 text-xs uppercase tracking-wider font-semibold">
                Valuation ({filterScope})
              </p>
              <h3 className={`text-base font-bold mt-1 text-gray-900 group-hover:text-alisson-gold`}>
                {formatCurrency(analysis.totalStockValue)}
              </h3>
            </div>
            <div className="p-2 bg-alisson-gold/10 rounded-lg text-alisson-gold">
              <DollarSign size={20} />
            </div>
          </div>
          <div className="w-full bg-creme-100 h-1 rounded-full overflow-hidden relative z-10">
            <div className="bg-alisson-gold h-full rounded-full" style={{ width: '100%' }}></div>
          </div>
        </div>

        {/* KPI 2: Total Items / Volume */}
        <div className="bg-white border border-creme-200 p-3 rounded-lg hover:border-green-500/50 transition-colors group">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-gray-600 text-xs uppercase tracking-wider font-semibold">
                Unidades
              </p>
              <h3 className="text-base font-bold text-gray-900 mt-1 group-hover:text-green-400 transition-colors">
                {formatNumber(analysis.totalItems)}
              </h3>
            </div>
            <div className="p-2 bg-green-500/10 rounded-lg text-green-400">
              <Package size={20} />
            </div>
          </div>
        </div>

        {/* KPI 3: Products in Stock */}
        <div className="bg-white border border-creme-200 p-3 rounded-lg hover:border-emerald-500/50 transition-colors group">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-gray-600 text-xs uppercase tracking-wider font-semibold">
                Em Estoque
              </p>
              <h3 className="text-base font-bold text-gray-900 mt-1 group-hover:text-emerald-400 transition-colors">
                {formatNumber(analysis.productsInStock)}
              </h3>
            </div>
            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
              <Check size={20} />
            </div>
          </div>
        </div>

        {/* KPI 4: Products in Replenishment */}
        <div className="bg-white border border-creme-200 p-3 rounded-lg hover:border-red-500/50 transition-colors group">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-gray-600 text-xs uppercase tracking-wider font-semibold">
                Em Reposição
              </p>
              <h3 className="text-base font-bold text-gray-900 mt-1 group-hover:text-red-400 transition-colors">
                {formatNumber(analysis.productsInReplenishment)}
              </h3>
            </div>
            <div className="p-2 bg-red-500/10 rounded-lg text-red-400">
              <AlertCircle size={20} />
            </div>
          </div>
        </div>

        {/* KPI 5: Weight (Conditional) */}
        <div className="bg-white border border-creme-200 p-3 rounded-lg hover:border-blue-500/50 transition-colors group">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-gray-600 text-xs uppercase tracking-wider font-semibold">
                Peso Total
              </p>
              <h3 className="text-base font-bold text-gray-900 mt-1 group-hover:text-blue-400 transition-colors">
                {analysis.totalWeight > 0 ? formatNumber(analysis.totalWeight) : '-'} <span className="text-sm text-gray-500">g</span>
              </h3>
            </div>
            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
              <Scale size={20} />
            </div>
          </div>
          <div className="w-full bg-creme-100 h-1 rounded-full overflow-hidden">
             <div className="bg-blue-500 h-full rounded-full" style={{ width: '75%' }}></div>
          </div>
        </div>

        {/* KPI 6: Average Ticket / Price */}
        <div className="bg-white border border-creme-200 p-3 rounded-lg hover:border-purple-500/50 transition-colors group">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-gray-600 text-xs uppercase tracking-wider font-semibold">
                Preço / Grama
              </p>
              <h3 className="text-base font-bold text-gray-900 mt-1 group-hover:text-purple-400 transition-colors">
                {formatCurrency(analysis.avgPricePerGram)}
              </h3>
            </div>
            <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400">
              <TrendingUp size={20} />
            </div>
          </div>
        </div>

        {/* KPI 7: Alerta Crítico (NEW) */}
        <div 
          onClick={handleCriticalClick}
          className={`bg-white border p-5 rounded-xl transition-all group cursor-pointer ${filterScope === 'critical' ? 'border-red-500 shadow-[0_0_20px_rgba(248,113,113,0.2)] bg-red-900/20 scale-[1.02]' : 'border-creme-200 hover:border-red-500/50'}`}
        >
          <div className="flex items-start justify-between mb-2">
            <div className="w-full">
              <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-1.5">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                      </span>
                      <p className={`text-xs uppercase tracking-wider font-bold ${filterScope === 'critical' ? 'text-red-400' : 'text-gray-600'}`}>
                        Alerta Crítico (score ≥ 60)
                      </p>
                  </div>
                  <div className="p-1.5 bg-red-500/10 rounded-lg text-red-500">
                    <AlertCircle size={16} />
                  </div>
              </div>
              <h3 className={`text-base font-black mt-1 transition-colors ${filterScope === 'critical' ? 'text-red-400' : 'text-gray-900 group-hover:text-red-400'}`}>
                {formatCurrency(analysis.criticalCapital)}
              </h3>
            </div>
          </div>
          
          <div className="text-xs text-gray-600 mt-2 space-y-1.5 border-t border-creme-200 pt-2">
             <div className="flex justify-between items-center">
                 <span>Volume Total Parado:</span>
                 <strong className="text-red-400">{analysis.criticalCount} peças</strong>
             </div>
             <div className="flex justify-between items-center" title="Valor Médio por Peça">
                 <span>Valor Médio / Peça:</span>
                 <strong className="text-gray-900">{formatCurrency(analysis.avgCriticalPrice)}</strong>
             </div>
             
             {analysis.topCriticalItem && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-red-600">🔥 Maior Risco de Capital</span>
                    <span className="text-[10px] font-bold text-white bg-red-600 rounded px-1.5 py-0.5">
                      Score {analysis.topCriticalItem.criticScore}
                    </span>
                  </div>
                  <div className="flex justify-between items-center gap-2">
                     <span className="truncate font-mono text-[11px] text-gray-800">{analysis.topCriticalItem.sku}</span>
                     <span className="font-bold shrink-0 text-red-700">{formatCurrency(analysis.topCriticalItem.totalValue)}</span>
                  </div>
                  <span className="text-[10px] text-red-500 block mt-0.5">
                    {analysis.topCriticalItem.stock} un. × {formatCurrency(analysis.topCriticalItem.price)}
                    {analysis.topCriticalItem.idadeDias > 0 && ` · ${analysis.topCriticalItem.idadeDias}d em estoque`}
                    {analysis.topCriticalItem.diasSemVenda === null
                      ? " · nunca vendeu"
                      : ` · ${analysis.topCriticalItem.diasSemVenda}d sem venda`}
                  </span>
                </div>
             )}
          </div>
        </div>

        {/* KPI 8: Idle Capital */}
        <div 
          onClick={handleEstoqueParadoClick}
          className={`bg-white border p-3 rounded-lg transition-colors group cursor-pointer ${filterScope === 'stale' ? 'border-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.15)] bg-orange-900/20' : 'border-creme-200 hover:border-orange-500/50'}`}
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className={`text-xs uppercase tracking-wider font-semibold ${filterScope === 'stale' ? 'text-orange-400' : 'text-gray-600'}`}>
                Estoque Parado {'> 180d'}
              </p>
              <h3 className={`text-base font-bold mt-1 transition-colors ${filterScope === 'stale' ? 'text-orange-400' : 'text-gray-900 group-hover:text-orange-400'}`}>
                {formatCurrency(analysis.idleCapital)}
              </h3>
              <p className="text-xs text-gray-500 mt-1"><span className="text-orange-400 font-semibold">{analysis.idleItemsCount}</span> peças sem giro</p>
              {analysis.missingDateCount > 0 && (
                <p className="text-[10px] text-red-400/80 mt-0.5">⚠️ {analysis.missingDateCount} un. s/ data (ponto cego)</p>
              )}
            </div>
            <div className="p-2 bg-orange-500/10 rounded-lg text-orange-400">
              <CalendarDays size={20} />
            </div>
          </div>
        </div>
      </div>

      {/* WEIGHT DISTRIBUTION GRID (Only Inventory) */}
      <div className="mb-5">
        <h3 className="text-lg font-serif font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <PieChart size={18} className="text-alisson-gold" />
          Distribuição por Classe de Peso
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
          {analysis.distributionStats.map((stat) => {
            const range = WEIGHT_CLASSES.find(w => w.label === stat.label);
            const isSelected = selectedWeightClasses.includes(stat.label);
            return (
              <div 
                key={stat.label} 
                onClick={() => toggleWeightClass(stat.label)}
                className={`bg-white border rounded-lg p-4 cursor-pointer transition-colors ${isSelected ? 'border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.2)]' : 'border-creme-200 hover:border-gray-600'}`}
              >
                 <div className="flex justify-between items-start mb-3">
                    <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-900">{stat.label}</span>
                        {range && (
                            <span className="text-[10px] text-gray-500 font-mono bg-creme-100 px-1.5 py-0.5 rounded mt-1 w-fit">
                              {range.min}g - {range.max}g
                            </span>
                        )}
                    </div>
                    <span className="text-xs text-gray-500 font-medium bg-white border border-creme-200 px-2 py-1 rounded-full">
                      {formatNumber(stat.count)} itens
                    </span>
                 </div>
                 
                 {/* Weight Progress */}
                 <div className="mb-2">
                   <div className="flex justify-between text-xs mb-1">
                      <span className="text-blue-400">Peso</span>
                      <span className="text-gray-600">{formatNumber(stat.weightShare)}%</span>
                   </div>
                   <div className="w-full bg-creme-100 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-blue-500 h-full rounded-full" style={{ width: `${stat.weightShare}%` }}></div>
                   </div>
                   <div className="text-[10px] text-gray-500 text-right mt-0.5">{formatNumber(stat.weight)}g</div>
                 </div>

                 {/* Value Progress */}
                 <div>
                   <div className="flex justify-between text-xs mb-1">
                      <span className="text-alisson-gold">Valor</span>
                      <span className="text-gray-600">{formatNumber(stat.valueShare)}%</span>
                   </div>
                   <div className="w-full bg-creme-100 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-alisson-gold h-full rounded-full" style={{ width: `${stat.valueShare}%` }}></div>
                   </div>
                   <div className="text-[10px] text-gray-500 text-right mt-0.5">{formatCurrency(stat.value)}</div>
                 </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* FULL INVENTORY TABLE (LEDGER) */}
      <div id="detailed-matrix" className="bg-creme-50 border border-creme-200 rounded-xl overflow-hidden flex flex-col h-[600px] scroll-mt-6">
        <div className="px-6 py-4 border-b border-creme-200 bg-white flex items-center justify-between">
            <h3 className="text-lg font-serif font-semibold text-gray-900 flex items-center gap-2">
              <ArrowDownWideNarrow size={18} className="text-alisson-gold" />
              Matriz Detalhada de Ativos
            </h3>
            
            {/* Table Controls (Pagination + Columns) */}
            <div className="flex items-center gap-4">
              
              {selectedRows.size > 0 && (
                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
                  {onPromotion && (
                    <button
                      onClick={() => onPromotion(analysis.fullList.filter(item => selectedRows.has(item.uniqueId)).map(item => item.original))}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-alisson-gold/30 bg-alisson-gold/10 text-alisson-gold text-xs font-bold hover:bg-alisson-gold/20 transition-all"
                    >
                      <Tag size={14} />
                      Promoção ({selectedRows.size})
                    </button>
                  )}
                  <button
                    onClick={downloadCSV}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-alisson-gold text-black text-xs font-bold hover:opacity-90 transition-all shadow-lg"
                  >
                    <Download size={14} />
                    Exportar
                  </button>
                </div>
              )}

              {/* Save View Button */}
              <button
                onClick={handleSaveConfig}
                disabled={isSavingConfig}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${configSaved ? 'bg-green-500/20 text-green-400 border-green-500/50' : 'bg-white border-creme-200 text-gray-700 hover:text-gray-900 hover:border-alisson-gold/50'}`}
                title="Salvar Colunas e Ordenação como Padrão"
              >
                 {isSavingConfig ? <Loader2 size={14} className="animate-spin" /> : configSaved ? <Check size={14} /> : <Bookmark size={14} />}
                 <span className="hidden sm:inline">{configSaved ? 'Salvo!' : 'Salvar Padrão'}</span>
              </button>
              
              {/* Column Selector */}
              <div className="relative" ref={columnSelectorRef}>
                <button
                  onClick={() => setIsColumnSelectorOpen(!isColumnSelectorOpen)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${isColumnSelectorOpen ? 'bg-alisson-gold text-black border-alisson-gold' : 'bg-white border-creme-200 text-gray-700 hover:text-gray-900'}`}
                >
                  <Columns size={14} />
                  <span className="hidden sm:inline">Colunas</span>
                  <ChevronDown size={12} className={`transition-transform ${isColumnSelectorOpen ? 'rotate-180' : ''}`} />
                </button>

                {isColumnSelectorOpen && (
                  <div className="absolute top-full right-0 mt-2 w-64 max-h-96 overflow-y-auto bg-white backdrop-blur-xl border border-creme-200 rounded-xl shadow-2xl z-50 scrollbar-thin">
                    <div className="p-3 border-b border-creme-200 bg-white sticky top-0">
                       <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Personalizar Visão</h4>
                    </div>
                    <div className="p-2 space-y-1">
                      {metrics.allKeys.map(key => (
                        <button
                          key={key}
                          onClick={() => toggleColumn(key)}
                          className={`w-full text-left px-3 py-2 rounded-md text-xs flex items-center justify-between group transition-colors ${visibleColumns.includes(key) ? 'bg-creme-100 text-gray-900' : 'text-gray-500 hover:bg-creme-100'}`}
                        >
                          <span className="truncate">{key}</span>
                          {visibleColumns.includes(key) && <Check size={12} className="text-alisson-gold" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {totalCount !== null && (
                <span className="text-xs text-gray-500 font-mono hidden md:inline-block border-l border-creme-200 pl-4">
                  Total Global: {totalCount}
                </span>
              )}

              <div className="flex items-center gap-1 bg-white rounded-lg p-1 border border-creme-200">
                <button
                  onClick={handlePrev}
                  disabled={currentPage === 0 || loading}
                  className="p-1.5 rounded hover:bg-creme-100 text-gray-600 disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-xs font-mono w-16 text-center text-gray-500">
                  Pág {currentPage + 1}
                </span>
                <button
                  onClick={handleNext}
                  disabled={loading || (analysis && (currentPage + 1) * PAGE_SIZE >= analysis.filteredCount)}
                  className="p-1.5 rounded hover:bg-creme-100 text-gray-600 disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
        </div>
        
        <div className="flex-1 overflow-auto scrollbar-thin">
           <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-white sticky top-0 z-10 text-xs uppercase tracking-wider font-semibold text-gray-600 backdrop-blur-md">
                 <tr>
                    <th className="px-4 py-3 border-b border-creme-200 w-12 text-center sticky left-0 z-30 bg-white/90 backdrop-blur">
                       <div className="flex flex-col items-center gap-2">
                         <button 
                           onClick={toggleAll}
                           className="p-1 rounded hover:bg-white/10 text-gray-600 hover:text-alisson-gold transition-colors"
                           title="Selecionar Todos"
                         >
                           {selectedRows.size === analysis.fullList.length && analysis.fullList.length > 0 ? <CheckSquare size={16} className="text-alisson-gold" /> : <Square size={16} />}
                         </button>
                         
                         <div className="flex flex-col items-center gap-1 mt-1">
                           <input 
                             type="number"
                             value={bulkSelectCount}
                             onChange={(e) => setBulkSelectCount(e.target.value)}
                             placeholder="Qtd"
                             className="w-10 bg-creme-50/40 border border-white/10 rounded py-0.5 px-1 text-[9px] text-center text-alisson-gold focus:outline-none focus:border-alisson-gold/50 transition-all placeholder-gray-700"
                             title="Quantidade para selecionar em lote"
                           />
                           <button 
                             onClick={handleBulkSelect}
                             disabled={!bulkSelectCount}
                             className="p-1 rounded bg-alisson-gold/10 text-alisson-gold hover:bg-alisson-gold hover:text-black transition-all disabled:opacity-30"
                             title="Selecionar em Lote"
                           >
                             <Check size={10} />
                           </button>
                         </div>
                       </div>
                    </th>
                    <th className="px-6 py-3 border-b border-creme-200 w-24 text-center sticky left-[48px] z-20 bg-white/90 backdrop-blur">
                       <Settings2 size={12} className="mx-auto" />
                    </th>
                    <th className="px-6 py-3 border-b border-creme-200 w-12 text-center text-[10px]">#</th>
                    
                    {visibleColumns.map(colKey => (
                      <th 
                        key={colKey}
                        className="px-6 py-3 border-b border-creme-200 cursor-pointer hover:text-gray-900 hover:bg-creme-100 transition-colors group"
                        onClick={() => handleSort(colKey)}
                      >
                         <div className="flex items-center gap-1">
                            {colKey}
                            <SortIcon colKey={colKey} />
                         </div>
                      </th>
                    ))}
                    
                    {/* Fixed Computed Columns if needed, or rely purely on dynamic `visibleColumns` */}
                    <th
                        className="px-4 py-3 border-b border-creme-200 text-center text-red-500 cursor-pointer hover:text-gray-900 hover:bg-creme-100 transition-colors"
                        onClick={() => handleSort('criticScore' as SortKey)}
                        title="Score de criticidade 0-100 (idade + sem venda + quantidade + valor parado)"
                    >
                        <div className="flex items-center justify-center">
                            Score
                            <SortIcon colKey={'criticScore' as SortKey} />
                        </div>
                    </th>
                    <th
                        className="px-6 py-3 border-b border-creme-200 text-right text-alisson-gold cursor-pointer hover:text-gray-900 hover:bg-creme-100 transition-colors"
                        onClick={() => handleSort('totalValue')}
                    >
                        <div className="flex items-center justify-end">
                            Valor Total (Calc)
                            <SortIcon colKey="totalValue" />
                        </div>
                    </th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-creme-200">
                 {tableData.length === 0 ? (
                    <tr>
                       <td colSpan={visibleColumns.length + 3} className="px-6 py-12 text-center text-gray-500">
                          Nenhum registro encontrado para este filtro.
                       </td>
                    </tr>
                 ) : (
                    tableData.map((row, idx) => {
                       const isEditing = editingId === row.uniqueId;
                       
                       return (
                       <tr key={idx} className={`transition-colors group ${isEditing ? 'bg-alisson-gold/5' : selectedRows.has(row.uniqueId) ? 'bg-alisson-gold/5' : 'hover:bg-creme-100'}`}>
                          {/* Selection Checkbox */}
                          <td className="px-4 py-3 text-center sticky left-0 z-20 bg-creme-50 group-hover:bg-creme-100 backdrop-blur-sm border-r border-creme-200">
                            <button 
                              onClick={() => toggleRow(row.uniqueId)}
                              className={`p-1 rounded transition-colors ${selectedRows.has(row.uniqueId) ? 'text-alisson-gold' : 'text-gray-600 hover:text-gray-600'}`}
                            >
                              {selectedRows.has(row.uniqueId) ? <CheckSquare size={16} /> : <Square size={16} />}
                            </button>
                          </td>
                          {/* Actions: Hide + Edit */}
                          <td className="px-2 py-3 text-center sticky left-[48px] z-10 bg-creme-50 group-hover:bg-creme-100 backdrop-blur-sm border-r border-creme-200">
                             <div className="flex items-center justify-center gap-1">
                               {isEditing ? (
                                 <>
                                   <button 
                                      onClick={() => saveEditing(metrics.idKey!)}
                                      className="p-1.5 rounded-md bg-alisson-gold/20 text-alisson-gold hover:bg-alisson-gold hover:text-black transition-colors"
                                      title="Salvar Alterações"
                                      disabled={isSaving}
                                   >
                                     {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                   </button>
                                   <button 
                                      onClick={cancelEditing}
                                      className="p-1.5 rounded-md text-red-400 hover:bg-red-500/10 transition-colors"
                                      title="Cancelar"
                                      disabled={isSaving}
                                   >
                                     <X size={14} />
                                   </button>
                                 </>
                               ) : (
                                 <>
                                   <button 
                                      onClick={() => startEditing(row)}
                                      className="p-1.5 rounded-md text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                                      title="Editar Produto"
                                   >
                                     <Pencil size={14} />
                                   </button>
                                   <button 
                                      onClick={() => hideRow(row.uniqueId)}
                                      className="p-1.5 rounded-md text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                      title="Ocultar da Matriz"
                                   >
                                     <EyeOff size={14} />
                                   </button>
                                 </>
                               )}
                             </div>
                          </td>
                          <td className="px-6 py-3 text-center text-gray-600 font-mono text-xs">{(currentPage * PAGE_SIZE) + idx + 1}</td>
                          
                          {/* Dynamic Columns */}
                          {visibleColumns.map(colKey => {
                             const val = row.original[colKey];
                             let display: React.ReactNode = val;
                             
                             // Editing Logic
                             if (isEditing) {
                               // Check data type for input
                               const isNumber = typeof val === 'number';
                               const isBoolean = typeof val === 'boolean';
                               
                               if (isBoolean) {
                                  // Simple Toggle for booleans (or select if preferred, sticking to simple for now)
                                  display = (
                                    <select
                                       value={String(editForm[colKey])}
                                       onChange={(e) => handleEditChange(colKey, e.target.value)}
                                       className="bg-creme-50 border border-alisson-gold/50 text-gray-900 text-xs rounded px-2 py-1 focus:outline-none"
                                    >
                                      <option value="true">Sim</option>
                                      <option value="false">Não</option>
                                    </select>
                                  );
                               } else {
                                  // Text/Number Input
                                  display = (
                                    <input 
                                      type={isNumber ? "number" : "text"}
                                      value={editForm[colKey] || ''}
                                      onChange={(e) => handleEditChange(colKey, e.target.value)}
                                      className="bg-creme-50/50 border border-alisson-gold/30 text-gray-900 text-xs rounded px-2 py-1 w-full min-w-[80px] focus:border-alisson-gold focus:outline-none"
                                    />
                                  );
                               }

                             } else {
                                 // Display Logic
                                 if (typeof val === 'number') {
                                   if (colKey.includes('price') || colKey.includes('valor')) display = formatCurrency(val);
                                   else if (colKey.includes('weight') || colKey.includes('peso')) display = val + 'g';
                                 } else if (typeof val === 'boolean') {
                                   display = val ? 'Sim' : 'Não';
                                 } else if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
                                   // Date Formatting (YYYY-MM-DD or ISO)
                                   try {
                                     // Prevent timezone shift by splitting explicit YYYY-MM-DD
                                     const datePart = val.split('T')[0];
                                     const [yyyy, mm, dd] = datePart.split('-');
                                     display = `${dd}/${mm}/${yyyy}`;
                                   } catch(e) {
                                     display = val;
                                   }
                                 } else if (val === null || val === undefined) {
                                   display = '-';
                                 } else if (typeof val === 'object') {
                                   display = '{...}';
                                 }
                             }

                             return (
                               <td key={`${idx}-${colKey}`} className="px-6 py-3 text-gray-600 font-light text-xs">
                                 {display}
                               </td>
                             )
                          })}

                          {/* Score de criticidade */}
                          <td className="px-4 py-3 text-center">
                             {(() => {
                               const s = row.criticScore ?? 0;
                               const cor =
                                 s >= 80 ? "bg-red-600 text-white" :
                                 s >= 60 ? "bg-red-400 text-white" :
                                 s >= 40 ? "bg-orange-300 text-orange-900" :
                                 s >= 20 ? "bg-yellow-200 text-yellow-800" :
                                           "bg-emerald-100 text-emerald-700";
                               return (
                                 <span
                                   className={`inline-flex items-center justify-center w-10 h-6 rounded text-[11px] font-bold font-mono ${cor}`}
                                   title={`Idade: ${row.idadeDias ?? 0}d · Sem venda: ${row.diasSemVenda === null ? 'nunca' : `${row.diasSemVenda}d`}`}
                                 >
                                   {s}
                                 </span>
                               );
                             })()}
                          </td>
                          {/* Computed Total Value (Not Editable) */}
                          <td className="px-6 py-3 text-right font-mono font-medium text-alisson-gold">
                             {formatCurrency(row.totalValue)}
                          </td>
                       </tr>
                    );
                  })
                 )}
              </tbody>
           </table>
        </div>
      </div>

    </div>
  );
};

export default Dashboard;