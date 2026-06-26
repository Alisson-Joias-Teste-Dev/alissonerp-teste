/* ─────────────────────────────────────────────────────────────
   ERP API CLIENT — Alisson ERP
   Base: https://erp.alissonjoias.com.br/api/public/produtos
   Read-only · CORS aberto · sem autenticação
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const BASE_URL = 'https://erp.alissonjoias.com.br/api/public/produtos';
  const CACHE_KEY = 'aurelia.erp.cache.v1';
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

  // ─── REQUEST ─────────────────────────────────────────────
  async function fetchProducts(params = {}) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined) q.set(k, String(v));
    });
    const url = `${BASE_URL}${q.toString() ? '?' + q.toString() : ''}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`ERP retornou ${res.status} ${res.statusText} — ${txt.slice(0, 200)}`);
    }
    return res.json();
  }

  // Busca todas as páginas (limite 100 por página) — para sincronização total
  async function fetchAllProducts(filters = {}, onProgress = null) {
    const all = [];
    let page = 1;
    const limit = 100;
    let totalPages = 1;
    do {
      const data = await fetchProducts({ ...filters, page, limit });
      all.push(...(data.produtos || []));
      totalPages = data.totalPages || 1;
      if (onProgress) onProgress({ loaded: all.length, total: data.total || all.length, page, totalPages });
      page++;
    } while (page <= totalPages && page < 50); // safety cap: 50 pages = 5000 produtos
    return all;
  }

  // ─── MAPEAMENTO ERP → CATÁLOGO ──────────────────────────
  // Mapa de categorias do ERP → ids do catálogo
  const CATEGORY_MAP = {
    'Anel': 'aneis',
    'Anéis': 'aneis',
    'Pulseira': 'pulseiras',
    'Pulseiras': 'pulseiras',
    'Bracelete': 'pulseiras',
    'Colar': 'correntes',
    'Colares': 'correntes',
    'Corrente': 'correntes',
    'Correntes': 'correntes',
    'Gargantilha': 'correntes',
    'Brinco': 'brincos',
    'Brincos': 'brincos',
    'Pingente': 'pingentes',
    'Pingentes': 'pingentes',
  };

  // categoria-do-catálogo → 'match' usado em CATEGORY_DEFS (singular para o filtro)
  const MATCH_BY_CATID = {
    pingentes: 'pingente',
    aneis: 'anel',
    brincos: 'brinco',
    pulseiras: 'pulseira',
    correntes: 'corrente',
  };

  function mapErpToCatalogProduct(erp) {
    if (!erp) return null;

    // Normaliza categoria
    const rawCat = (erp.categoria || '').trim();
    const catId = CATEGORY_MAP[rawCat] || resolveByKeyword(rawCat) || 'aneis';
    const matchCat = MATCH_BY_CATID[catId] || 'anel';

    // Preço — usa preco_variacao_min se for produto pai e mais barato
    let price = Number(erp.preco) || 0;
    if (erp.eh_pai && Number(erp.preco_variacao_min) && Number(erp.preco_variacao_min) > 0) {
      price = Number(erp.preco_variacao_min);
    }

    // Decisão da coleção: por enquanto, todos os produtos do ERP entram numa "coleção ERP"
    // (o usuário pode redirecionar manualmente no painel)
    return {
      ref: erp.sku || `ERP-${erp.id_produto}`,
      sku: erp.sku,
      name: erp.nome || 'Produto sem nome',
      desc: buildDescription(erp),
      longDesc: '',
      from: 0,
      to: price,
      img: erp.foto || null,
      gallery: erp.foto ? [erp.foto] : [],
      category: matchCat,
      _categoryId: catId,
      _erpId: erp.id_produto,
      _isFromErp: true,
      _erpRaw: erp,                  // payload original para debug
      _stock: Number(erp.estoque) || 0,
      _hasStock: (Number(erp.estoque) || 0) > 0,
      _hasVariations: !!erp.eh_pai,
      collectionId: 'erp',
      specs: {
        material: erp.tipo_metal || '',
        pedra: erp.tem_pedra_preciosa ? 'Pedra preciosa' : '',
        quilates: '',
        acabamento: '',
        origem: 'Alisson ERP',
        garantia: '2 anos',
      },
    };
  }

  function buildDescription(erp) {
    const parts = [];
    if (erp.tipo_metal) parts.push(erp.tipo_metal);
    if (erp.tem_pedra_preciosa) parts.push('com pedra preciosa');
    if (erp.sufixo_variacao) parts.push(`tam. ${erp.sufixo_variacao}`);
    return parts.join(' · ') || 'Peça do acervo';
  }

  function resolveByKeyword(text) {
    const lower = (text || '').toLowerCase();
    if (lower.includes('anel') || lower.includes('aliança')) return 'aneis';
    if (lower.includes('pulseira') || lower.includes('bracelete')) return 'pulseiras';
    if (lower.includes('brinco') || lower.includes('argola')) return 'brincos';
    if (lower.includes('pingente') || lower.includes('penduric')) return 'pingentes';
    if (lower.includes('corrente') || lower.includes('colar') || lower.includes('garganti')) return 'correntes';
    return null;
  }

  // ─── CACHE ──────────────────────────────────────────────
  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.ts || !obj.products) return null;
      return obj;
    } catch (e) { return null; }
  }

  function saveCache(products) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        ts: Date.now(),
        products,
      }));
      return true;
    } catch (e) {
      console.warn('[erp] falha ao gravar cache:', e);
      return false;
    }
  }

  function clearCache() {
    localStorage.removeItem(CACHE_KEY);
  }

  function isCacheFresh(cache) {
    if (!cache || !cache.ts) return false;
    return (Date.now() - cache.ts) < CACHE_TTL_MS;
  }

  // ─── HIGH-LEVEL: getProductsForCatalog ────────────────────
  // Retorna um array já mapeado para o formato do catálogo.
  // Tenta cache fresco primeiro; senão busca da API; em caso de falha retorna cache antigo se existir.
  async function getProductsForCatalog({ force = false } = {}) {
    const cache = loadCache();
    if (!force && isCacheFresh(cache)) {
      return { products: cache.products, fromCache: true, cachedAt: cache.ts };
    }
    try {
      const erpProducts = await fetchAllProducts();
      const mapped = erpProducts.map(mapErpToCatalogProduct).filter(Boolean);
      saveCache(mapped);
      return { products: mapped, fromCache: false, cachedAt: Date.now() };
    } catch (e) {
      // Falhou — usa cache antigo se houver
      if (cache && cache.products) {
        console.warn('[erp] usando cache antigo após falha:', e);
        return { products: cache.products, fromCache: true, cachedAt: cache.ts, stale: true, error: e.message };
      }
      throw e;
    }
  }

  // Filtros locais (cliente) — para a aba ERP do painel
  function filterProducts(products, { busca = '', categoria = '', tipo_metal = '', com_estoque = false } = {}) {
    const q = (busca || '').toLowerCase().trim();
    return products.filter(p => {
      const erp = p._erpRaw || {};
      if (q && !`${p.name} ${p.sku || ''}`.toLowerCase().includes(q)) return false;
      if (categoria && erp.categoria !== categoria) return false;
      if (tipo_metal && erp.tipo_metal !== tipo_metal) return false;
      if (com_estoque && !p._hasStock) return false;
      return true;
    });
  }

  // ─── EXPORTAÇÃO ─────────────────────────────────────────
  window.ErpAPI = {
    BASE_URL,
    CACHE_KEY,
    CACHE_TTL_MS,
    fetchProducts,
    fetchAllProducts,
    mapErpToCatalogProduct,
    getProductsForCatalog,
    filterProducts,
    loadCache,
    saveCache,
    clearCache,
    isCacheFresh,
    CATEGORY_MAP,
  };
})();
