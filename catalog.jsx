// ============================================================
// CATÁLOGO ALTA JOALHERIA — componentes
// Paleta: #184036 / #f3eada / #ffffff
// ============================================================

const { useState, useEffect, useRef, useCallback, useMemo } = React;

// ─── Placeholder de joia ─────────────────────────────────────
function JewelPlaceholder({ label, tint = '#f3eada', dark = false, big = false, variant = 'a' }) {
  const bg = dark ? '#184036' : tint;
  const stripe = dark ? 'rgba(243,234,218,.08)' : 'rgba(24,64,54,.07)';
  const text = dark ? 'rgba(243,234,218,.55)' : 'rgba(24,64,54,.45)';
  const uid = `ph-${label}-${variant}-${dark ? 'd' : 'l'}`.replace(/\s+/g, '_');
  return (
    <div className="jewel-ph" style={{ background: bg }}>
      <svg className="jewel-ph-stripes" width="100%" height="100%" preserveAspectRatio="none"
           xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id={uid} width="14" height="14"
                   patternUnits="userSpaceOnUse"
                   patternTransform={variant === 'b' ? 'rotate(-45)' : variant === 'c' ? 'rotate(90)' : 'rotate(45)'}>
            <line x1="0" y1="0" x2="0" y2="14" stroke={stripe} strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${uid})`} />
      </svg>
      <div className="jewel-ph-label" style={{ color: text }}>
        <span className="jewel-ph-dot" style={{ background: text }} />
        <span>{label}{variant !== 'a' ? ` · ${variant}` : ''}</span>
      </div>
      {big && (
        <div className="jewel-ph-meta" style={{ color: text }}>
          inserir fotografia · {big}
        </div>
      )}
    </div>
  );
}

// ─── Joia 3D do hero ─────────────────────────────────────────
function HeroJewel({ intensity = 1, speed = 1 }) {
  const wrapRef = useRef(null);
  const innerRef = useRef(null);
  const [hover, setHover] = useState(false);
  const rot = useRef({ x: 0, y: 0 });
  const target = useRef({ x: 0, y: 0 });
  const autoRot = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const step = () => {
      rot.current.x += (target.current.x - rot.current.x) * 0.08;
      rot.current.y += (target.current.y - rot.current.y) * 0.08;
      autoRot.current += 0.25 * speed;
      const el = innerRef.current;
      if (el) {
        const auto = hover ? 0 : autoRot.current;
        el.style.transform = `rotateX(${rot.current.x}deg) rotateY(${rot.current.y + auto}deg)`;
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [hover, speed]);

  const onMove = (e) => {
    const r = wrapRef.current.getBoundingClientRect();
    const cx = (e.clientX - r.left) / r.width - 0.5;
    const cy = (e.clientY - r.top) / r.height - 0.5;
    target.current.y = cx * 35 * intensity;
    target.current.x = -cy * 25 * intensity;
  };
  const onLeave = () => { target.current = { x: 0, y: 0 }; setHover(false); };

  return (
    <div ref={wrapRef} className="hero-jewel-stage"
         onMouseMove={onMove} onMouseEnter={() => setHover(true)} onMouseLeave={onLeave}>
      <div ref={innerRef} className="hero-jewel-inner">
        <div className="hero-ring hero-ring-main">
          <div className="hero-ring-face hero-ring-front" />
          <div className="hero-ring-face hero-ring-back" />
          <div className="hero-ring-face hero-ring-inner" />
          <div className="hero-ring-gem" />
        </div>
      </div>
      <div className="hero-jewel-shadow" />
    </div>
  );
}

// ─── Vitrine grande com parallax 3D ──────────────────────────
function Vitrine({ collection, intensity = 1, children }) {
  const stageRef = useRef(null);
  const itemRef = useRef(null);
  const rot = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const target = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const rafRef = useRef(0);

  useEffect(() => {
    const tick = () => {
      rot.current.x += (target.current.x - rot.current.x) * 0.09;
      rot.current.y += (target.current.y - rot.current.y) * 0.09;
      rot.current.px += (target.current.px - rot.current.px) * 0.09;
      rot.current.py += (target.current.py - rot.current.py) * 0.09;
      const el = itemRef.current;
      if (el) {
        el.style.transform =
          `translate(${rot.current.px}px, ${rot.current.py}px) ` +
          `rotateX(${rot.current.x}deg) rotateY(${rot.current.y}deg)`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const onMove = (e) => {
    const r = stageRef.current.getBoundingClientRect();
    const cx = (e.clientX - r.left) / r.width - 0.5;
    const cy = (e.clientY - r.top) / r.height - 0.5;
    target.current.y = cx * 28 * intensity;
    target.current.x = -cy * 18 * intensity;
    target.current.px = cx * 20 * intensity;
    target.current.py = cy * 10 * intensity;
  };
  const onLeave = () => { target.current = { x: 0, y: 0, px: 0, py: 0 }; };

  return (
    <div ref={stageRef} className="vitrine-stage" onMouseMove={onMove} onMouseLeave={onLeave}>
      <div className="vitrine-light" />
      <div ref={itemRef} className="vitrine-item">{children}</div>
      <div className="vitrine-shadow" />
      <div className="vitrine-badge">
        <span className="vitrine-badge-kicker">COLEÇÃO</span>
        <span className="vitrine-badge-title">{collection}</span>
      </div>
    </div>
  );
}

// ─── Card de produto ─────────────────────────────────────────
function ProductCard({ product, intensity = 1, showPrices = true, onOpen }) {
  const cardRef = useRef(null);
  const imgRef = useRef(null);
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });
  const rafRef = useRef(0);

  useEffect(() => {
    const tick = () => {
      current.current.x += (target.current.x - current.current.x) * 0.12;
      current.current.y += (target.current.y - current.current.y) * 0.12;
      const el = imgRef.current;
      if (el) {
        el.style.transform =
          `rotateX(${current.current.x}deg) rotateY(${current.current.y}deg)`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const onMove = (e) => {
    const r = cardRef.current.getBoundingClientRect();
    const cx = (e.clientX - r.left) / r.width - 0.5;
    const cy = (e.clientY - r.top) / r.height - 0.5;
    target.current.y = cx * 22 * intensity;
    target.current.x = -cy * 16 * intensity;
  };
  const onLeave = () => { target.current = { x: 0, y: 0 }; };

  return (
    <article
      ref={cardRef}
      className="product-card"
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onClick={() => onOpen(product)}
      role="button"
      tabIndex={0}
    >
      <div className="product-img-stage">
        <div ref={imgRef} className="product-img-inner">
          {product.img
            ? <img src={product.img} alt={product.name} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
            : <JewelPlaceholder label={product.category} />
          }
        </div>
        <div className="product-glare" />
        <button className="product-fav" aria-label="Favoritar"
                onClick={(e) => e.stopPropagation()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 21s-7.5-4.6-9.6-9.1C.4 7.6 3.8 4 7.6 4c2 0 3.5 1.1 4.4 2.5C12.9 5.1 14.4 4 16.4 4c3.8 0 7.2 3.6 5.2 7.9C19.5 16.4 12 21 12 21z" />
          </svg>
        </button>
        {product._stock != null && product._stock <= 1 && (
          <div className="product-scarcity scarcity-last">Última peça</div>
        )}
        {product._stock != null && product._stock > 1 && product._stock <= 5 && (
          <div className="product-scarcity scarcity-limited">Edição limitada · {product._stock} peças</div>
        )}
        {product._isFromErp && (product._stock == null || product._stock > 5) && (
          <div className="product-scarcity scarcity-special">Edição comemorativa</div>
        )}
      </div>

      <div className="product-body">
        <div className="product-head">
          <h4 className="product-name">{product.name}</h4>
          <p className="product-desc">{product.desc}</p>
        </div>

        {showPrices && (
          <div className="product-price">
            {product.from > 0 && (
              <span className="price-row">
                <span className="price-lbl">Valor sugerido</span>
                <s className="price-old price-original">R$ {product.from.toLocaleString('pt-BR')}</s>
              </span>
            )}
            <span className="price-row price-now">
              <span className="price-lbl">Edição Mães</span>
              <strong>R$ {product.to.toLocaleString('pt-BR')}</strong>
            </span>
          </div>
        )}

        <button
          className="product-cta"
          onClick={(e) => { e.stopPropagation(); onOpen(product); }}
        >
          <span>Mais informações</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </article>
  );
}

// ─── Carrossel de produtos ───────────────────────────────────
function ProductCarousel({ products, intensity, showPrices, onOpen, columns = 4 }) {
  const trackRef = useRef(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const updateEdges = () => {
    const el = trackRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 2);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
  };

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    updateEdges();
    el.addEventListener('scroll', updateEdges, { passive: true });
    window.addEventListener('resize', updateEdges);
    return () => {
      el.removeEventListener('scroll', updateEdges);
      window.removeEventListener('resize', updateEdges);
    };
  }, [products.length]);

  const scroll = (dir) => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector('.carousel-item');
    const step = card ? card.offsetWidth + 24 : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * step * Math.max(1, columns - 1), behavior: 'smooth' });
  };

  return (
    <div className="carousel-wrap">
      <button
        className="carousel-arrow carousel-arrow-left"
        onClick={() => scroll(-1)}
        disabled={atStart}
        aria-label="Anterior"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>

      <div className="carousel-track" ref={trackRef} style={{ '--cols': columns }}>
        {products.map((p) => (
          <div key={p.ref} className="carousel-item">
            <ProductCard
              product={p}
              intensity={intensity}
              showPrices={showPrices}
              onOpen={onOpen}
            />
          </div>
        ))}
      </div>

      <button
        className="carousel-arrow carousel-arrow-right"
        onClick={() => scroll(1)}
        disabled={atEnd}
        aria-label="Próximo"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
    </div>
  );
}

// ─── Modal de detalhes do produto ────────────────────────────
function ProductDetail({ product, onClose, whatsNumber }) {
  const [gIdx, setGIdx] = useState(0);

  useEffect(() => {
    if (!product) return;
    setGIdx(0);
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setGIdx((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setGIdx((i) => Math.min(maxIdx, i + 1));
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [product]);

  if (!product) return null;

  const hasRealGallery = product.gallery && product.gallery.length > 0;
  const gallery = hasRealGallery ? product.gallery : ['a', 'b', 'c', 'd'];
  const maxIdx = gallery.length - 1;
  const specs = product.specs || {};
  const msg = `Olá! Tenho interesse na peça *${product.name}* (ref. ${product.ref}). Poderia me enviar mais informações?`;
  const waHref = `https://wa.me/${whatsNumber || ''}?text=${encodeURIComponent(msg)}`;

  return (
    <div className="pd-overlay" onClick={onClose}>
      <div className="pd-modal" onClick={(e) => e.stopPropagation()}>
        <button className="pd-close" onClick={onClose} aria-label="Fechar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <div className="pd-gallery">
          <div className="pd-main-img">
            {hasRealGallery
              ? <img src={gallery[gIdx]} alt={`${product.name} — vista ${gIdx + 1}`}
                     style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
              : <JewelPlaceholder label={product.category} big={`${product.name} · vista ${gIdx + 1}`} variant={gallery[gIdx]} />
            }
          </div>
          {gallery.length > 1 && (
          <div className="pd-thumbs">
            {gallery.map((v, i) => (
              <button
                key={hasRealGallery ? v : `thumb-${i}`}
                className={`pd-thumb ${i === gIdx ? 'active' : ''}`}
                onClick={() => setGIdx(i)}
              >
                {hasRealGallery
                  ? <img src={v} alt={`${product.name} ${i + 1}`}
                         style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
                  : <JewelPlaceholder label={product.category} variant={v} />
                }
              </button>
            ))}
          </div>
          )}
        </div>

        <div className="pd-info">
          <div className="pd-kicker">REF. {product.ref} · {product.collection}</div>
          <h2 className="pd-title">{product.name}</h2>

          <p className="pd-lead">
            {product.longDesc || `${product.desc}. Peça trabalhada à mão por nossos mestres joalheiros em nosso atelier, com acabamento artesanal que destaca a nobreza dos materiais empregados. Uma criação que celebra o encontro entre tradição e refinamento.`}
          </p>

          <div className="pd-price-block">
            {product.from > 0 && (
              <div className="pd-price-row">
                <span className="pd-price-lbl">Valor sugerido</span>
                <s className="pd-price-old price-original">R$ {product.from.toLocaleString('pt-BR')}</s>
              </div>
            )}
            <div className="pd-price-row pd-price-now">
              <span className="pd-price-lbl">Edição Mães</span>
              <strong>R$ {product.to.toLocaleString('pt-BR')}</strong>
            </div>
          </div>
          {product._stock != null && product._stock <= 3 && (
            <div className="pd-scarcity">
              {product._stock <= 1
                ? '⚠ Última peça disponível — oportunidade única'
                : `⚠ Apenas ${product._stock} peças disponíveis`}
            </div>
          )}

          <a className="pd-cta" href={waHref} target="_blank" rel="noopener">
            <span>Falar com uma de nossas consultoras</span>
            <svg width="18" height="10" viewBox="0 0 18 10" fill="none" stroke="currentColor" strokeWidth="1">
              <path d="M1 5 H16 M12 1 L16 5 L12 9" />
            </svg>
          </a>

          <section className="pd-block">
            <h3 className="pd-block-title">CARACTERÍSTICAS</h3>
            <p className="pd-block-sub">{product.desc}</p>

            <div className="pd-feat-grid">
              <div className="pd-feat">
                <dt>Tipo de produto</dt>
                <dd>{specs.categoria || product.category}</dd>
              </div>
              <div className="pd-feat">
                <dt>Metal</dt>
                <dd>{specs.metal || 'Ouro 18k'}</dd>
              </div>
              <div className="pd-feat">
                <dt>Pedras</dt>
                <dd>{specs.pedra || '—'}{specs.quilates ? ` · ${specs.quilates}` : ''}</dd>
              </div>
              <div className="pd-feat">
                <dt>Acabamento</dt>
                <dd>{specs.acabamento || 'Polido'}</dd>
              </div>
              <div className="pd-feat">
                <dt>Origem</dt>
                <dd>{specs.origem || 'Brasil'}</dd>
              </div>
            </div>
          </section>

          <section className="pd-block">
            <h3 className="pd-block-title">CUIDADOS E SERVIÇOS DIÁRIOS</h3>
            <div className="pd-care-lead">
              <strong>Cuidando de suas joias</strong>
              <p>
                Cuidar de sua criação ajudará a preservar sua beleza. Guarde em embalagem
                individual, evite contato com perfumes e produtos químicos, e conte com
                nosso atelier para limpeza periódica sem custo adicional.
              </p>
            </div>
            <button className="pd-discover">DESCUBRA MAIS</button>
          </section>
        </div>
      </div>
    </div>
  );
}

