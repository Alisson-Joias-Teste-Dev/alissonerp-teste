/* ─────────────────────────────────────────────────────────────
   PAGE SETTINGS API
   Sistema de configuração de páginas (home + categorias).
   Persistido em localStorage; consumido pelo Catalogo.html.
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const STORAGE_KEY = 'aurelia.pageSettings.v1';

  // ─── DEFAULTS ──────────────────────────────────────────────
  const DEFAULT_SETTINGS = {
    home: {
      hero: {
        enabled: true,
        kicker: 'DIA DAS MÃES · 2026',
        title: 'Para a mulher que ensinou tudo.',
        subtitle: 'Curadoria exclusiva de peças únicas com valores bem abaixo do mercado — oportunidade por tempo estritamente limitado.',
        ctaPrimary: 'VER ACERVO EXCLUSIVO',
        ctaSecondary: 'FALAR COM CONSULTORA',
      },
      collections: [
        { id: 'imperial', enabled: true, kicker: 'CAPÍTULO I', title: 'Herança Imperial', subtitle: 'Pingentes que carregam o peso simbólico de um reinado.' },
        { id: 'aurora',   enabled: true, kicker: 'CAPÍTULO II', title: 'Luz de Aurora', subtitle: 'Brincos e correntes em ouro brunido, para luz tátil sobre a pele.' },
        { id: 'jardim',   enabled: true, kicker: 'CAPÍTULO III', title: 'Jardim Secreto', subtitle: 'Flora em miniatura — esmeraldas, citrinos e rubis em folhagem.' },
        { id: 'noturno',  enabled: true, kicker: 'CAPÍTULO IV', title: 'Linha Noturno', subtitle: 'Ônix, ouro escurecido e diamantes negros — para vestir a meia-noite.' },
        { id: 'arquivo',  enabled: true, kicker: 'ARQUIVO', title: 'Peças Únicas', subtitle: 'Reedições limitadas do nosso acervo histórico.' },
      ],
    },
    categories: [
      { id: 'pingentes',  enabled: true, label: 'Pingentes',  kicker: 'CATEGORIA',
        title: 'Pingentes',
        subtitle: 'Peças que pendem como gotas — luz, peso, herança em ouro 18k.',
        emptyMsg: 'Nenhum pingente cadastrado nesta categoria ainda.',
        showEditorial: true },
      { id: 'aneis',      enabled: true, label: 'Anéis',      kicker: 'CATEGORIA',
        title: 'Anéis',
        subtitle: 'Solitários, alianças e anéis de signet — joias para a mão direita.',
        emptyMsg: 'Nenhum anel cadastrado nesta categoria ainda.',
        showEditorial: true },
      { id: 'brincos',    enabled: true, label: 'Brincos',    kicker: 'CATEGORIA',
        title: 'Brincos',
        subtitle: 'Da gota suspensa ao botão clássico — luz junto ao rosto.',
        emptyMsg: 'Nenhum brinco cadastrado nesta categoria ainda.',
        showEditorial: true },
      { id: 'pulseiras',  enabled: true, label: 'Pulseiras',  kicker: 'CATEGORIA',
        title: 'Pulseiras',
        subtitle: 'Braceletes, riviera e bracelete tênis — peso preciso no pulso.',
        emptyMsg: 'Nenhuma pulseira cadastrada nesta categoria ainda.',
        showEditorial: true },
      { id: 'correntes',  enabled: true, label: 'Correntes',  kicker: 'CATEGORIA',
        title: 'Correntes',
        subtitle: 'Elos veneziana, cordão e elo cubano — a base que sustenta um pingente.',
        emptyMsg: 'Nenhuma corrente cadastrada nesta categoria ainda.',
        showEditorial: true },
    ],
  };

  function loadPageSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return clone(DEFAULT_SETTINGS);
      const parsed = JSON.parse(raw);
      // Merge defensivo: se o usuário deletar um campo, voltamos ao default.
      return mergeDeep(clone(DEFAULT_SETTINGS), parsed);
    } catch (e) {
      console.warn('[pageSettings] falha ao carregar, usando default:', e);
      return clone(DEFAULT_SETTINGS);
    }
  }

  function savePageSettings(settings) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      // Notifica outras abas (catálogo aberto em paralelo)
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
      return true;
    } catch (e) {
      console.error('[pageSettings] falha ao salvar:', e);
      return false;
    }
  }

  function resetPageSettings() {
    localStorage.removeItem(STORAGE_KEY);
    return clone(DEFAULT_SETTINGS);
  }

  // Helpers
  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
  function mergeDeep(target, source) {
    if (!source || typeof source !== 'object') return target;
    for (const k of Object.keys(source)) {
      const sv = source[k];
      const tv = target[k];
      if (Array.isArray(sv)) {
        target[k] = sv;
      } else if (sv && typeof sv === 'object' && tv && typeof tv === 'object' && !Array.isArray(tv)) {
        target[k] = mergeDeep(tv, sv);
      } else {
        target[k] = sv;
      }
    }
    return target;
  }

  window.PageSettingsAPI = {
    loadPageSettings,
    savePageSettings,
    resetPageSettings,
    DEFAULT_SETTINGS,
    STORAGE_KEY,
  };
})();
