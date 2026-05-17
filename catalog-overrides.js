/* ─────────────────────────────────────────────────────────────
   CATALOG OVERRIDES API
   Editar produtos do ERP no painel sem modificar o ERP:
     - aurelia.productOverrides.v1   → edits por ref/SKU (foto, preço, nome…)
     - aurelia.showcaseAssignments.v1 → quais refs entram em cada vitrine + ordem
   Ambos persistidos em localStorage; consumidos pelo Catalogo.html.
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const OV_KEY = 'aurelia.productOverrides.v1';
  const SC_KEY = 'aurelia.showcaseAssignments.v1';

  // ─── OVERRIDES ──────────────────────────────────────────
  function loadOverrides() {
    try { return JSON.parse(localStorage.getItem(OV_KEY) || '{}') || {}; }
    catch { return {}; }
  }
  function saveOverrides(map) {
    localStorage.setItem(OV_KEY, JSON.stringify(map || {}));
    try { window.dispatchEvent(new StorageEvent('storage', { key: OV_KEY })); } catch {}
  }
  function setOverride(ref, patch) {
    if (!ref) return;
    const all = loadOverrides();
    all[ref] = { ...(all[ref] || {}), ...patch };
    // Limpa chaves vazias para não engordar storage
    Object.keys(all[ref]).forEach(k => {
      const v = all[ref][k];
      if (v === '' || v === null || v === undefined) delete all[ref][k];
    });
    if (Object.keys(all[ref]).length === 0) delete all[ref];
    saveOverrides(all);
  }
  function clearOverride(ref) {
    const all = loadOverrides();
    delete all[ref];
    saveOverrides(all);
  }

  // Aplica overrides a um produto já mapeado pelo ErpAPI
  function applyOverride(prod, ov) {
    if (!prod) return prod;
    const o = ov || loadOverrides()[prod.ref];
    if (!o) return prod;
    const next = { ...prod };
    if (o.name) next.name = o.name;
    if (o.desc !== undefined) next.desc = o.desc;
    if (o.longDesc !== undefined) next.longDesc = o.longDesc;
    if (o.from !== undefined && o.from !== '') next.from = Number(o.from) || 0;
    if (o.to !== undefined && o.to !== '') next.to = Number(o.to) || prod.to;
    if (o.img) next.img = o.img;
    if (Array.isArray(o.gallery) && o.gallery.length) {
      next.gallery = o.gallery;
      if (!o.img) next.img = o.gallery[0];
    }
    if (o.featured !== undefined) next.featured = !!o.featured;
    if (o.hidden !== undefined) next.hidden = !!o.hidden;
    if (o.specs && typeof o.specs === 'object') {
      next.specs = { ...(prod.specs || {}), ...o.specs };
    }
    if (Array.isArray(o.feats)) { next.feats = o.feats; }
    return next;
  }

  // ─── SHOWCASE ASSIGNMENTS ──────────────────────────────
  // Estrutura: { [collectionId]: [ref1, ref2, ...] }  (ordem importa)
  function loadAssignments() {
    try { return JSON.parse(localStorage.getItem(SC_KEY) || '{}') || {}; }
    catch { return {}; }
  }
  function saveAssignments(map) {
    localStorage.setItem(SC_KEY, JSON.stringify(map || {}));
    try { window.dispatchEvent(new StorageEvent('storage', { key: SC_KEY })); } catch {}
  }
  function setAssignments(collectionId, refs) {
    const all = loadAssignments();
    all[collectionId] = Array.from(new Set((refs || []).filter(Boolean)));
    saveAssignments(all);
  }
  function getAssignments(collectionId) {
    return loadAssignments()[collectionId] || [];
  }
  function toggleAssignment(collectionId, ref, on) {
    const all = loadAssignments();
    const list = all[collectionId] || [];
    const has = list.includes(ref);
    if (on === undefined) on = !has;
    if (on && !has) all[collectionId] = [...list, ref];
    if (!on && has) all[collectionId] = list.filter(r => r !== ref);
    saveAssignments(all);
  }
  function moveAssignment(collectionId, ref, dir) {
    const all = loadAssignments();
    const list = [...(all[collectionId] || [])];
    const i = list.indexOf(ref);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    all[collectionId] = list;
    saveAssignments(all);
  }
  function reorderAssignment(collectionId, refs) {
    const all = loadAssignments();
    all[collectionId] = refs;
    saveAssignments(all);
  }

  // Quais coleções contêm dado ref
  function collectionsOf(ref) {
    const all = loadAssignments();
    return Object.keys(all).filter(cid => (all[cid] || []).includes(ref));
  }

  // ─── GALERIA EDITORIAL ─────────────────────────────────────
  // Estrutura: [{ id, url, productRef, format, label, target, createdAt }]
  // target: 'home' | 'pingentes' | 'aneis' | 'brincos' | 'pulseiras' | 'correntes'
  // format: 'portrait' | 'landscape' | 'square'
  const ED_KEY = 'aurelia.editorialGallery.v1';

  function loadEditorial() {
    try { return JSON.parse(localStorage.getItem(ED_KEY) || '[]') || []; }
    catch { return []; }
  }
  function saveEditorial(list) {
    localStorage.setItem(ED_KEY, JSON.stringify(list || []));
    try { window.dispatchEvent(new StorageEvent('storage', { key: ED_KEY })); } catch {}
  }
  function addEditorial({ url, productRef = '', format = 'portrait', label = '', target = 'home' }) {
    const list = loadEditorial();
    const item = { id: `ed-${Date.now()}`, url, productRef, format, label, target, createdAt: Date.now() };
    list.push(item);
    saveEditorial(list);
    return item;
  }
  function updateEditorial(id, patch) {
    const list = loadEditorial().map(e => e.id === id ? { ...e, ...patch } : e);
    saveEditorial(list);
  }
  function removeEditorial(id) {
    saveEditorial(loadEditorial().filter(e => e.id !== id));
  }
  function moveEditorial(id, dir) {
    const list = loadEditorial();
    const i = list.findIndex(e => e.id === id);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    saveEditorial(list);
  }

  window.CatalogOverrides = {
    OV_KEY, SC_KEY, ED_KEY,
    loadOverrides, saveOverrides, setOverride, clearOverride, applyOverride,
    loadAssignments, saveAssignments, setAssignments, getAssignments,
    toggleAssignment, moveAssignment, reorderAssignment, collectionsOf,
    loadEditorial, saveEditorial, addEditorial, updateEditorial, removeEditorial, moveEditorial,
  };
})();