// ─── iJewel iframes por coleção (id da vitrine → URL do embed) ──
const VITRINE_IFRAMES = {
  noturno: 'https://ijewel.design/embedded?slug=75529cc&isTitle=false&isAutoplay=true&isTransparent=true',
};

// ─── Seção de coleção ────────────────────────────────────────
function Collection({ data, intensity, showPrices, columns, onOpen }) {
  const products = (data.products || []).map((p) => ({ ...p, collection: data.title }));
  const iframeSrc = VITRINE_IFRAMES[data.id];

  return (
    <section className="collection reveal">
      <header className="collection-header">
        <span className="collection-kicker">{data.kicker}</span>
        <h2 className="collection-title">{data.title}</h2>
        <p className="collection-sub">{data.subtitle || data.sub}</p>
      </header>

      {iframeSrc ? (
        <div className="vitrine-stage vitrine-has-iframe">
          <div className="vitrine-light" />
          <div className="vitrine-iframe-mask">
            <iframe
              src={iframeSrc}
              title={data.title}
              frameBorder="0"
              allow="autoplay; xr-spatial-tracking"
              scrolling="no"
            />
          </div>
          <div className="vitrine-badge">
            <span className="vitrine-badge-kicker">{data.kicker || 'COLEÇÃO'}</span>
            <span className="vitrine-badge-title">{data.title}</span>
          </div>
          <div className="vitrine-shadow" />
        </div>
      ) : (
        <Vitrine collection={data.title} intensity={intensity}>
          <div className="vitrine-placeholder">
            <JewelPlaceholder label={data.heroLabel || data.title} big="peça principal da coleção" />
          </div>
        </Vitrine>
      )}

      {products.length > 0 && (
        <ProductCarousel
          products={products}
          intensity={intensity}
          showPrices={showPrices}
          columns={columns}
          onOpen={onOpen}
        />
      )}
    </section>
  );
}

