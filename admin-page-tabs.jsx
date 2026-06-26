/* ─────────────────────────────────────────────────────────────
   ADMIN PAGE TABS
   - HomeSettingsTab: edita hero + ativação/edição das vitrines
   - CategoriesSettingsTab: edita as 5 galerias por categoria
   ───────────────────────────────────────────────────────────── */
const { useState, useEffect, useMemo, useRef } = React;

// ─── COMPONENTES UI COMPARTILHADOS ──────────────────────────
function Switch({ checked, onChange, label }) {
  if (label) {
    return (
      <label className="switch-inline">
        <span className="switch">
          <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
          <span></span>
        </span>
        {label}
      </label>
    );
  }
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span></span>
    </label>
  );
}

function Field({ label, hint, children }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <small className="field-hint">{hint}</small>}
    </div>
  );
}

// ─── HOME SETTINGS TAB ──────────────────────────────────────
function HomeSettingsTab({ settings, onSave, products, show }) {
  const [draft, setDraft] = useState(() => clone(settings));
  const [dirty, setDirty] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [assignments, setAssignmentsS] = useState(
    () => (window.CatalogOverrides && window.CatalogOverrides.loadAssignments()) || {}
  );

  useEffect(() => { setDraft(clone(settings)); setDirty(false); }, [settings]);

  useEffect(() => {
    const onStorage = (e) => {
      if (window.CatalogOverrides && e.key === window.CatalogOverrides.SC_KEY) {
        setAssignmentsS(window.CatalogOverrides.loadAssignments());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggleProduct = (collectionId, ref, on) => {
    if (!window.CatalogOverrides) return;
    window.CatalogOverrides.toggleAssignment(collectionId, ref, on);
    setAssignmentsS(window.CatalogOverrides.loadAssignments());
  };
  const moveProduct = (collectionId, ref, dir) => {
    if (!window.CatalogOverrides) return;
    window.CatalogOverrides.moveAssignment(collectionId, ref, dir);
    setAssignmentsS(window.CatalogOverrides.loadAssignments());
  };

  const erpProducts = (window.ErpAPI && window.ErpAPI.loadCache()?.products) || [];
  const allProducts = useMemo(() => {
    const seen = new Set();
    const out = [];
    [...erpProducts, ...(products || [])].forEach((p) => {
      if (!p || !p.ref || seen.has(p.ref)) return;
      seen.add(p.ref);
      out.push(p);
    });
    return out;
  }, [erpProducts, products]);

  const update = (path, value) => {
    setDraft((d) => {
      const next = clone(d);
      setByPath(next, path, value);
      return next;
    });
    setDirty(true);
  };

  const updateCollection = (idx, patch) => {
    setDraft((d) => {
      const next = clone(d);
      next.home.collections[idx] = { ...next.home.collections[idx], ...patch };
      return next;
    });
    setDirty(true);
  };

  const moveCollection = (idx, dir) => {
    setDraft((d) => {
      const next = clone(d);
      const arr = next.home.collections;
      const j = idx + dir;
      if (j < 0 || j >= arr.length) return d;
      [arr[idx], arr[j]] = [arr[j], arr[idx]];
      return next;
    });
    setDirty(true);
  };

  const addCollection = () => {
    setDraft((d) => {
      const next = clone(d);
      const existing = new Set(next.home.collections.map((c) => c.id));
      let i = 1;
      let id = `vitrine-${i}`;
      while (existing.has(id)) { i++; id = `vitrine-${i}`; }
      next.home.collections.push({
        id,
        enabled: true,
        kicker: `CAPÍTULO ${next.home.collections.length + 1}`,
        title: 'Nova vitrine',
        subtitle: 'Descrição da vitrine.',
      });
      return next;
    });
    setExpanded(null);
    setDirty(true);
  };

  const removeCollection = (idx) => {
    const c = draft.home.collections[idx];
    if (!confirm(`Remover a vitrine "${c.title}"?\nOs produtos atribuídos a ela serão desvinculados.`)) return;
    setDraft((d) => {
      const next = clone(d);
      next.home.collections.splice(idx, 1);
      return next;
    });
    if (window.CatalogOverrides) {
      const all = window.CatalogOverrides.loadAssignments();
      if (all[c.id]) {
        delete all[c.id];
        window.CatalogOverrides.saveAssignments(all);
        setAssignmentsS(window.CatalogOverrides.loadAssignments());
      }
    }
    if (expanded === c.id) setExpanded(null);
    setDirty(true);
  };

  const handleSave = () => {
    onSave(draft);
    setDirty(false);
    show('Página inicial atualizada');
  };

  const handleReset = () => {
    if (!confirm('Restaurar configurações originais da página inicial?')) return;
    const fresh = window.PageSettingsAPI.resetPageSettings();
    onSave(fresh);
    show('Página inicial restaurada');
  };

  const h = draft.home;
  const productCount = products?.length || 0;

  return (
    <>
      <div className="breadcrumb">ADMIN · PÁGINA INICIAL</div>
      <h1 className="page-title">Página Inicial</h1>
      <p className="page-sub">
        Edite o banner principal e as vitrines de coleção que aparecem em <code>Catalogo.html</code>.
        Você tem <strong>{productCount}</strong> {productCount === 1 ? 'produto cadastrado' : 'produtos cadastrados'}.
      </p>

      {/* HERO */}
      <div className="card" style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 24 }}>
          <div style={{ flex: 1 }}>
            <h2 className="card-title">Banner Principal (Hero)</h2>
            <p className="card-sub" style={{ marginBottom: 0 }}>Aparece no topo da página inicial, com o bracelete 3D animado.</p>
          </div>
          <Switch checked={h.hero.enabled} onChange={(v) => update('home.hero.enabled', v)} />
        </div>
        <div style={{ opacity: h.hero.enabled ? 1 : 0.45, display: 'grid', gap: 20 }}>
          <Field label="Linha de destaque (kicker)" hint="Texto pequeno acima do título — ex: 'COLEÇÃO 2024'">
            <input value={h.hero.kicker} onChange={(e) => update('home.hero.kicker', e.target.value)} disabled={!h.hero.enabled} />
          </Field>
          <Field label="Título">
            <input value={h.hero.title} onChange={(e) => update('home.hero.title', e.target.value)} disabled={!h.hero.enabled} />
          </Field>
          <Field label="Subtítulo / descrição">
            <textarea rows={3} value={h.hero.subtitle} onChange={(e) => update('home.hero.subtitle', e.target.value)} disabled={!h.hero.enabled} />
          </Field>
          <div className="row-3">
            <Field label="Botão primário (CTA)">
              <input value={h.hero.ctaPrimary} onChange={(e) => update('home.hero.ctaPrimary', e.target.value)} disabled={!h.hero.enabled} />
            </Field>
            <Field label="Botão secundário">
              <input value={h.hero.ctaSecondary} onChange={(e) => update('home.hero.ctaSecondary', e.target.value)} disabled={!h.hero.enabled} />
            </Field>
          </div>
        </div>
      </div>

      {/* COLEÇÕES */}
      <div className="card" style={{ marginTop: 24 }}>
        <div style={{ marginBottom: 24 }}>
          <h2 className="card-title">Vitrines (Coleções)</h2>
          <p className="card-sub" style={{ marginBottom: 0 }}>As vitrines temáticas que aparecem na página inicial. Use as setas para reordenar.</p>
        </div>
        <div>
          <div className="col-list">
            {h.collections.map((c, idx) => {
              const isOpen = expanded === c.id;
              return (
                <div key={c.id} className={`col-item ${!c.enabled ? 'is-disabled' : ''}`}>
                  <div className="col-item-head">
                    <Switch checked={c.enabled} onChange={(v) => updateCollection(idx, { enabled: v })} />
                    <div className="col-item-info">
                      <div className="col-item-title">{c.title}</div>
                      <div className="col-item-id">{c.kicker} · ID: {c.id}</div>
                    </div>
                    <div className="col-item-order">
                      <button onClick={() => moveCollection(idx, -1)} disabled={idx === 0} title="Mover para cima">▲</button>
                      <button onClick={() => moveCollection(idx, +1)} disabled={idx === h.collections.length - 1} title="Mover para baixo">▼</button>
                    </div>
                    <button className="btn-ghost-mini" onClick={() => setExpanded(isOpen ? null : c.id)}>
                      {isOpen ? 'Fechar' : 'Editar'}
                    </button>
                    <button
                      className="btn-ghost-mini btn-danger"
                      onClick={() => removeCollection(idx)}
                      title="Remover vitrine"
                    >×</button>
                  </div>
                  {isOpen && (
                    <div className="col-item-edit">
                      <Field label="Capítulo (kicker)">
                        <input value={c.kicker} onChange={(e) => updateCollection(idx, { kicker: e.target.value })} />
                      </Field>
                      <Field label="Título da vitrine">
                        <input value={c.title} onChange={(e) => updateCollection(idx, { title: e.target.value })} />
                      </Field>
                      <Field label="Descrição">
                        <textarea rows={2} value={c.subtitle} onChange={(e) => updateCollection(idx, { subtitle: e.target.value })} />
                      </Field>
                      <CollectionProductPicker
                        collection={c}
                        products={allProducts}
                        assigned={assignments[c.id] || []}
                        onToggle={(ref, on) => toggleProduct(c.id, ref, on)}
                        onMove={(ref, dir) => moveProduct(c.id, ref, dir)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button className="btn-add-vitrine" onClick={addCollection}>
            + Adicionar nova vitrine
          </button>
        </div>
      </div>

      <div className="actions-bar">
        <button className="btn-ghost-mini" onClick={handleReset}>Restaurar padrão</button>
        <button className="btn-primary" onClick={handleSave} disabled={!dirty}>
          {dirty ? 'Salvar alterações' : 'Sem alterações'}
        </button>
      </div>
    </>
  );
}

// ─── COLLECTION PRODUCT PICKER ──────────────────────────────
function CollectionProductPicker({ collection, products, assigned, onToggle, onMove }) {
  const [query, setQuery] = useState('');
  const productsByRef = useMemo(() => {
    const m = {};
    (products || []).forEach((p) => { if (p && p.ref) m[p.ref] = p; });
    return m;
  }, [products]);

  const assignedItems = assigned.map((ref) => productsByRef[ref] || { ref, name: `(produto removido) ${ref}` });

  const q = query.trim().toLowerCase();
  const available = (products || []).filter((p) => {
    if (assigned.includes(p.ref)) return false;
    if (!q) return true;
    return `${p.name || ''} ${p.ref || ''}`.toLowerCase().includes(q);
  });

  const total = (products || []).length;

  return (
    <div className="vit-picker">
      <div className="vit-picker-title">
        Produtos desta vitrine
        <span className="vit-picker-count">{assignedItems.length} selecionado{assignedItems.length === 1 ? '' : 's'}</span>
      </div>

      {assignedItems.length > 0 ? (
        <ul className="vit-picker-list">
          {assignedItems.map((p, i) => (
            <li key={p.ref} className="vit-picker-row is-assigned">
              <div className="vit-picker-info">
                <strong>{p.name}</strong>
                <small>REF {p.ref}</small>
              </div>
              <div className="col-item-order">
                <button onClick={() => onMove(p.ref, -1)} disabled={i === 0} title="Mover para cima">▲</button>
                <button onClick={() => onMove(p.ref, +1)} disabled={i === assignedItems.length - 1} title="Mover para baixo">▼</button>
              </div>
              <button className="btn-ghost-mini" onClick={() => onToggle(p.ref, false)}>Remover</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="vit-picker-empty">Nenhum produto selecionado. Adicione abaixo.</p>
      )}

      <div className="vit-picker-add">
        <input
          type="search"
          placeholder={total ? 'Buscar por nome ou referência…' : ''}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="vit-picker-search"
          disabled={!total}
        />

        {total === 0 ? (
          <p className="vit-picker-empty">Nenhum produto disponível. Cadastre em <strong>Produtos</strong> ou sincronize na aba <strong>Vitrines &amp; Catálogo</strong>.</p>
        ) : available.length === 0 ? (
          <p className="vit-picker-empty">{q ? 'Nenhum produto corresponde à busca.' : 'Todos os produtos já estão nesta vitrine.'}</p>
        ) : (
          <ul className="vit-picker-list">
            {available.slice(0, 12).map((p) => (
              <li key={p.ref} className="vit-picker-row">
                <div className="vit-picker-info">
                  <strong>{p.name}</strong>
                  <small>REF {p.ref}{p._categoryId ? ` · ${p._categoryId}` : ''}</small>
                </div>
                <button className="btn-ghost-mini" onClick={() => onToggle(p.ref, true)}>+ Adicionar</button>
              </li>
            ))}
            {available.length > 12 && (
              <li className="vit-picker-empty">…e mais {available.length - 12}. Refine a busca.</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── CATEGORIES SETTINGS TAB ────────────────────────────────
function CategoriesSettingsTab({ settings, onSave, show }) {
  const [draft, setDraft] = useState(() => clone(settings));
  const [dirty, setDirty] = useState(false);

  useEffect(() => { setDraft(clone(settings)); setDirty(false); }, [settings]);

  const updateCat = (idx, patch) => {
    setDraft((d) => {
      const next = clone(d);
      next.categories[idx] = { ...next.categories[idx], ...patch };
      return next;
    });
    setDirty(true);
  };

  const moveCat = (idx, dir) => {
    setDraft((d) => {
      const next = clone(d);
      const arr = next.categories;
      const j = idx + dir;
      if (j < 0 || j >= arr.length) return d;
      [arr[idx], arr[j]] = [arr[j], arr[idx]];
      return next;
    });
    setDirty(true);
  };

  const handleSave = () => {
    onSave(draft);
    setDirty(false);
    show('Categorias atualizadas');
  };

  const handleReset = () => {
    if (!confirm('Restaurar todas as categorias para o padrão original?')) return;
    const fresh = window.PageSettingsAPI.resetPageSettings();
    onSave(fresh);
    show('Categorias restauradas');
  };

  return (
    <>
      <div className="breadcrumb">ADMIN · CATEGORIAS</div>
      <h1 className="page-title">Categorias</h1>
      <p className="page-sub">
        Edite os textos das galerias por categoria (Pingentes, Anéis, Brincos, Pulseiras, Correntes).
        Cada categoria agrupa automaticamente os produtos cadastrados com aquele tipo.
      </p>

      <div className="cat-list" style={{ marginTop: 24 }}>
        {draft.categories.map((c, idx) => (
          <div key={c.id} className={`cat-card ${!c.enabled ? 'is-disabled' : ''}`}>
            <div className="cat-card-head">
              <Switch checked={c.enabled} onChange={(v) => updateCat(idx, { enabled: v })} />
              <div className="cat-card-id">
                <div className="cat-label">{c.label}</div>
                <div className="cat-meta">
                  ID: <code>{c.id}</code> · Posição: {idx + 1} de {draft.categories.length}
                </div>
              </div>
              <div className="col-item-order">
                <button onClick={() => moveCat(idx, -1)} disabled={idx === 0} title="Mover para cima">▲</button>
                <button onClick={() => moveCat(idx, +1)} disabled={idx === draft.categories.length - 1} title="Mover para baixo">▼</button>
              </div>
            </div>
            {c.enabled && (
              <div className="cat-card-body">
                <div className="row-3">
                  <Field label="Nome no menu">
                    <input value={c.label} onChange={(e) => updateCat(idx, { label: e.target.value })} />
                  </Field>
                  <Field label="Kicker da galeria" hint="Texto pequeno acima do título">
                    <input value={c.kicker} onChange={(e) => updateCat(idx, { kicker: e.target.value })} />
                  </Field>
                  <Field label="Mostrar fotos editoriais" hint="Silhuetas decorativas no mosaico">
                    <div className="field-inline">
                      <Switch
                        checked={c.showEditorial}
                        onChange={(v) => updateCat(idx, { showEditorial: v })}
                        label={c.showEditorial ? 'Sim, exibir' : 'Não, ocultar'}
                      />
                    </div>
                  </Field>
                </div>

                <div className="sub-section">Cabeçalho da galeria</div>
                <Field label="Título">
                  <input value={c.title} onChange={(e) => updateCat(idx, { title: e.target.value })} />
                </Field>
                <Field label="Subtítulo">
                  <textarea rows={2} value={c.subtitle} onChange={(e) => updateCat(idx, { subtitle: e.target.value })} />
                </Field>

                <div className="sub-section">Estado vazio</div>
                <Field label="Mensagem quando não houver produtos" hint="Mostrada se nenhum produto desta categoria estiver cadastrado.">
                  <input value={c.emptyMsg} onChange={(e) => updateCat(idx, { emptyMsg: e.target.value })} />
                </Field>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="actions-bar">
        <button className="btn-ghost-mini" onClick={handleReset}>Restaurar padrão</button>
        <button className="btn-primary" onClick={handleSave} disabled={!dirty}>
          {dirty ? 'Salvar alterações' : 'Sem alterações'}
        </button>
      </div>
    </>
  );
}

// ─── HELPERS ────────────────────────────────────────────────
function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
function setByPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

// ─── EDITORIAL GALLERY TAB ──────────────────────────────────
function EditorialGalleryTab({ products, show }) {
  const OV = window.CatalogOverrides;
  const [items, setItems] = useState(() => OV ? OV.loadEditorial() : []);
  const [drag, setDrag] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === OV?.ED_KEY) setItems(OV.loadEditorial());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const refresh = () => setItems(OV.loadEditorial());

  const erpProducts = (window.ErpAPI && window.ErpAPI.loadCache()?.products) || [];
  const allProducts = useMemo(() => {
    const seen = new Set();
    const out = [];
    [...erpProducts, ...(products || [])].forEach((p) => {
      if (!p || !p.ref || seen.has(p.ref)) return;
      seen.add(p.ref);
      out.push(p);
    });
    return out;
  }, [erpProducts, products]);

  const handleFiles = async (files) => {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
    for (const file of arr) {
      const url = await new Promise(res => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.readAsDataURL(file);
      });
      OV.addEditorial({ url, productRef: '', format: 'square', label: '' });
    }
    refresh();
    if (arr.length) show(`${arr.length} foto${arr.length === 1 ? '' : 's'} adicionada${arr.length === 1 ? '' : 's'}`);
  };

  const addFromUrl = () => {
    const u = (urlInput || '').trim();
    if (!u) return;
    OV.addEditorial({ url: u, productRef: '', format: 'square', label: '' });
    setUrlInput('');
    refresh();
    show('Foto adicionada via URL');
  };

  const update = (id, patch) => { OV.updateEditorial(id, patch); refresh(); };
  const remove = (id) => {
    if (!confirm('Remover esta foto da galeria conceitual?')) return;
    OV.removeEditorial(id); refresh();
  };
  const move = (id, dir) => { OV.moveEditorial(id, dir); refresh(); };

  return (
    <>
      <div className="breadcrumb">ADMIN · GALERIA CONCEITUAL</div>
      <h1 className="page-title">Galeria Conceitual</h1>
      <p className="page-sub">
        Fotos editoriais que aparecem em mosaico na página inicial. Cada foto fica associada a um produto —
        ao clicar na foto no catálogo, o usuário é levado para a página daquele produto.
      </p>

      <div className="card" style={{ marginTop: 24 }}>
        <h3 className="card-title">Adicionar fotos</h3>
        <p className="card-sub">Arraste imagens, faça upload ou cole uma URL externa.</p>

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
          <button type="button" className="btn-outline" onClick={addFromUrl} disabled={!urlInput.trim()}>+ URL</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 className="card-title" style={{ margin: 0 }}>Fotos da galeria</h3>
          <span style={{ fontSize: 11, letterSpacing: '.12em', color: 'var(--muted)' }}>
            {items.length} {items.length === 1 ? 'foto' : 'fotos'}
          </span>
        </div>

        {items.length === 0 ? (
          <p className="vit-picker-empty">Nenhuma foto adicionada ainda. Use o uploader acima.</p>
        ) : (
          <ul className="ed-list">
            {items.map((item, i) => (
              <EditorialItem
                key={item.id}
                item={item}
                index={i}
                total={items.length}
                products={allProducts}
                onUpdate={(patch) => update(item.id, patch)}
                onRemove={() => remove(item.id)}
                onMove={(dir) => move(item.id, dir)}
              />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

const EDITORIAL_TARGETS = [
  { id: 'home', label: 'Página inicial' },
  { id: 'pingentes', label: 'Pingentes' },
  { id: 'aneis', label: 'Anéis' },
  { id: 'brincos', label: 'Brincos' },
  { id: 'pulseiras', label: 'Pulseiras' },
  { id: 'correntes', label: 'Correntes' },
];

function EditorialItem({ item, index, total, products, onUpdate, onRemove, onMove }) {
  const [productSearch, setProductSearch] = useState('');
  const productsByRef = useMemo(() => {
    const m = {};
    (products || []).forEach(p => { if (p?.ref) m[p.ref] = p; });
    return m;
  }, [products]);
  const linked = productsByRef[item.productRef];

  const q = productSearch.trim().toLowerCase();
  const matches = !q ? [] : (products || []).filter(p => {
    const hay = `${p.name || ''} ${p.ref || ''}`.toLowerCase();
    return hay.includes(q);
  }).slice(0, 6);

  return (
    <li className="ed-row">
      <div className={`ed-thumb ed-thumb-${item.format || 'square'}`}>
        <img src={item.url} alt={item.label || 'foto conceitual'} />
      </div>
      <div className="ed-fields">
        <div className="ed-field-row">
          <label className="ed-mini-label">EXIBIR EM</label>
          <select value={item.target || 'home'} onChange={(e) => onUpdate({ target: e.target.value })}>
            {EDITORIAL_TARGETS.map(t => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="ed-field-row">
          <label className="ed-mini-label">FORMATO</label>
          <select value={item.format || 'square'} onChange={(e) => onUpdate({ format: e.target.value })}>
            <option value="square">Quadrado (1:1)</option>
            <option value="wide">Panorâmico (16:9)</option>
            <option value="tall">Vertical alto (4:5)</option>
            <option value="portrait">Retrato (3:4)</option>
          </select>
        </div>
        <div className="ed-field-row">
          <label className="ed-mini-label">LEGENDA</label>
          <input type="text" value={item.label || ''} placeholder="Texto opcional sobre a foto"
                 onChange={(e) => onUpdate({ label: e.target.value })} />
        </div>
        <div className="ed-field-row">
          <label className="ed-mini-label">PRODUTO LIGADO</label>
          {linked ? (
            <div className="ed-linked">
              <strong>{linked.name}</strong>
              <small>REF {linked.ref}</small>
              <button type="button" className="btn-ghost-mini" onClick={() => onUpdate({ productRef: '' })}>Trocar</button>
            </div>
          ) : (
            <div className="ed-search">
              <input type="search" placeholder="Buscar produto por nome ou REF…"
                     value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
              {matches.length > 0 && (
                <ul className="ed-search-results">
                  {matches.map(p => (
                    <li key={p.ref}>
                      <button type="button" onClick={() => { onUpdate({ productRef: p.ref }); setProductSearch(''); }}>
                        <strong>{p.name}</strong>
                        <small>REF {p.ref}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {q && matches.length === 0 && <p className="vit-picker-empty">Nenhum produto corresponde à busca.</p>}
            </div>
          )}
        </div>
      </div>
      <div className="ed-actions">
        <div className="col-item-order">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} title="Subir">▲</button>
          <button type="button" onClick={() => onMove(+1)} disabled={index === total - 1} title="Descer">▼</button>
        </div>
        <button type="button" className="btn-ghost-mini btn-danger" onClick={onRemove} title="Remover">×</button>
      </div>
    </li>
  );
}

// Expor para o painel
window.AdminPageTabs = { HomeSettingsTab, CategoriesSettingsTab, EditorialGalleryTab };
