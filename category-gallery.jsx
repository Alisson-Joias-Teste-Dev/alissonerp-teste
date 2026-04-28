// ============================================================
// GALERIA POR CATEGORIA — mosaico estilo Tiffany
// Grid irregular com tamanhos variados + fotos editoriais
// ============================================================

const { useState: useStateCG, useMemo: useMemoCG, useRef: useRefCG, useEffect: useEffectCG } = React;

// Categorias do catálogo
const CATEGORY_DEFS = [
  { id: 'pingentes', label: 'Pingentes', match: 'pingente', kicker: 'COLEÇÃO',  sub: 'Pingentes em ouro 18k e pedras nobres' },
  { id: 'aneis',     label: 'Anéis',     match: 'anel',     kicker: 'COLEÇÃO',  sub: 'Anéis solitários, alianças e cocktail' },
  { id: 'brincos',   label: 'Brincos',   match: 'brinco',   kicker: 'COLEÇÃO',  sub: 'Argolas, gotas e brincos de gala' },
  { id: 'pulseiras', label: 'Pulseiras', match: 'pulseira', kicker: 'COLEÇÃO',  sub: 'Pulseiras delicadas e braceletes' },
  { id: 'correntes', label: 'Correntes', match: 'corrente', kicker: 'COLEÇÃO',  sub: 'Correntes, colares e gargantilhas' },
];