// ─── Dados mock ──────────────────────────────────────────────
const baseSpecs = {
  metal: 'Ouro amarelo 18k',
  peso: '4,2g',
  pedra: 'Diamante natural',
  quilates: '0,35 ct',
  acabamento: 'Polido espelhado',
  origem: 'Atelier próprio — São Paulo',
  garantia: '2 anos',
};

const COLLECTIONS = [
  {
    id: 'heranca', kicker: 'ATEMPORAL', title: 'Herança Imperial',
    sub: 'Peças que atravessam gerações', heroLabel: 'bracelete em destaque',
    products: [
      { ref: 'HI-001', name: 'Anel Solitário Imperial', category: 'anel',     desc: 'Ouro amarelo 18k com diamante central',    from: 18900, to: 15420, specs: { ...baseSpecs, categoria: 'Anel', quilates: '0,50 ct' } },
      { ref: 'HI-002', name: 'Corrente Veneziana',       category: 'corrente', desc: 'Elos trabalhados em ouro amarelo 18k',     from: 12400, to: 10560, specs: { ...baseSpecs, categoria: 'Corrente', peso: '6,8g', pedra: '—', quilates: '—' } },
      { ref: 'HI-003', name: 'Pingente Gota Clássica',    category: 'pingente', desc: 'Diamante lapidação pera com halo',         from:  9780, to:  8320, specs: { ...baseSpecs, categoria: 'Pingente', peso: '2,9g', quilates: '0,28 ct' } },
      { ref: 'HI-004', name: 'Aliança Eterna',           category: 'anel',     desc: 'Cravejada em diamantes VVS',                from: 14200, to: 12060, specs: { ...baseSpecs, categoria: 'Aliança', peso: '5,1g', quilates: '0,42 ct total' } },
      { ref: 'HI-005', name: 'Brincos Clássicos',        category: 'brinco',   desc: 'Par de brincos em ouro com diamante',       from: 11200, to:  9520, specs: { ...baseSpecs, categoria: 'Brinco', peso: '2,4g', quilates: '0,20 ct' } },
      { ref: 'HI-006', name: 'Pulseira Tradição',        category: 'pulseira', desc: 'Ouro amarelo 18k trabalhado à mão',         from: 16800, to: 14280, specs: { ...baseSpecs, categoria: 'Pulseira', peso: '9,6g', pedra: '—', quilates: '—' } },
    ],
  },
  {
    id: 'luz-aurora', kicker: 'SIGNATURE', title: 'Luz de Aurora',
    sub: 'Inspirada nas primeiras horas do dia', heroLabel: 'anel de destaque',
    products: [
      { ref: 'LA-001', name: 'Brincos Aurora',         category: 'brinco',   desc: 'Topázio imperial com ouro rosé 18k',        from: 11400, to:  9690, specs: { ...baseSpecs, metal: 'Ouro rosé 18k', pedra: 'Topázio imperial', quilates: '1,8 ct' } },
      { ref: 'LA-002', name: 'Pingente Sol Nascente',  category: 'pingente', desc: 'Citrino central em moldura cravejada',      from:  8900, to:  7565, specs: { ...baseSpecs, metal: 'Ouro rosé 18k', pedra: 'Citrino', quilates: '2,1 ct' } },
      { ref: 'LA-003', name: 'Pulseira Luminescente',  category: 'pulseira', desc: 'Fileira de diamantes em ouro rosé',         from: 22300, to: 18955, specs: { ...baseSpecs, metal: 'Ouro rosé 18k', quilates: '1,2 ct total' } },
      { ref: 'LA-004', name: 'Anel Raio Dourado',      category: 'anel',     desc: 'Ouro rosé com diamantes lapidação baguete', from: 13700, to: 11645, specs: { ...baseSpecs, metal: 'Ouro rosé 18k', quilates: '0,45 ct' } },
      { ref: 'LA-005', name: 'Corrente Sol',           category: 'corrente', desc: 'Elos finos com pingente em ouro rosé',      from:  9200, to:  7820, specs: { ...baseSpecs, metal: 'Ouro rosé 18k', pedra: '—' } },
      { ref: 'LA-006', name: 'Brinco Alvorecer',       category: 'brinco',   desc: 'Morganita com halo de diamantes',           from: 13400, to: 11390, specs: { ...baseSpecs, metal: 'Ouro rosé 18k', pedra: 'Morganita' } },
    ],
  },
  {
    id: 'jardim', kicker: 'BOTÂNICA', title: 'Jardim Secreto',
    sub: 'Delicadeza vegetal em metal precioso', heroLabel: 'pingente esmeralda',
    products: [
      { ref: 'JS-001', name: 'Colar Folha de Louro',   category: 'corrente', desc: 'Ouro 18k com esmeraldas cravejadas',        from: 16800, to: 14280, specs: { ...baseSpecs, pedra: 'Esmeralda', quilates: '0,8 ct' } },
      { ref: 'JS-002', name: 'Brincos Orquídea',       category: 'brinco',   desc: 'Pétalas em ouro branco e diamantes',        from: 19200, to: 16320, specs: { ...baseSpecs, metal: 'Ouro branco 18k', quilates: '0,72 ct' } },
      { ref: 'JS-003', name: 'Anel Botão de Rosa',     category: 'anel',     desc: 'Rubi central envolto em pétalas de ouro',   from: 15600, to: 13260, specs: { ...baseSpecs, pedra: 'Rubi', quilates: '0,9 ct' } },
      { ref: 'JS-004', name: 'Pulseira Trepadeira',    category: 'pulseira', desc: 'Elos florais em ouro rosé 18k',             from: 13400, to: 11390, specs: { ...baseSpecs, metal: 'Ouro rosé 18k', pedra: '—' } },
      { ref: 'JS-005', name: 'Pingente Margarida',     category: 'pingente', desc: 'Flor em ouro com safira central',           from: 10800, to:  9180, specs: { ...baseSpecs, pedra: 'Safira amarela' } },
      { ref: 'JS-006', name: 'Anel Samambaia',         category: 'anel',     desc: 'Curvas orgânicas com diamantes',            from: 14900, to: 12665, specs: { ...baseSpecs, metal: 'Ouro branco 18k' } },
    ],
  },
  {
    id: 'constelacao', kicker: 'CELESTE', title: 'Constelação',
    sub: 'Diamantes dispostos como estrelas', heroLabel: 'colar estelar',
    products: [
      { ref: 'CO-001', name: 'Colar Via Láctea',       category: 'corrente', desc: 'Diamantes em degradé com ouro branco',      from: 28400, to: 24140, specs: { ...baseSpecs, metal: 'Ouro branco 18k', quilates: '1,8 ct total' } },
      { ref: 'CO-002', name: 'Brincos Estrela Dupla',  category: 'brinco',   desc: 'Ouro branco com safiras azul estrelada',    from: 17800, to: 15130, specs: { ...baseSpecs, metal: 'Ouro branco 18k', pedra: 'Safira azul' } },
      { ref: 'CO-003', name: 'Anel Pleiades',          category: 'anel',     desc: 'Sete diamantes em disposição estelar',      from: 21600, to: 18360, specs: { ...baseSpecs, metal: 'Ouro branco 18k', quilates: '0,98 ct total' } },
      { ref: 'CO-004', name: 'Pingente Cruzeiro',      category: 'pingente', desc: 'Composição em ouro branco e diamantes',     from: 14200, to: 12070, specs: { ...baseSpecs, metal: 'Ouro branco 18k' } },
      { ref: 'CO-005', name: 'Pulseira Órion',         category: 'pulseira', desc: 'Três diamantes principais alinhados',       from: 18600, to: 15810, specs: { ...baseSpecs, metal: 'Ouro branco 18k', quilates: '1,1 ct' } },
      { ref: 'CO-006', name: 'Brinco Meteoro',         category: 'brinco',   desc: 'Queda de diamantes em degradé',             from: 16400, to: 13940, specs: { ...baseSpecs, metal: 'Ouro branco 18k' } },
    ],
  },
  {
    id: 'noite', kicker: 'EDIÇÃO LIMITADA', title: 'Noite de Gala',
    sub: 'Para momentos inesquecíveis', heroLabel: 'anel de gala',
    products: [
      { ref: 'NG-001', name: 'Colar Rivière',          category: 'corrente', desc: 'Linha contínua de diamantes redondos',      from: 42800, to: 36380, specs: { ...baseSpecs, metal: 'Ouro branco 18k', quilates: '3,5 ct total' } },
      { ref: 'NG-002', name: 'Brincos Candelabro',     category: 'brinco',   desc: 'Cascata em ouro branco e diamantes',        from: 34600, to: 29410, specs: { ...baseSpecs, metal: 'Ouro branco 18k', quilates: '1,9 ct total' } },
      { ref: 'NG-003', name: 'Anel Cocktail Onyx',     category: 'anel',     desc: 'Ônix central em moldura cravejada',         from: 19800, to: 16830, specs: { ...baseSpecs, pedra: 'Ônix', quilates: '4,2 ct' } },
      { ref: 'NG-004', name: 'Pulseira Gala',          category: 'pulseira', desc: 'Elos duplos em ouro branco 18k',            from: 26700, to: 22695, specs: { ...baseSpecs, metal: 'Ouro branco 18k' } },
      { ref: 'NG-005', name: 'Tiara Baile',            category: 'pingente', desc: 'Diadema delicado com diamantes',            from: 58400, to: 49640, specs: { ...baseSpecs, metal: 'Ouro branco 18k', quilates: '5,2 ct total' } },
      { ref: 'NG-006', name: 'Anel Coquetel Safira',   category: 'anel',     desc: 'Safira central com halo de diamantes',      from: 32400, to: 27540, specs: { ...baseSpecs, metal: 'Ouro branco 18k', pedra: 'Safira azul', quilates: '3,1 ct' } },
    ],
  },
];

window.CatalogComponents = {
  JewelPlaceholder, HeroJewel, Vitrine, ProductCard, ProductCarousel,
  ProductDetail, Collection, COLLECTIONS,
};
