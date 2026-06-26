/* ─────────────────────────────────────────────────────────────
   ADMIN SHOWCASE TAB
   Lista única de produtos do ERP com:
     - filtros por vitrine e categoria
     - checkboxes para definir em quais vitrines aparece
     - drag & drop para ordenar dentro de cada vitrine
     - editor inline de foto, preço de/por, nome, descrições, ficha técnica
   Categorias são distribuídas automaticamente pelo campo `categoria` do ERP.
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  const { useState, useEffect, useMemo, useRef } = React;
  const { applyOverride, setOverride, clearOverride, loadOverrides,
          loadAssignments, toggleAssignment, moveAssignment, reorderAssignment } = window.CatalogOverrides;

  // ─── CATEGORIAS PADRÃO (do PageSettings) ────────────────
  const CAT_LABELS = {
    aneis:     'Anéis',
    pulseiras: 'Pulseiras',
    brincos:   'Brincos',
    pingentes: 'Pingentes',
    correntes: 'Correntes',
  };

  function brl(n) {
    return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  // ─── COMPONENTE PRINCIPAL ───────────────────────────────
  function ShowcaseTab({ pageSettings, show }) {
    // Produtos vêm do cache do ERP (mesma fonte do Catalogo.html)
    const [erpCache, setErpCache] = useState(() => window.ErpAPI.loadCache());
    const [overrides, setOverridesS] = useState(loadOverrides);
    const [assignments, setAssignmentsS] = useState(loadAssignments);
    const [editing, setEditing] = useState(null); // ref do produto sendo editado
    const [filters, setFilters] = useState({ busca: '', collectionId: '', categoryId: '', somenteAtribuidos: false });

    // Re-lê localStorage quando outra aba modifica (storage event)
    useEffect(() => {
      const onStorage = (e) => {
        if (!e.key) return;
        if (e.key === window.CatalogOverrides.OV_KEY) setOverridesS(loadOverrides());
        if (e.key === window.CatalogOverrides.SC_KEY) setAssignmentsS(loadAssignments());
        if (e.key === window.ErpAPI.CACHE_KEY) setErpCache(window.ErpAPI.loadCache());
      };
      window.addEventListener('storage', onStorage);
      return () => window.removeEventListener('storage', onStorage);
    }, []);

    // Refresh local helpers
    const refreshOverrides = () => setOverridesS(loadOverrides());
    const refreshAssignments = () => setAssignmentsS(loadAssignments());

    // Lista base: produtos do ERP, com overrides aplicados
    const baseProducts = erpCache?.products || [];
    const products = useMemo(() => {
      return baseProducts.map(p => applyOverride(p, overrides[p.ref]));
    }, [baseProducts, overrides]);

    // Coleções (vitrines) habilitadas — vêm do PageSettings
    const collections = (pageSettings?.home?.collections || []).filter(c => c.enabled);

    // Categorias visíveis — para mapear category(singular) → label
    const allCategoryIds = [...new Set(products.map(p => p._categoryId).filter(Boolean))];

    // Filtragem
    const filtered = useMemo(() => {
      const q = filters.busca.trim().toLowerCase();
      return products.filter(p => {
        if (q) {
          const hay = `${p.name} ${p.ref} ${p.sku || ''} ${p._erpRaw?.categoria || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (filters.collectionId) {
          const refs = assignments[filters.collectionId] || [];
          if (!refs.includes(p.ref)) return false;
        }
        if (filters.categoryId && p._categoryId !== filters.categoryId) return false;
        if (filters.somenteAtribuidos) {
          const inAny = Object.values(assignments).some(refs => (refs || []).includes(p.ref));
          if (!inAny) return false;
        }
        return true;
      });
    }, [products, filters, assignments]);

    // Stats
    const totalAssignments = Object.values(assignments).reduce((s, r) => s + (r?.length || 0), 0);
    const productsInAnyShowcase = new Set(Object.values(assignments).flat()).size;

    // ─── HANDLERS ──────────────────────────────────────────
    const handleToggleAssignment = (collectionId, ref, on) => {
      toggleAssignment(collectionId, ref, on);
      refreshAssignments();
    };

    const handleEditSubmit = (ref, patch) => {
      setOverride(ref, patch);
      refreshOverrides();
      setEditing(null);
      show(`${ref} atualizado`);
    };

    const handleResetProduct = (ref) => {
      if (!confirm(`Restaurar dados originais do produto ${ref} (do ERP)?`)) return;
      clearOverride(ref);
      refreshOverrides();
      show(`${ref} restaurado ao original do ERP`);
    };

    // Sem cache do ERP
    if (!baseProducts.length) {
      return (
        <>
          <div className="breadcrumb">ADMIN · VITRINES & CATÁLOGO</div>
          <h1 className="page-title">Vitrines & Catálogo</h1>
          <p className="page-sub">Selecione quais produtos do ERP aparecem em cada vitrine do site.</p>
          <div className="card" style={{ textAlign: 'center', padding: 60 }}>
            <p style={{ color: 'var(--muted)', marginBottom: 16, fontSize: 14 }}>
              Você ainda não importou os produtos do ERP.
            </p>
            <p style={{ color: 'var(--muted)', marginBottom: 24, fontSize: 13 }}>
              Vá em <strong>Integração ERP</strong> e clique em <strong>Sincronizar agora</strong>.
            </p>
          </div>
        </>
      );
    }

    // ─── EDIT MODAL ───────────────────────────────────────
    if (editing) {
      const prod = products.find(p => p.ref === editing);
      const original = baseProducts.find(p => p.ref === editing);
      if (!prod) { setEditing(null); return null; }
      return <ProductEditor
        product={prod}
        original={original}
        currentOverride={overrides[editing] || {}}
        onSave={(patch) => handleEditSubmit(editing, patch)}
        onCancel={() => setEditing(null)}
        onReset={() => handleResetProduct(editing)}
      />;
    }

    return (
      <>
        <div className="breadcrumb">ADMIN · VITRINES & CATÁLOGO</div>
        <h1 className="page-title">Vitrines & Catálogo</h1>
        <p className="page-sub">
          Selecione quais produtos do ERP aparecem em cada vitrine. As categorias são preenchidas automaticamente
          pela categoria cadastrada no ERP. Foto e preço de cada peça podem ser personalizados sem alterar o ERP.
        </p>

        {/* STATS */}
        <div className="stats" style={{ marginBottom: 24 }}>
          <div className="stat">
            <div className="stat-label">Produtos no ERP</div>
            <div className="stat-value">{baseProducts.length}</div>
            <div className="stat-delta">disponíveis para vitrines</div>
          </div>
          <div className="stat">
            <div className="stat-label">Em vitrines</div>
            <div className="stat-value">{productsInAnyShowcase}</div>
            <div className="stat-delta">{totalAssignments} atribuições no total</div>
          </div>
          <div className="stat">
            <div className="stat-label">Vitrines ativas</div>
            <div className="stat-value">{collections.length}</div>
            <div className="stat-delta">configuradas em "Página Inicial"</div>
          </div>
          <div className="stat">
            <div className="stat-label">Personalizações</div>
            <div className="stat-value">{Object.keys(overrides).length}</div>
            <div className="stat-delta">peças com edição manual</div>
          </div>
        </div>

        {/* RESUMO POR VITRINE — clicável p/ filtrar */}
        <div className="card" style={{ paddingBottom: 18 }}>
          <h3 className="card-title">Vitrines</h3>
          <p className="card-sub">Clique em uma vitrine para ver e ordenar os produtos atribuídos.</p>
          <div className="vitrine-chips">
            <button
              className={`vit-chip ${!filters.collectionId ? 'active' : ''}`}
              onClick={() => setFilters(f => ({ ...f, collectionId: '' }))}
            >
              <span className="chip-label">Todas as vitrines</span>
              <span className="chip-count">{baseProducts.length}</span>
            </button>
            {collections.map(c => {
              const count = (assignments[c.id] || []).length;
              return (
                <button
                  key={c.id}
                  className={`vit-chip ${filters.collectionId === c.id ? 'active' : ''}`}
                  onClick={() => setFilters(f => ({ ...f, collectionId: c.id, somenteAtribuidos: false }))}
                >
                  <span className="chip-label">{c.title}</span>
                  <span className="chip-count">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* SE FILTRADO POR VITRINE: mostra ordenação drag & drop */}
        {filters.collectionId && (
          <ShowcaseOrderPanel
            collection={collections.find(c => c.id === filters.collectionId)}
            assignments={assignments[filters.collectionId] || []}
            allProducts={products}
            onReorder={(refs) => { reorderAssignment(filters.collectionId, refs); refreshAssignments(); }}
            onRemove={(ref) => { toggleAssignment(filters.collectionId, ref, false); refreshAssignments(); }}
            onEdit={setEditing}
          />
        )}

        {/* FILTROS */}
        <div className="card" style={{ paddingBottom: 8 }}>
          <h3 className="card-title">{filters.collectionId ? 'Adicionar produtos a esta vitrine' : 'Todos os produtos'}</h3>
          <p className="card-sub">
            {filters.collectionId
              ? 'Marque a checkbox da vitrine para incluir o produto. Use os filtros para encontrar peças específicas.'
              : `${filtered.length} produto${filtered.length === 1 ? '' : 's'} encontrado${filtered.length === 1 ? '' : 's'}.`}
          </p>
          <div className="form-grid" style={{ marginTop: 8 }}>
            <div className="field full">
              <label>Buscar</label>
              <input value={filters.busca} onChange={(e) => setFilters(f => ({ ...f, busca: e.target.value }))}
                     placeholder="Nome, SKU ou categoria do ERP…" />
            </div>
            <div className="field">
              <label>Categoria do site</label>
              <select value={filters.categoryId} onChange={(e) => setFilters(f => ({ ...f, categoryId: e.target.value }))}>
                <option value="">Todas</option>
                {allCategoryIds.map(cid => (
                  <option key={cid} value={cid}>{CAT_LABELS[cid] || cid}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ alignSelf: 'end' }}>
              <label>&nbsp;</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', fontSize: 13, fontWeight: 400, letterSpacing: 0, textTransform: 'none', color: 'var(--ink)' }}>
                <input type="checkbox" checked={filters.somenteAtribuidos}
                       onChange={(e) => setFilters(f => ({ ...f, somenteAtribuidos: e.target.checked }))}
                       style={{ width: 16, height: 16 }} />
                Somente em alguma vitrine
              </label>
            </div>
          </div>
        </div>

        {/* LISTA DE PRODUTOS */}
        <ProductGrid
          products={filtered}
          collections={collections}
          assignments={assignments}
          overrides={overrides}
          activeCollectionId={filters.collectionId}
          onToggleAssignment={handleToggleAssignment}
          onEdit={setEditing}
        />
      </>
    );
  }

  // ─── PAINEL DE ORDENAÇÃO (drag & drop) ─────────────────
  function ShowcaseOrderPanel({ collection, assignments, allProducts, onReorder, onRemove, onEdit }) {
    const productsByRef = useMemo(() => {
      const m = {};
      allProducts.forEach(p => { m[p.ref] = p; });
      return m;
    }, [allProducts]);

    const items = assignments.map(ref => productsByRef[ref]).filter(Boolean);
    const dragRef = useRef(null);

    if (!collection) return null;

    const handleDragStart = (e, ref) => {
      dragRef.current = ref;
      e.dataTransfer.effectAllowed = 'move';
      e.currentTarget.classList.add('dragging');
    };
    const handleDragEnd = (e) => {
      e.currentTarget.classList.remove('dragging');
      dragRef.current = null;
      document.querySelectorAll('.so-row.drag-over').forEach(el => el.classList.remove('drag-over'));
    };
    const handleDragOver = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      e.currentTarget.classList.add('drag-over');
    };
    const handleDragLeave = (e) => e.currentTarget.classList.remove('drag-over');
    const handleDrop = (e, targetRef) => {
      e.preventDefault();
      e.currentTarget.classList.remove('drag-over');
      const src = dragRef.current;
      if (!src || src === targetRef) return;
      const next = [...assignments];
      const fromIdx = next.indexOf(src);
      const toIdx = next.indexOf(targetRef);
      if (fromIdx < 0 || toIdx < 0) return;
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, src);
      onReorder(next);
    };

    return (
      <div className="card" style={{ background: '#fdfcf9' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 18 }}>
          <div>
            <h3 className="card-title">Ordem em "{collection.title}"</h3>
            <p className="card-sub" style={{ marginBottom: 0 }}>
              Arraste as peças para reordenar como aparecem na vitrine. {items.length} {items.length === 1 ? 'produto' : 'produtos'} atribuídos.
            </p>
          </div>
        </div>

        {items.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13, fontStyle: 'italic' }}>
            Nenhum produto atribuído a esta vitrine ainda. Use a lista abaixo para adicionar.
          </div>
        ) : (
          <div className="so-list">
            {items.map((p, i) => (
              <div
                key={p.ref}
                className="so-row"
                draggable
                onDragStart={(e) => handleDragStart(e, p.ref)}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, p.ref)}
              >
                <span className="so-handle" title="Arraste para reordenar">⋮⋮</span>
                <span className="so-pos">{String(i + 1).padStart(2, '0')}</span>
                {p.img
                  ? <img src={p.img} alt="" className="so-thumb" />
                  : <div className="so-thumb so-thumb-empty">—</div>}
                <div className="so-info">
                  <div className="so-name">{p.name}</div>
                  <div className="so-meta">
                    <code>{p.ref}</code> · {CAT_LABELS[p._categoryId] || p._categoryId} · {brl(p.to)}
                    {p.hidden && <span className="so-flag hidden">oculto</span>}
                    {p.featured && <span className="so-flag featured">destaque</span>}
                  </div>
                </div>
                <button className="btn-outline" onClick={() => onEdit(p.ref)}>Editar</button>
                <button className="btn-danger" onClick={() => onRemove(p.ref)} title="Remover desta vitrine">Tirar</button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── GRID DE PRODUTOS ──────────────────────────────────
  function ProductGrid({ products, collections, assignments, overrides, activeCollectionId, onToggleAssignment, onEdit }) {
    if (!products.length) {
      return (
        <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--muted)', fontStyle: 'italic' }}>
          Nenhum produto corresponde aos filtros.
        </div>
      );
    }
    return (
      <div className="prod-cards">
        {products.slice(0, 200).map(p => (
          <ProductCard
            key={p.ref}
            product={p}
            collections={collections}
            assignments={assignments}
            isOverridden={!!overrides[p.ref]}
            activeCollectionId={activeCollectionId}
            onToggleAssignment={onToggleAssignment}
            onEdit={() => onEdit(p.ref)}
          />
        ))}
        {products.length > 200 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 16, color: 'var(--muted)', fontSize: 12, fontStyle: 'italic' }}>
            Exibindo primeiros 200 de {products.length} resultados — refine os filtros para ver mais.
          </div>
        )}
      </div>
    );
  }

  // ─── CARD DE PRODUTO ───────────────────────────────────
  function ProductCard({ product: p, collections, assignments, isOverridden, activeCollectionId, onToggleAssignment, onEdit }) {
    const inCollections = collections.filter(c => (assignments[c.id] || []).includes(p.ref));

    return (
      <div className={`pc ${p.hidden ? 'is-hidden' : ''}`}>
        <div className="pc-media">
          {p.img
            ? <img src={p.img} alt={p.name} loading="lazy" />
            : <div className="pc-empty">sem foto</div>}
          {isOverridden && <span className="pc-badge edited">editado</span>}
          {p.featured && <span className="pc-badge feat">destaque</span>}
          {p.hidden && <span className="pc-badge hide">oculto</span>}
        </div>
        <div className="pc-body">
          <div className="pc-name">{p.name}</div>
          <div className="pc-meta">
            <code>{p.ref}</code> · {CAT_LABELS[p._categoryId] || p._categoryId}
          </div>
          <div className="pc-price">
            {p.from > p.to && <span className="pc-from">{brl(p.from)}</span>}
            {brl(p.to)}
          </div>

          <div className="pc-section-label">Aparece em:</div>
          <div className="pc-checks">
            {collections.length === 0 ? (
              <span style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
                Nenhuma vitrine ativa
              </span>
            ) : collections.map(c => {
              const checked = (assignments[c.id] || []).includes(p.ref);
              return (
                <label
                  key={c.id}
                  className={`pc-check ${checked ? 'on' : ''} ${activeCollectionId === c.id ? 'highlight' : ''}`}
                  title={c.title}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => onToggleAssignment(c.id, p.ref, e.target.checked)}
                  />
                  <span>{c.title}</span>
                </label>
              );
            })}
          </div>

          <div className="pc-actions">
            <button className="btn-outline" onClick={onEdit}>Editar foto, preço & detalhes</button>
          </div>
        </div>
      </div>
    );
  }

  // ─── EDITOR DE PRODUTO ─────────────────────────────────
  function ProductEditor({ product: p, original, currentOverride, onSave, onCancel, onReset }) {
    const [draft, setDraft] = useState({
      name: p.name || '',
      desc: p.desc || '',
      longDesc: p.longDesc || '',
      from: p.from || '',
      to: p.to || '',
      img: p.img || '',
      gallery: Array.isArray(p.gallery) ? [...p.gallery] : (p.img ? [p.img] : []),
      feats: Array.isArray(p.feats) ? p.feats.map(f => ({ ...f })) : null,
      featured: !!p.featured,
      hidden: !!p.hidden,
      specs: { ...(p.specs || {}) },
    });
    const [drag, setDrag] = useState(false);
    const fileRef = useRef(null);
    const [urlInput, setUrlInput] = useState('');

    const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));
    const setSpec = (k, v) => setDraft(d => ({ ...d, specs: { ...d.specs, [k]: v } }));

    const handleFiles = async (files) => {
      const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
      const readers = arr.map(file => new Promise(res => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.readAsDataURL(file);
      }));
      const data = await Promise.all(readers);
      setDraft(d => {
        const nextGallery = [...(d.gallery || []), ...data];
        return {
          ...d,
          gallery: nextGallery,
          img: d.img || nextGallery[0] || '',
        };
      });
    };

    const addUrl = () => {
      const u = (urlInput || '').trim();
      if (!u) return;
      setDraft(d => {
        const nextGallery = [...(d.gallery || []), u];
        return { ...d, gallery: nextGallery, img: d.img || u };
      });
      setUrlInput('');
    };

    const removeImage = (i) => {
      setDraft(d => {
        const next = d.gallery.filter((_, j) => j !== i);
        const removed = d.gallery[i];
        const nextImg = d.img === removed ? (next[0] || '') : d.img;
        return { ...d, gallery: next, img: nextImg };
      });
    };

    const setCover = (src) => set('img', src);

    const submit = (e) => {
      e.preventDefault();
      // Diff contra o original do ERP — só guarda o que foi de fato alterado
      const patch = {};
      const changed = (a, b) => (a ?? '') !== (b ?? '');
      if (changed(draft.name, original?.name)) patch.name = draft.name;
      if (changed(draft.desc, original?.desc)) patch.desc = draft.desc;
      if (changed(draft.longDesc, original?.longDesc)) patch.longDesc = draft.longDesc;
      if (Number(draft.from) !== Number(original?.from || 0)) patch.from = Number(draft.from) || 0;
      if (Number(draft.to) !== Number(original?.to || 0)) patch.to = Number(draft.to) || 0;
      if (changed(draft.img, original?.img)) patch.img = draft.img;
      const origGallery = Array.isArray(original?.gallery) ? original.gallery : [];
      if (JSON.stringify(draft.gallery) !== JSON.stringify(origGallery)) patch.gallery = draft.gallery;
      if (draft.featured !== !!original?.featured) patch.featured = draft.featured;
      if (draft.hidden !== !!original?.hidden) patch.hidden = draft.hidden;
      const specsDiff = {};
      Object.keys(draft.specs || {}).forEach(k => {
        if ((draft.specs[k] || '') !== ((original?.specs || {})[k] || '')) specsDiff[k] = draft.specs[k];
      });
      if (Object.keys(specsDiff).length) patch.specs = specsDiff;
      if (JSON.stringify(draft.feats || null) !== JSON.stringify(original?.feats || null)) {
        patch.feats = draft.feats; // array (custom) or null (use default)
      }

      onSave(patch);
    };

    // Helpers para feats (características exibidas no detalhe do produto)
    const buildDefaultFeats = () => {
      const s = draft.specs || {};
      return [
        { label: 'Tipo de produto', value: s.categoria || p.category || '', enabled: true },
        { label: 'Metal', value: s.metal || s.material || 'Ouro 18k', enabled: true },
        { label: 'Pedras', value: (s.pedra || '') + (s.quilates ? ` · ${s.quilates}` : ''), enabled: true },
        { label: 'Acabamento', value: s.acabamento || 'Polido', enabled: true },
        { label: 'Origem', value: s.origem || 'Brasil', enabled: true },
      ];
    };
    const ensureFeats = () => {
      if (!Array.isArray(draft.feats)) {
        setDraft(d => ({ ...d, feats: buildDefaultFeats() }));
      }
    };
    const setFeat = (i, patch) => {
      setDraft(d => {
        const next = [...(d.feats || buildDefaultFeats())];
        next[i] = { ...next[i], ...patch };
        return { ...d, feats: next };
      });
    };
    const addFeat = () => {
      setDraft(d => ({ ...d, feats: [...(d.feats || buildDefaultFeats()), { label: 'Nova característica', value: '', enabled: true }] }));
    };
    const removeFeat = (i) => {
      setDraft(d => {
        const next = [...(d.feats || buildDefaultFeats())];
        next.splice(i, 1);
        return { ...d, feats: next };
      });
    };
    const moveFeat = (i, dir) => {
      setDraft(d => {
        const next = [...(d.feats || buildDefaultFeats())];
        const j = i + dir;
        if (j < 0 || j >= next.length) return d;
        [next[i], next[j]] = [next[j], next[i]];
        return { ...d, feats: next };
      });
    };
    const resetFeats = () => {
      setDraft(d => ({ ...d, feats: null }));
    };
    const featsToShow = Array.isArray(draft.feats) ? draft.feats : buildDefaultFeats();
    const usingCustomFeats = Array.isArray(draft.feats);

    return (
      <>
        <div className="breadcrumb">ADMIN · VITRINES & CATÁLOGO · EDITAR</div>
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {draft.name || p.name}
          {Object.keys(currentOverride).length > 0 && (
            <span style={{ fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', background: '#fff7e0', color: '#8a6a2a', padding: '4px 10px', fontFamily: 'var(--sans)', fontWeight: 500 }}>
              Editado
            </span>
          )}
        </h1>
        <p className="page-sub">
          Editando <code>{p.ref}</code> · categoria <strong>{CAT_LABELS[p._categoryId] || p._categoryId}</strong> (definida pelo ERP).
          Alterações são salvas localmente e não modificam o ERP.
        </p>

        <form onSubmit={submit}>
          {/* GALERIA */}
          <div className="card">
            <h3 className="card-title">Galeria de imagens</h3>
            <p className="card-sub">A primeira imagem (capa) é a que aparece nas vitrines. Clique numa miniatura para definir como capa.</p>

            <div
              className={`uploader ${drag ? 'drag' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
            >
              <div className="uploader-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </div>
              <div className="uploader-text">Arraste imagens ou clique para selecionar</div>
              <div className="uploader-sub">JPG, PNG, WEBP · também aceita URL externa</div>
              <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
                     onChange={(e) => handleFiles(e.target.files)} />
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input
                type="url"
                placeholder="https://… cole o link de uma imagem"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--line)', fontSize: 13 }}
              />
              <button type="button" className="btn-outline" onClick={addUrl} disabled={!urlInput.trim()}>+ URL</button>
            </div>

            {draft.gallery.length > 0 && (
              <div className="thumbs" style={{ marginTop: 16 }}>
                {draft.gallery.map((src, i) => {
                  const isCover = src === draft.img;
                  return (
                    <div key={i} className="thumb" style={{ outline: isCover ? '2px solid var(--green-deep)' : 'none', outlineOffset: 0 }}>
                      <img src={src} alt={`foto ${i + 1}`} onClick={() => setCover(src)} style={{ cursor: 'pointer' }} />
                      {isCover && <span className="badge">Capa</span>}
                      <button type="button" className="thumb-rm" onClick={() => removeImage(i)}>×</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* INFO */}
          <div className="card">
            <h3 className="card-title">Informações</h3>
            <div className="form-grid">
              <div className="field full">
                <label>Nome da peça</label>
                <input value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder={original?.name} />
                {original?.name && draft.name !== original.name && (
                  <span className="hint">Original do ERP: {original.name}</span>
                )}
              </div>
              <div className="field full">
                <label>Descrição curta</label>
                <input value={draft.desc} onChange={(e) => set('desc', e.target.value)} placeholder={original?.desc} />
                <span className="hint">Aparece no card do produto na vitrine</span>
              </div>
              <div className="field full">
                <label>Descrição completa</label>
                <textarea rows={3} value={draft.longDesc} onChange={(e) => set('longDesc', e.target.value)}
                          placeholder="Descreva detalhes, inspiração, processo artesanal…" />
                <span className="hint">Aparece na página de detalhes da peça</span>
              </div>
            </div>
          </div>

          {/* PREÇO */}
          <div className="card">
            <h3 className="card-title">Preço</h3>
            <p className="card-sub">Sobrescreve o preço vindo do ERP. Use "De" para mostrar valor original riscado.</p>
            <div className="form-grid">
              <div className="field">
                <label>Preço "De:" (R$)</label>
                <input type="number" min="0" step="0.01" value={draft.from}
                       onChange={(e) => set('from', e.target.value)} placeholder="opcional" />
                <span className="hint">Original riscado; opcional</span>
              </div>
              <div className="field">
                <label>Preço "Por:" (R$)</label>
                <input type="number" min="0" step="0.01" value={draft.to}
                       onChange={(e) => set('to', e.target.value)} placeholder={String(original?.to || 0)} />
                <span className="hint">Preço de venda exibido no site{original?.to ? ` · ERP: ${brl(original.to)}` : ''}</span>
              </div>
            </div>
          </div>

          {/* CARACTERÍSTICAS (feats exibidas no detalhe do produto) */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <h3 className="card-title" style={{ margin: 0 }}>Características no detalhe</h3>
              {usingCustomFeats && (
                <button type="button" className="btn-ghost-mini" onClick={resetFeats} title="Volta a usar a ficha técnica padrão">
                  Restaurar padrão
                </button>
              )}
            </div>
            <p className="card-sub" style={{ marginBottom: 16 }}>
              Os campos abaixo aparecem na seção <strong>CARACTERÍSTICAS</strong> da página do produto.
              Use o switch para ativar/desativar cada um, edite o rótulo e o valor, ou adicione novos campos personalizados.
            </p>

            <ul className="feat-list">
              {featsToShow.map((f, i) => (
                <li key={i} className={`feat-row ${f.enabled === false ? 'is-disabled' : ''}`}>
                  <label className="switch" title={f.enabled === false ? 'Ativar' : 'Desativar'}>
                    <input type="checkbox" checked={f.enabled !== false}
                           onChange={(e) => { ensureFeats(); setFeat(i, { enabled: e.target.checked }); }} />
                    <span></span>
                  </label>
                  <input className="feat-label-input"
                         value={f.label}
                         placeholder="Rótulo (ex: Metal)"
                         onChange={(e) => { ensureFeats(); setFeat(i, { label: e.target.value }); }} />
                  <input className="feat-value-input"
                         value={f.value}
                         placeholder="Valor (ex: Ouro 18k)"
                         onChange={(e) => { ensureFeats(); setFeat(i, { value: e.target.value }); }} />
                  <div className="col-item-order">
                    <button type="button" onClick={() => { ensureFeats(); moveFeat(i, -1); }} disabled={i === 0} title="Subir">▲</button>
                    <button type="button" onClick={() => { ensureFeats(); moveFeat(i, +1); }} disabled={i === featsToShow.length - 1} title="Descer">▼</button>
                  </div>
                  <button type="button" className="btn-ghost-mini btn-danger" onClick={() => { ensureFeats(); removeFeat(i); }} title="Remover">×</button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn-add-vitrine" onClick={addFeat}>
              + Adicionar característica
            </button>
          </div>

          {/* FLAGS */}
          <div className="card">
            <h3 className="card-title">Visibilidade & destaque</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14 }}>
                <input type="checkbox" checked={draft.featured} onChange={(e) => set('featured', e.target.checked)}
                       style={{ width: 18, height: 18 }} />
                <strong>Destacar</strong> — peça ganha selo "destaque" nas vitrines
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14 }}>
                <input type="checkbox" checked={draft.hidden} onChange={(e) => set('hidden', e.target.checked)}
                       style={{ width: 18, height: 18 }} />
                <strong>Ocultar do site</strong> — peça não aparece no <code>Catalogo.html</code>, mesmo que esteja em uma vitrine
              </label>
            </div>
          </div>

          <div className="form-actions">
            {Object.keys(currentOverride).length > 0 && (
              <button type="button" className="btn-ghost-mini" onClick={onReset} style={{ marginRight: 'auto' }}>
                Restaurar dados originais do ERP
              </button>
            )}
            <button type="button" className="btn-ghost" onClick={onCancel}>Cancelar</button>
            <button type="submit" className="btn-solid">Salvar alterações</button>
          </div>
        </form>
      </>
    );
  }

  // ─── EXPORT ────────────────────────────────────────────
  window.AdminShowcaseTab = { ShowcaseTab };
})();