// Foto editorial placeholder (modelo)
function EditorialPlaceholder({ tone = 'a', label = 'Editorial' }) {
  const palettes = {
    a: { bg: '#cdd9d3', stroke: '#7d9a8e', text: '#3a4a44' }, // verde água
    b: { bg: '#e8d8b8', stroke: '#a88c5a', text: '#4a3a22' }, // dourado
    c: { bg: '#1a2e26', stroke: '#3d5a4d', text: '#a5b8b0' }, // verde escuro
    d: { bg: '#e3d4ce', stroke: '#a8847a', text: '#4a342e' }, // rosê
  };
  const p = palettes[tone] || palettes.a;
  return (
    <div className="cg-editorial" style={{ background: p.bg }}>
      <svg viewBox="0 0 200 280" preserveAspectRatio="xMidYMid slice" style={{ width: '100%', height: '100%' }}>
        <defs>
          <linearGradient id={`cg-grad-${tone}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={p.bg} stopOpacity="1" />
            <stop offset="100%" stopColor={p.stroke} stopOpacity="0.3" />
          </linearGradient>
        </defs>
        <rect width="200" height="280" fill={`url(#cg-grad-${tone})`} />
        {/* Silhueta de ombro/torso */}
        <path d="M 20,280 Q 30,200 60,180 Q 80,160 100,150 Q 120,160 140,180 Q 170,200 180,280 Z"
              fill={p.stroke} opacity="0.35" />
        {/* Cabeça */}
        <circle cx="100" cy="110" r="42" fill={p.stroke} opacity="0.4" />
        {/* Cabelo */}
        <path d="M 60,95 Q 70,55 100,50 Q 130,55 140,95 Q 145,130 138,150 L 130,140 Q 130,90 100,85 Q 70,90 70,140 L 62,150 Q 55,130 60,95 Z"
              fill={p.stroke} opacity="0.55" />
        {/* Pescoço/colar */}
        <path d="M 80,160 Q 100,170 120,160" fill="none" stroke={p.text} strokeWidth="0.8" opacity="0.5" />
        <circle cx="100" cy="172" r="2" fill={p.text} opacity="0.7" />
      </svg>
      <span className="cg-editorial-tag" style={{ color: p.text }}>{label}</span>
    </div>
  );
}

// Card de produto na galeria (com hover revelando nome+preço)
function CGProductCard({ product, size, onOpen, showPrice = true, tone }) {
  const tints = ['#f3eada', '#e8d8b8', '#dcc99e', '#f0e3c2'];
  const tint = tints[(product.ref?.charCodeAt(2) || 0) % tints.length];
  const variants = ['a', 'b', 'c', 'd'];
  const variant = variants[(product.ref?.charCodeAt(3) || 0) % variants.length];
  const isDark = tone === 'dark';
  const fmt = (n) => 'R$ ' + (n||0).toLocaleString('pt-BR');

  return (
    <button
      type="button"
      className={`cg-card cg-card-${size}`}
      onClick={() => onOpen?.(product)}
      aria-label={product.name}
    >
      <div className="cg-card-img">
        <window.CatalogComponents.JewelPlaceholder
          label={product.name}
          tint={tint}
          dark={isDark}
          variant={variant}
        />
      </div>
      <div className="cg-card-overlay">
        <span className="cg-card-name">{product.name}</span>
        {showPrice && product.to != null && (
          <span className="cg-card-price">{fmt(product.to)}</span>
        )}
      </div>
    </button>
  );
}

// Layout do mosaico — define tamanhos por posição
// Padrão de 26 itens distribuídos em mosaico irregular tipo Tiffany
function buildMosaicSlots(productCount, withEditorial = true) {
  // Padrão otimizado para galerias pequenas: editorial + lg cedo
  // Variedade visual mesmo com 5-6 itens
  const pattern = [
    'sm', 'sm', 'edt-tall', 'sm',         // linha 1: 2 sm + editorial vertical + 1 sm
    'lg', 'sm',                            // 1 grande 2x2 + 1 sm  (cobre 2 linhas)
    'sm', 'sm',                            // continua a linha do lg
    'sm', 'sm', 'sm', 'edt-wide',          // 3 sm + editorial wide
    'sm', 'sm',                            // continuação
    'sm', 'sm', 'lg', 'sm',                // mais variação
    'sm', 'sm', 'sm', 'sm',
    'edt-tall', 'sm', 'sm', 'sm',
    'sm', 'sm', 'sm', 'sm',
  ];
  const slots = [];
  let pIdx = 0;
  let prodIdx = 0;
  let edtCount = 0;

  while (prodIdx < productCount) {
    const slotType = pattern[pIdx % pattern.length];
    pIdx++;
    if (slotType === 'edt-tall' || slotType === 'edt-wide') {
      if (withEditorial) {
        slots.push({ type: 'editorial', size: slotType, tone: ['a','b','c','d'][edtCount % 4] });
        edtCount++;
      } else {
        slots.push({ type: 'product', size: 'sm', productIdx: prodIdx });
        prodIdx++;
      }
    } else {
      slots.push({ type: 'product', size: slotType, productIdx: prodIdx });
      prodIdx++;
    }
  }
  return slots;
}

// Galeria de uma categoria
function CategoryGallery({ catId, products, onOpen, mosaicSize = 'medium', showEditorial = true,
    showPrice = true, defOverride = null, emptyMsg = null, editorial = [], productsByRef = {} }) {
  const baseDef = CATEGORY_DEFS.find(c => c.id === catId);
  if (!baseDef) return null;
  const def = { ...baseDef, ...(defOverride || {}) };
  const localShowEditorial = showEditorial && def.showEditorial !== false;
  const hasProducts = products && products.length > 0;

  // Fotos editoriais desta categoria
  const catEditorial = useMemoCG(
    () => (editorial || []).filter(e => e.target === catId),
    [editorial, catId]
  );

  const slots = useMemoCG(
    () => hasProducts ? buildMosaicSlots(products.length, localShowEditorial) : [],
    [hasProducts ? products.length : 0, localShowEditorial]
  );

  return (
    <section className={`cg-section cg-${mosaicSize} reveal`} id={`cat-${catId}`}>
      <header className="cg-header">
        <span className="cg-kicker">{def.kicker || 'CATEGORIA'}</span>
        <h2 className="cg-title">{def.title || def.label}</h2>
        <p className="cg-sub">{def.subtitle || def.sub}</p>
        <span className="cg-count">{hasProducts ? `${products.length} peças` : 'Em breve'}</span>
      </header>
      {!hasProducts ? (
        <div className="cg-empty">
          {emptyMsg || `Nenhuma peça cadastrada nesta categoria ainda.`}
        </div>
      ) : (
      <div className="cg-grid">
        {(() => {
          let edtCount = 0;
          return slots.map((slot, i) => {
            if (slot.type === 'editorial') {
              const eItem = catEditorial[edtCount++];
              if (eItem) {
                // Foto editorial real — clique abre produto vinculado
                const linkedProduct = eItem.productRef ? productsByRef[eItem.productRef] : null;
                return (
                  <div key={`edt-${i}`} className={`cg-slot cg-slot-${slot.size}`}>
                    <button
                      type="button"
                      className="cg-editorial-photo"
                      onClick={() => linkedProduct && onOpen?.(linkedProduct)}
                      aria-label={eItem.label || 'Foto editorial'}
                      style={{ cursor: linkedProduct ? 'pointer' : 'default' }}
                    >
                      <img
                        src={eItem.url}
                        alt={eItem.label || 'Editorial'}
                        className="cg-editorial-photo-img"
                      />
                      {eItem.label && (
                        <span className="cg-editorial-tag" style={{ color: '#f3eada', textShadow: '0 1px 4px rgba(0,0,0,.6)' }}>
                          {eItem.label}
                        </span>
                      )}
                    </button>
                  </div>
                );
              }
              // Sem foto real → placeholder SVG
              return (
                <div key={`edt-${i}`} className={`cg-slot cg-slot-${slot.size}`}>
                  <EditorialPlaceholder tone={slot.tone} label="Editorial · modelo" />
                </div>
              );
            }
            const product = products[slot.productIdx];
            if (!product) return null;
            return (
              <div key={product.ref || i} className={`cg-slot cg-slot-${slot.size}`}>
                <CGProductCard
                  product={product}
                  size={slot.size}
                  onOpen={onOpen}
                  showPrice={showPrice}
                  tone="light"
                />
              </div>
            );
          });
        })()}
      </div>
      )}
    </section>
  );
}

// Wrapper que renderiza todas as categorias (ou apenas uma, se activeCategory estiver setada)
function CategoryGalleries({ collections, onOpen, mosaicSize = 'medium', showEditorial = true,
    showPrice = true, activeCategory = null, onClearCategory, categorySettings = null, editorial = [] }) {
  // Agrupa produtos de todas as coleções por categoria
  const byCategory = useMemoCG(() => {
    const map = {};
    CATEGORY_DEFS.forEach(c => map[c.id] = []);
    (collections || []).forEach(col => {
      (col.products || []).forEach(p => {
        const def = CATEGORY_DEFS.find(c => c.match === p.category);
        if (def) map[def.id].push({ ...p, _collection: col.title });
      });
    });
    return map;
  }, [collections]);

  // Índice de todos os produtos por ref (para resolver productRef das fotos editoriais)
  const productsByRef = useMemoCG(() => {
    const map = {};
    (collections || []).forEach(col => {
      (col.products || []).forEach(p => { map[p.ref] = p; });
    });
    return map;
  }, [collections]);

  // Aplica settings: ordem, ativação e overrides de texto
  const settingsMap = (categorySettings || []).reduce((acc, c, i) => {
    acc[c.id] = { ...c, _order: i };
    return acc;
  }, {});

  let workingDefs = CATEGORY_DEFS
    .map(d => {
      const s = settingsMap[d.id];
      if (!s) return { ...d, _enabled: true, _order: 999, _override: null };
      return {
        ...d,
        label: s.label || d.label,
        _enabled: s.enabled,
        _order: s._order,
        _override: s,
      };
    })
    .filter(d => d._enabled)
    .sort((a, b) => a._order - b._order);

  if (activeCategory) {
    workingDefs = workingDefs.filter(d => d.id === activeCategory);
  }

  return (
    <div className={`cg-root ${activeCategory ? 'cg-focused' : ''}`}>
      {activeCategory && (
        <button type="button" className="cg-back" onClick={onClearCategory}>
          <span aria-hidden="true">←</span> Voltar para o catálogo
        </button>
      )}
      {workingDefs.map(def => (
        <CategoryGallery
          key={def.id}
          catId={def.id}
          products={byCategory[def.id]}
          onOpen={onOpen}
          mosaicSize={mosaicSize}
          showEditorial={showEditorial}
          showPrice={showPrice}
          defOverride={def._override}
          emptyMsg={def._override?.emptyMsg}
          editorial={editorial}
          productsByRef={productsByRef}
        />
      ))}
    </div>
  );
}

window.CategoryGalleryComponents = {
  CategoryGallery, CategoryGalleries, CATEGORY_DEFS,
};
