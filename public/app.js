/* =========================================================================
   Shoukhin storefront
   Vanilla ES module. No framework, no web fonts, one catalogue request.
   ========================================================================= */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ----------------------------------------------------------------- helpers */
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const taka = (n) => `৳${Math.round(Number(n) || 0).toLocaleString('en-US')}`;

const priceOf = (p) => (p.discount_price != null && p.discount_price > 0 ? p.discount_price : p.price);
const discountPct = (p) =>
  p.discount_price != null && p.discount_price > 0 && p.price > 0
    ? Math.round(((p.price - p.discount_price) / p.price) * 100)
    : 0;

const imgOf = (p, i = 0) => p.images?.[i] || p.images?.[0] || '/assets/texture/fabric-1.webp';
const smallImg = (src) => (src.includes('/products/') ? src.replace('.webp', '-sm.webp') : src);

function debounce(fn, ms = 220) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ------------------------------------------------------------------ storage */
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
  },
};

/* ---------------------------------------------------------------- app state */
const state = {
  products: [],
  categories: [],
  settings: {},
  cart: store.get('shk_cart', []),
  wishlist: store.get('shk_wish', []),
  coupon: null,
  loaded: false,
};

const bySlug = (slug) => state.products.find((p) => p.slug === slug || p.id === slug);
const catBySlug = (slug) => state.categories.find((c) => c.slug === slug || c.id === slug);
const topCategories = () => state.categories.filter((c) => !c.parent_id);
const childrenOf = (id) => state.categories.filter((c) => c.parent_id === id);

// Every descendant category id, so "Three Piece" also shows its sub-categories.
function categoryTree(id) {
  const out = [id];
  for (const c of state.categories.filter((x) => x.parent_id === id)) out.push(...categoryTree(c.id));
  return out;
}

/* --------------------------------------------------------------- api client */
async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'content-type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok || data.ok === false) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/* ------------------------------------------------------------------- toasts */
const ICON = {
  good: '<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>',
  bad: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
};

function toast(message, kind = 'info') {
  const host = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `${ICON[kind] || ICON.info}<span>${esc(message)}</span>`;
  host.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, 2800);
}

/* -------------------------------------------------------------- cart basics */
function cartKey(item) { return `${item.product_id}|${item.size || ''}|${item.color || ''}`; }

function cartTotals() {
  let subtotal = 0, count = 0;
  for (const line of state.cart) {
    const p = state.products.find((x) => x.id === line.product_id);
    if (!p) continue;
    subtotal += priceOf(p) * line.quantity;
    count += line.quantity;
  }
  return { subtotal, count };
}

function saveCart() {
  store.set('shk_cart', state.cart);
  paintCart();
}

function addToCart(productId, { size = null, color = null, quantity = 1, quiet = false } = {}) {
  const p = state.products.find((x) => x.id === productId);
  if (!p) return;
  if (p.stock <= 0) { toast('That piece is sold out', 'bad'); return; }

  const line = { product_id: productId, size, color, quantity };
  const existing = state.cart.find((l) => cartKey(l) === cartKey(line));
  const already = existing ? existing.quantity : 0;
  if (already + quantity > p.stock) { toast(`Only ${p.stock} left in stock`, 'bad'); return; }

  if (existing) existing.quantity += quantity;
  else state.cart.push(line);

  saveCart();
  if (!quiet) { toast(`${p.title} added to your bag`, 'good'); openDrawer('#cartDrawer'); }
}

function setQty(key, delta) {
  const line = state.cart.find((l) => cartKey(l) === key);
  if (!line) return;
  const p = state.products.find((x) => x.id === line.product_id);
  const next = line.quantity + delta;
  if (next < 1) { state.cart = state.cart.filter((l) => cartKey(l) !== key); }
  else if (p && next > p.stock) { toast(`Only ${p.stock} left in stock`, 'bad'); return; }
  else line.quantity = next;
  saveCart();
  if (location.pathname === '/cart' || location.pathname === '/checkout') render();
}

function removeLine(key) {
  state.cart = state.cart.filter((l) => cartKey(l) !== key);
  saveCart();
  if (location.pathname === '/cart' || location.pathname === '/checkout') render();
}

/* ----------------------------------------------------------------- wishlist */
function toggleWish(id) {
  const i = state.wishlist.indexOf(id);
  if (i >= 0) { state.wishlist.splice(i, 1); toast('Removed from saved'); }
  else { state.wishlist.push(id); toast('Saved for later', 'good'); }
  store.set('shk_wish', state.wishlist);
  paintPips();
  $$(`.card-fav[data-wish="${id}"]`).forEach((b) => b.classList.toggle('on', state.wishlist.includes(id)));
}

/* ------------------------------------------------------------------ pips/ui */
function paintPips() {
  const { count } = cartTotals();
  for (const id of ['#cartPip', '#cartPip2']) {
    const el = $(id); if (!el) continue;
    el.textContent = count; el.hidden = count === 0;
  }
  for (const id of ['#wishPip', '#wishPip2']) {
    const el = $(id); if (!el) continue;
    el.textContent = state.wishlist.length; el.hidden = state.wishlist.length === 0;
  }
}

function paintCart() {
  paintPips();
  const body = $('#cartBody'), foot = $('#cartFoot');
  const { subtotal, count } = cartTotals();
  $('#cartCount').textContent = `(${count})`;

  if (!state.cart.length) {
    body.innerHTML = `<div class="empty">
      <svg viewBox="0 0 24 24"><path d="M6 7h12l-1 13H7L6 7z"/><path d="M9 7V5.5a3 3 0 0 1 6 0V7"/></svg>
      <p>Your bag is empty.</p>
      <a class="btn btn-primary" href="/shop" data-link>Start shopping</a></div>`;
    foot.hidden = true;
    return;
  }

  body.innerHTML = state.cart.map((line, i) => {
    const p = state.products.find((x) => x.id === line.product_id);
    if (!p) return '';
    const key = cartKey(line);
    return `<div class="cart-line">
      <img src="${esc(smallImg(imgOf(p)))}" alt="${esc(p.title)}" width="72" height="90" loading="lazy">
      <div class="meta">
        <b>${esc(p.title)}</b>
        <span>${[line.size, line.color].filter(Boolean).map(esc).join(' · ') || 'One size'}</span>
        <span class="ln-price">${taka(priceOf(p) * line.quantity)}</span>
        <div class="qty">
          <button data-qty="${esc(key)}" data-delta="-1" aria-label="Decrease">−</button>
          <b>${line.quantity}</b>
          <button data-qty="${esc(key)}" data-delta="1" aria-label="Increase">+</button>
        </div>
      </div>
      <button class="ln-remove" data-remove="${esc(key)}">Remove</button>
    </div>`;
  }).join('');
  // Stagger without inline styles (CSP blocks style attributes).
  $$('.cart-line', body).forEach((el, i) => el.style.setProperty('animation-delay', `${i * 45}ms`));

  $('#cartSubtotal').textContent = taka(subtotal);
  const threshold = Number(state.settings.free_delivery_threshold || 0);
  const bar = $('#shipBar');
  if (threshold > 0 && subtotal < threshold) {
    const pct = Math.min(100, (subtotal / threshold) * 100);
    bar.innerHTML = `Add <b>${taka(threshold - subtotal)}</b> more for free delivery
      <span class="track"><i></i></span>`;
    bar.querySelector('i').style.width = `${pct}%`;
  } else if (threshold > 0) {
    bar.innerHTML = '<span class="free-ship">✓ You have free delivery</span>';
  } else bar.innerHTML = '';
  foot.hidden = false;
}

/* ========================================================== product card */
function productCard(p, opts = {}) {
  const off = discountPct(p);
  const out = p.stock <= 0;
  const saved = state.wishlist.includes(p.id);
  const main = imgOf(p, 0), alt = imgOf(p, 1);
  const badges = [];
  if (off > 0) badges.push(`<span class="badge sale">-${off}%</span>`);
  if (p.tag) badges.push(`<span class="badge ${/new/i.test(p.tag) ? 'new' : 'soft'}">${esc(p.tag)}</span>`);

  const lowStock = p.stock > 0 && p.stock <= 6;
  return `<article class="card ${out ? 'out' : ''} reveal" data-d="${(opts.index || 0) % 5}">
    <a class="card-media" href="/product/${esc(p.slug)}" data-link aria-label="${esc(p.title)}">
      <img src="${esc(smallImg(main))}" alt="${esc(p.title)}" width="500" height="621" loading="${opts.eager ? 'eager' : 'lazy'}" decoding="async">
      ${alt !== main ? `<img class="alt" src="${esc(smallImg(alt))}" alt="" width="500" height="621" loading="lazy" decoding="async" aria-hidden="true">` : ''}
      ${out ? '<span class="sold-out"><span>Sold out</span></span>' : ''}
    </a>
    <div class="badges">${badges.join('')}</div>
    <button class="card-fav ${saved ? 'on' : ''}" data-wish="${esc(p.id)}" aria-label="Save ${esc(p.title)}">
      <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.6-7-9.3A4 4 0 0 1 12 8a4 4 0 0 1 7-.7c0 4.7-7 12.7-7 12.7z"/></svg>
    </button>
    ${out ? '' : `<div class="card-quick">
      <button class="btn btn-primary" data-add="${esc(p.id)}">Add to bag</button>
      <button class="btn btn-ghost" data-quick="${esc(p.id)}" aria-label="Quick view">View</button>
    </div>`}
    <div class="card-body">
      <span class="card-cat">${esc(p.category_name || '')}</span>
      <a class="card-title" href="/product/${esc(p.slug)}" data-link>${esc(p.title)}</a>
      <div class="price">
        <b>${taka(priceOf(p))}</b>
        ${off > 0 ? `<del>${taka(p.price)}</del><span class="off">Save ${taka(p.price - p.discount_price)}</span>` : ''}
      </div>
      ${lowStock ? `<div class="stock-line"><i data-w="${Math.max(8, (p.stock / 20) * 100)}"></i></div>
        <p class="stock-txt">Only ${p.stock} left</p>` : ''}
    </div>
  </article>`;
}

function paintStockBars(root = document) {
  $$('.stock-line i[data-w]', root).forEach((i) => {
    i.style.width = `${Math.min(100, Number(i.dataset.w))}%`;
  });
}

const cardGrid = (list, opts = {}) =>
  `<div class="p-grid ${opts.cols3 ? 'cols-3' : ''}">${list.map((p, i) => productCard(p, { index: i, eager: i < 4 && opts.eager })).join('')}</div>`;

const skeletonGrid = (n = 8) =>
  `<div class="p-grid">${Array.from({ length: n }, () =>
    '<div><div class="sk sk-card"></div><div class="sk sk-line w60"></div><div class="sk sk-line w40"></div></div>').join('')}</div>`;

/* ============================================================== overlays */
function lock(on) { document.body.classList.toggle('locked', on); }

function openDrawer(sel) {
  const d = $(sel); if (!d) return;
  $$('.drawer').forEach((x) => { if (x !== d) { x.classList.remove('open'); x.setAttribute('aria-hidden', 'true'); } });
  d.classList.add('open'); d.setAttribute('aria-hidden', 'false');
  const scrim = $('#scrim'); scrim.hidden = false;
  requestAnimationFrame(() => scrim.classList.add('on'));
  lock(true);
  d.querySelector('button, a, input')?.focus({ preventScroll: true });
}

function closeOverlays() {
  $$('.drawer').forEach((d) => { d.classList.remove('open'); d.setAttribute('aria-hidden', 'true'); });
  $('#searchOverlay').classList.remove('open');
  $('#searchOverlay').setAttribute('aria-hidden', 'true');
  $('#modal').classList.remove('open');
  $('#modal').setAttribute('aria-hidden', 'true');
  $('#burger').setAttribute('aria-expanded', 'false');
  $('#navMega')?.classList.remove('open');
  const scrim = $('#scrim');
  scrim.classList.remove('on');
  setTimeout(() => { scrim.hidden = true; }, 300);
  lock(false);
}

function openModal(title, html) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = html;
  const m = $('#modal');
  m.classList.add('open'); m.setAttribute('aria-hidden', 'false');
  lock(true);
  m.querySelector('button')?.focus({ preventScroll: true });
}

function openSearch() {
  const o = $('#searchOverlay');
  o.classList.add('open'); o.setAttribute('aria-hidden', 'false');
  lock(true);
  renderSearch('');
  setTimeout(() => $('#searchInput').focus(), 60);
}

/* --------------------------------------------------------------- search */
function searchProducts(q) {
  const term = q.trim().toLowerCase();
  if (!term) return [];
  return state.products
    .filter((p) =>
      p.title.toLowerCase().includes(term) ||
      (p.category_name || '').toLowerCase().includes(term) ||
      (p.fabric || '').toLowerCase().includes(term) ||
      (p.tag || '').toLowerCase().includes(term))
    .slice(0, 8);
}

function renderSearch(q) {
  const box = $('#searchResults');
  const hits = searchProducts(q);
  if (!q.trim()) {
    const picks = topCategories().slice(0, 6);
    box.innerHTML = `<p class="sr-hint">Popular right now</p>
      <div class="sr-chips">${picks.map((c) => `<button data-search-chip="${esc(c.name)}">${esc(c.name)}</button>`).join('')}</div>`;
    return;
  }
  if (!hits.length) { box.innerHTML = `<p class="sr-hint">Nothing matched “${esc(q)}”. Try a category name.</p>`; return; }
  box.innerHTML = hits.map((p) => `<a class="sr-item" href="/product/${esc(p.slug)}" data-link>
      <img src="${esc(smallImg(imgOf(p)))}" alt="" width="54" height="66" loading="lazy">
      <div><b>${esc(p.title)}</b><span>${esc(p.category_name || '')}</span></div>
      <b>${taka(priceOf(p))}</b>
    </a>`).join('');
}

/* ----------------------------------------------------------- quick view */
function quickView(id) {
  const p = state.products.find((x) => x.id === id);
  if (!p) return;
  const off = discountPct(p);
  openModal(p.title, `
    <div class="qv">
      <img src="${esc(imgOf(p))}" alt="${esc(p.title)}" width="900" height="1117" loading="lazy">
      <div>
        <span class="pdp-cat">${esc(p.category_name || '')}</span>
        <div class="pdp-price"><b>${taka(priceOf(p))}</b>
          ${off ? `<del>${taka(p.price)}</del><span class="off">-${off}%</span>` : ''}</div>
        <p class="pdp-short">${esc(p.short_description || '')}</p>
        ${p.sizes.length ? `<div class="opt-group"><div class="opt-head"><h4>Size</h4></div>
          <div class="swatches" data-qv-sizes>${p.sizes.map((s, i) =>
            `<button class="sw-size ${i === 0 ? 'on' : ''}" data-size="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>` : ''}
        <div class="pdp-actions">
          <button class="btn btn-primary" data-qv-add="${esc(p.id)}">Add to bag</button>
          <a class="btn btn-ghost" href="/product/${esc(p.slug)}" data-link>Full details</a>
        </div>
      </div>
    </div>`);
}

/* ------------------------------------------------------- hero + countdown */
let heroTimer = null;
function initHero(root) {
  const slides = $$('.hero-slide', root);
  const dots = $$('.hero-dots button', root);
  if (slides.length < 2) return;
  let i = 0;
  const go = (n) => {
    i = (n + slides.length) % slides.length;
    slides.forEach((s, x) => s.classList.toggle('on', x === i));
    dots.forEach((d, x) => d.classList.toggle('on', x === i));
  };
  dots.forEach((d, x) => d.addEventListener('click', () => { go(x); restart(); }));
  const restart = () => {
    clearInterval(heroTimer);
    if (!REDUCED) heroTimer = setInterval(() => go(i + 1), 6000);
  };
  restart();
}

let cdTimer = null;
function initCountdown(root) {
  const box = $('[data-countdown]', root);
  if (!box) return;
  const end = new Date(box.dataset.countdown).getTime();
  const units = [['d', 86400000], ['h', 3600000], ['m', 60000], ['s', 1000]];
  const last = {};
  const tick = () => {
    let left = end - Date.now();
    if (left <= 0) { box.innerHTML = '<div class="cd-box"><b>0</b><span>Ended</span></div>'; clearInterval(cdTimer); return; }
    box.innerHTML = units.map(([k, ms]) => {
      const v = Math.floor(left / ms); left -= v * ms;
      const changed = last[k] !== undefined && last[k] !== v;
      last[k] = v;
      return `<div class="cd-box ${changed ? 'tick' : ''}"><b>${String(v).padStart(2, '0')}</b><span>${
        { d: 'Days', h: 'Hrs', m: 'Min', s: 'Sec' }[k]}</span></div>`;
    }).join('');
  };
  tick();
  clearInterval(cdTimer);
  cdTimer = setInterval(tick, 1000);
}

/* --------------------------------------------------------- scroll reveal */
let revealObserver = null;
function initReveal(root = document) {
  if (REDUCED) { $$('.reveal', root).forEach((e) => e.classList.add('in')); return; }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add('in'); revealObserver.unobserve(e.target); }
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  }
  $$('.reveal:not(.in)', root).forEach((e) => revealObserver.observe(e));
}

/* ------------------------------------------------------------------ rails */
function initRails(root) {
  $$('.rail-wrap', root).forEach((wrap) => {
    const rail = $('.rail', wrap);
    const prev = $('.rail-btn.prev', wrap), next = $('.rail-btn.next', wrap);
    if (!rail || !prev) return;
    const step = () => rail.clientWidth * 0.8;
    prev.addEventListener('click', () => rail.scrollBy({ left: -step(), behavior: REDUCED ? 'auto' : 'smooth' }));
    next.addEventListener('click', () => rail.scrollBy({ left: step(), behavior: REDUCED ? 'auto' : 'smooth' }));
    const sync = () => {
      prev.disabled = rail.scrollLeft < 8;
      next.disabled = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 8;
    };
    rail.addEventListener('scroll', sync, { passive: true });
    sync();
    // Rail items live off-screen horizontally, where the reveal observer never
    // fires. Show them with the rail itself instead of leaving them invisible.
    $$('.reveal', rail).forEach((e) => e.classList.add('in'));
  });
}

/* ========================================================================
   Pages
   ======================================================================== */

const HERO = [
  { img: 'hero-1', eyebrow: 'New season', h: 'Cotton that keeps up with your day',
    p: 'Handloom three piece sets cut for Dhaka heat, finished with hand embroidery.', cta: '/shop?filter=new', ctaText: 'Shop new in' },
  { img: 'hero-2', eyebrow: 'Flash sale', h: 'Up to 50% off this week',
    p: 'A short run of our best selling sets and kurtis, while the sizes last.', cta: '/shop?filter=flash', ctaText: 'See the sale' },
  { img: 'hero-3', eyebrow: 'Handloom', h: 'Jamdani, woven the long way',
    p: 'Woven on traditional looms in Bangladesh. No two pieces fall quite the same.', cta: '/category/saree', ctaText: 'Shop sarees' },
  { img: 'hero-4', eyebrow: 'Everyday', h: 'Thoughtfully yours',
    p: 'Pieces you reach for on a working morning, not just for the big occasions.', cta: '/shop', ctaText: 'Shop everything' },
];

const TRUST = [
  ['M5 7h9v8H5zM14 10h3l2 3v2h-5z', 'Cash on delivery', 'Pay when it reaches your hand'],
  ['M12 3l8 4v5c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V7z', 'Secure payment', 'bKash, Nagad, Rocket & COD'],
  ['M3 12a9 9 0 1 0 3-6.7M3 4v4h4', '7 day returns', 'Exchange or return, no fuss'],
  ['M4 5h16v11H7l-3 3z', '24/7 support', 'WhatsApp, Messenger or call'],
];

const QUOTES = [
  ['Rukhsana A.', 'Dhanmondi, Dhaka', 'The cotton is genuinely soft, not the stiff kind. Wore the three piece through a whole office day in May and it held up.'],
  ['Tanzila H.', 'Chattogram', 'Ordered Thursday, got it Saturday outside Dhaka. The dupatta colour matched the photos exactly, which almost never happens.'],
  ['Sumaiya K.', 'Sylhet', 'Asked for a size exchange on WhatsApp and they sorted it in a day. That is why I ordered again.'],
];

function heroSection() {
  return `<section class="hero">
    ${HERO.map((s, i) => `<div class="hero-slide ${i === 0 ? 'on' : ''}">
      <picture>
        <source media="(max-width:900px)" srcset="/assets/hero/${s.img}-sm.webp">
        <img src="/assets/hero/${s.img}.webp" alt="" width="2000" height="1125"
             loading="${i === 0 ? 'eager' : 'lazy'}" fetchpriority="${i === 0 ? 'high' : 'auto'}" decoding="async">
      </picture>
      <div class="hero-in wrap"><div class="hero-copy">
        <span class="eyebrow">${esc(s.eyebrow)}</span>
        <h1>${esc(s.h)}</h1>
        <p>${esc(s.p)}</p>
        <div class="hero-cta">
          <a class="btn btn-primary" href="${esc(s.cta)}" data-link>${esc(s.ctaText)}</a>
          <a class="btn btn-ghost" href="/page/about" data-link>Our story</a>
        </div>
      </div></div>
    </div>`).join('')}
    <div class="hero-dots">${HERO.map((_, i) =>
      `<button class="${i === 0 ? 'on' : ''}" aria-label="Slide ${i + 1}"></button>`).join('')}</div>
  </section>`;
}

function homePage() {
  const flash = state.products.filter((p) => p.is_flash_sale && p.stock > 0).slice(0, 10);
  const fresh = [...state.products].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 8);
  const best = state.products.filter((p) => p.is_featured).slice(0, 10);
  const cats = topCategories();
  const flashEnd = flash.find((p) => p.flash_sale_ends_at)?.flash_sale_ends_at;

  return `${heroSection()}

  <section class="trust">
    ${TRUST.map(([d, t, s]) => `<div class="trust-item">
      <svg viewBox="0 0 24 24"><path d="${d}"/></svg>
      <div><strong>${esc(t)}</strong><span>${esc(s)}</span></div></div>`).join('')}
  </section>

  <section class="sec">
    <div class="wrap">
      <div class="sec-head reveal">
        <div><span class="eyebrow">Browse</span><h2>Shop by category</h2>
          <p>From everyday cotton to the pieces you keep for a wedding.</p></div>
        <a class="sec-link" href="/shop" data-link>View all <span aria-hidden="true">→</span></a>
      </div>
      <div class="cat-grid">
        ${cats.map((c, i) => `<a class="cat-card reveal" data-d="${i % 5}" href="/category/${esc(c.slug)}" data-link>
          <img src="${esc(c.image || '/assets/texture/fabric-1.webp')}" alt="${esc(c.name)}" width="700" height="869" loading="lazy" decoding="async">
          <div class="cat-card-txt">
            <strong>${esc(c.name)}</strong>
            ${c.name_bn ? `<span class="bn">${esc(c.name_bn)}</span>` : ''}
            <span>${countIn(c.id)} pieces</span>
          </div></a>`).join('')}
      </div>
    </div>
  </section>

  ${flash.length ? `<section class="sec flash">
    <div class="wrap">
      <div class="sec-head reveal">
        <div><span class="eyebrow">Limited time</span><h2>Flash sale</h2>
          <p>Marked down while stock lasts. Sizes go first.</p></div>
        ${flashEnd ? `<div class="countdown" data-countdown="${esc(flashEnd)}"></div>` : ''}
      </div>
      <div class="rail-wrap">
        <button class="rail-btn prev" aria-label="Scroll left">‹</button>
        <div class="rail">${flash.map((p, i) => productCard(p, { index: i })).join('')}</div>
        <button class="rail-btn next" aria-label="Scroll right">›</button>
      </div>
    </div>
  </section>` : ''}

  <section class="sec">
    <div class="wrap">
      <div class="sec-head reveal">
        <div><span class="eyebrow">Just landed</span><h2>New arrivals</h2></div>
        <a class="sec-link" href="/shop?sort=new" data-link>See everything <span aria-hidden="true">→</span></a>
      </div>
      ${cardGrid(fresh)}
    </div>
  </section>

  <section class="sec sec-cream">
    <div class="wrap story">
      <div class="story-img reveal">
        <img src="/assets/texture/detail-1.webp" alt="Hand embroidery detail" width="800" height="800" loading="lazy" decoding="async">
      </div>
      <div class="reveal" data-d="1">
        <span class="eyebrow">Our story</span>
        <h2>Made close to home</h2>
        <p class="muted story-lead">We work with small units in and around Dhaka, in cotton and handloom that suits the weather here rather than a catalogue somewhere else. Every piece is checked by hand before it is packed.</p>
        <div class="story-stats">
          <div><b>${state.products.length}+</b><span>Pieces in store</span></div>
          <div><b>64</b><span>Districts delivered</span></div>
          <div><b>7 day</b><span>Return window</span></div>
        </div>
        <p class="story-cta"><a class="btn btn-primary" href="/page/about" data-link>Read our story</a></p>
      </div>
    </div>
  </section>

  ${best.length ? `<section class="sec">
    <div class="wrap">
      <div class="sec-head reveal">
        <div><span class="eyebrow">Loved most</span><h2>Best sellers</h2></div>
        <a class="sec-link" href="/shop?sort=popular" data-link>Shop best sellers <span aria-hidden="true">→</span></a>
      </div>
      <div class="rail-wrap">
        <button class="rail-btn prev" aria-label="Scroll left">‹</button>
        <div class="rail">${best.map((p, i) => productCard(p, { index: i })).join('')}</div>
        <button class="rail-btn next" aria-label="Scroll right">›</button>
      </div>
    </div>
  </section>` : ''}

  <section class="sec sec-alt">
    <div class="wrap">
      <div class="sec-head reveal"><div><span class="eyebrow">Reviews</span><h2>What customers say</h2></div></div>
      <div class="quotes">
        ${QUOTES.map(([n, loc, q], i) => `<figure class="quote reveal" data-d="${i}">
          <div class="stars" aria-label="5 out of 5">★★★★★</div>
          <p>${esc(q)}</p>
          <footer><span class="avatar">${esc(n[0])}</span><div><b>${esc(n)}</b><span>${esc(loc)}</span></div></footer>
        </figure>`).join('')}
      </div>
    </div>
  </section>`;
}

function countIn(catId) {
  const ids = categoryTree(catId);
  return state.products.filter((p) => ids.includes(p.category_id)).length;
}

/* ------------------------------------------------------------- shop page */
function shopPage(params) {
  const catSlug = params.category;
  const cat = catSlug ? catBySlug(catSlug) : null;
  const ids = cat ? categoryTree(cat.id) : null;
  const q = (params.q || '').toLowerCase();

  let list = state.products.slice();
  if (ids) list = list.filter((p) => ids.includes(p.category_id));
  if (q) list = list.filter((p) => p.title.toLowerCase().includes(q) || (p.category_name || '').toLowerCase().includes(q));
  if (params.filter === 'flash') list = list.filter((p) => p.is_flash_sale);
  if (params.filter === 'new') list = list.filter((p) => /new/i.test(p.tag || ''));
  if (params.size) list = list.filter((p) => p.sizes.includes(params.size));
  if (params.min) list = list.filter((p) => priceOf(p) >= Number(params.min));
  if (params.max) list = list.filter((p) => priceOf(p) <= Number(params.max));
  if (params.instock === '1') list = list.filter((p) => p.stock > 0);

  const sort = params.sort || 'featured';
  const sorters = {
    featured: (a, b) => (b.is_featured - a.is_featured) || a.sort_order - b.sort_order,
    new: (a, b) => String(b.created_at).localeCompare(String(a.created_at)),
    popular: (a, b) => (b.sold || 0) - (a.sold || 0),
    'price-asc': (a, b) => priceOf(a) - priceOf(b),
    'price-desc': (a, b) => priceOf(b) - priceOf(a),
    discount: (a, b) => discountPct(b) - discountPct(a),
  };
  list.sort(sorters[sort] || sorters.featured);

  const allSizes = [...new Set(state.products.flatMap((p) => p.sizes))];
  const title = cat ? cat.name : params.filter === 'flash' ? 'Flash sale' : q ? `Results for “${params.q}”` : 'All pieces';

  const activeChips = [];
  if (cat) activeChips.push(['category', cat.name]);
  if (params.size) activeChips.push(['size', `Size ${params.size}`]);
  if (params.filter) activeChips.push(['filter', params.filter === 'flash' ? 'On sale' : 'New in']);
  if (params.instock === '1') activeChips.push(['instock', 'In stock']);
  if (params.min || params.max) activeChips.push(['price', `${taka(params.min || 0)} – ${taka(params.max || 99999)}`]);

  return `<div class="wrap">
    <nav class="crumb"><a href="/" data-link>Home</a><span>/</span>
      ${cat ? `<a href="/shop" data-link>Shop</a><span>/</span><span>${esc(cat.name)}</span>` : '<span>Shop</span>'}
    </nav>
    <header class="page-head">
      <h1>${esc(title)}</h1>
      ${cat?.name_bn ? `<p class="bn">${esc(cat.name_bn)}</p>` : ''}
    </header>

    <div class="shop-layout">
      <aside class="filters">
        <div class="filter-group">
          <h4>Category</h4>
          <label><input type="radio" name="f-cat" value="" ${!cat ? 'checked' : ''}> All <span class="count">${state.products.length}</span></label>
          ${topCategories().map((c) => `<label><input type="radio" name="f-cat" value="${esc(c.slug)}" ${cat && categoryTree(c.id).includes(cat.id) ? 'checked' : ''}>
            ${esc(c.name)} <span class="count">${countIn(c.id)}</span></label>`).join('')}
        </div>
        <div class="filter-group">
          <h4>Size</h4>
          <label><input type="radio" name="f-size" value="" ${!params.size ? 'checked' : ''}> Any</label>
          ${allSizes.map((s) => `<label><input type="radio" name="f-size" value="${esc(s)}" ${params.size === s ? 'checked' : ''}> ${esc(s)}</label>`).join('')}
        </div>
        <div class="filter-group">
          <h4>Price (৳)</h4>
          <div class="price-inputs">
            <input type="number" id="fMin" placeholder="Min" value="${esc(params.min || '')}" min="0">
            <span>–</span>
            <input type="number" id="fMax" placeholder="Max" value="${esc(params.max || '')}" min="0">
          </div>
          <button class="btn btn-ghost btn-sm filter-apply" id="fApply">Apply</button>
        </div>
        <div class="filter-group">
          <h4>Availability</h4>
          <label><input type="checkbox" id="fStock" ${params.instock === '1' ? 'checked' : ''}> In stock only</label>
        </div>
      </aside>

      <div>
        ${activeChips.length ? `<div class="chips">${activeChips.map(([k, label]) =>
          `<span class="chip">${esc(label)}<button data-clear="${k}" aria-label="Remove filter">×</button></span>`).join('')}
          <button class="chip" data-clear="all">Clear all</button></div>` : ''}
        <div class="shop-bar">
          <span class="count">${list.length} ${list.length === 1 ? 'piece' : 'pieces'}</span>
          <select id="sortBy" aria-label="Sort by">
            ${[['featured', 'Featured'], ['new', 'Newest'], ['popular', 'Most popular'],
               ['price-asc', 'Price: low to high'], ['price-desc', 'Price: high to low'], ['discount', 'Biggest discount']]
              .map(([v, l]) => `<option value="${v}" ${sort === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        ${list.length ? cardGrid(list, { cols3: true, eager: true }) : `<div class="empty">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
          <p>Nothing matches those filters yet.</p>
          <a class="btn btn-primary" href="/shop" data-link>Clear filters</a></div>`}
      </div>
    </div>
  </div>`;
}

/* ---------------------------------------------------------- product page */
const SIZE_CHART = [
  ['36', '36', '30', '38'], ['38', '38', '32', '40'], ['40', '40', '34', '42'],
  ['42', '42', '36', '44'], ['44', '44', '38', '46'], ['46', '46', '40', '48'],
];
const SIZE_CHART_ALPHA = [
  ['S', '36', '30', '38'], ['M', '38', '32', '40'], ['L', '40', '34', '42'],
  ['XL', '42', '36', '44'], ['XXL', '44', '38', '46'],
];

function sizeChartHTML(sizes) {
  const alpha = sizes.some((s) => /^[SMLX]/i.test(s));
  const rows = alpha ? SIZE_CHART_ALPHA : SIZE_CHART;
  return `<p class="muted">All measurements in inches. If you are between sizes, take the larger one.</p>
    <table class="size-table">
      <thead><tr><th>Size</th><th>Bust</th><th>Waist</th><th>Hip</th></tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
    <p class="muted-sm">Unstitched and free size pieces are not covered by this chart. Message us on WhatsApp if you want exact measurements for a specific piece.</p>`;
}

function productPage(slug) {
  const p = bySlug(slug);
  if (!p) return notFound();
  const off = discountPct(p);
  const related = state.products.filter((x) => x.category_id === p.category_id && x.id !== p.id).slice(0, 4);
  const s = state.settings;
  const wa = (s.whatsapp_number || '').replace(/\D/g, '');
  const msg = encodeURIComponent(`Hi, I want to order: ${p.title} (${location.origin}/product/${p.slug})`);

  return `<div class="wrap">
    <nav class="crumb"><a href="/" data-link>Home</a><span>/</span><a href="/shop" data-link>Shop</a><span>/</span>
      ${p.category_name ? `<a href="/category/${esc(p.category_slug || '')}" data-link>${esc(p.category_name)}</a><span>/</span>` : ''}
      <span>${esc(p.title)}</span></nav>

    <div class="pdp">
      <div class="gallery">
        <div class="thumbs">${p.images.map((src, i) =>
          `<button class="thumb ${i === 0 ? 'on' : ''}" data-img="${esc(src)}" aria-label="View image ${i + 1}">
            <img src="${esc(smallImg(src))}" alt="" width="76" height="95" loading="lazy"></button>`).join('')}</div>
        <div class="stage" id="stage">
          <img id="stageImg" src="${esc(imgOf(p))}" alt="${esc(p.title)}" width="900" height="1117" fetchpriority="high" decoding="async">
        </div>
      </div>

      <div class="pdp-info">
        <span class="pdp-cat">${esc(p.category_name || '')}</span>
        <h1>${esc(p.title)}</h1>
        ${p.title_bn ? `<p class="bn muted">${esc(p.title_bn)}</p>` : ''}
        <div class="pdp-price">
          <b>${taka(priceOf(p))}</b>
          ${off ? `<del>${taka(p.price)}</del><span class="off">-${off}% off</span>` : ''}
        </div>
        <p class="pdp-short">${esc(p.short_description || '')}</p>

        ${p.sizes.length ? `<div class="opt-group">
          <div class="opt-head"><h4>Size</h4><button id="sizeChartBtn">Size guide</button></div>
          <div class="swatches" id="sizeSwatches">
            ${p.sizes.map((x, i) => `<button class="sw-size ${i === 0 ? 'on' : ''}" data-size="${esc(x)}">${esc(x)}</button>`).join('')}
          </div></div>` : ''}

        ${p.colors.length ? `<div class="opt-group">
          <div class="opt-head"><h4>Colour <span class="muted opt-value" id="colorName">${esc(p.colors[0].name || '')}</span></h4></div>
          <div class="swatches" id="colorSwatches">
            ${p.colors.map((c, i) => `<button class="sw-color ${i === 0 ? 'on' : ''}" data-color="${esc(c.name)}"
              data-hex="${esc(c.hex || '#ccc')}" aria-label="${esc(c.name)}"></button>`).join('')}
          </div></div>` : ''}

        <div class="pdp-actions">
          <div class="qty">
            <button id="qtyMinus" aria-label="Decrease">−</button><b id="qtyVal">1</b><button id="qtyPlus" aria-label="Increase">+</button>
          </div>
          ${p.stock > 0
            ? `<button class="btn btn-primary" id="addBtn" data-id="${esc(p.id)}">Add to bag</button>
               <button class="btn btn-ghost" id="buyBtn" data-id="${esc(p.id)}">Buy now</button>`
            : '<button class="btn btn-ghost" disabled>Sold out</button>'}
        </div>
        ${p.stock > 0 && p.stock <= 6 ? `<p class="stock-txt">Only ${p.stock} left in stock</p>` : ''}

        <div class="pdp-ordercall">
          ${wa ? `<a class="wa" href="https://wa.me/${esc(wa)}?text=${msg}" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-8.7 15l-1.3 5 5.2-1.4A10 10 0 1 0 12 2zm0 2a8 8 0 1 1-4.1 14.8l-.4-.2-2.6.7.7-2.5-.2-.4A8 8 0 0 1 12 4z"/></svg>
            Order on WhatsApp</a>` : ''}
          ${s.hotline ? `<a class="call" href="tel:${esc(s.hotline)}">
            <svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1.1 1A16 16 0 0 1 4 5.1 1 1 0 0 1 5 4z"/></svg>
            Call to order</a>` : ''}
        </div>

        <div class="pdp-meta">
          <div><svg viewBox="0 0 24 24"><path d="M5 7h9v8H5zM14 10h3l2 3v2h-5z"/></svg>
            <span>Cash on delivery available all over Bangladesh</span></div>
          <div><svg viewBox="0 0 24 24"><path d="M12 3l8 4v5c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V7z"/></svg>
            <span>Inside Dhaka ${taka(s.delivery_inside_dhaka || 70)} · Outside ${taka(s.delivery_outside_dhaka || 130)}</span></div>
          <div><svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4"/></svg>
            <span>${esc(s.return_days || 7)} day return or exchange</span></div>
        </div>

        <div class="tabs" id="pdpTabs">
          <button class="on" data-tab="desc">Description</button>
          <button data-tab="spec">Details</button>
          <button data-tab="ship">Delivery &amp; returns</button>
        </div>
        <div class="tab-body" id="tabBody">${tabDesc(p)}</div>
      </div>
    </div>

    ${related.length ? `<section class="sec sec-tight">
      <div class="sec-head reveal"><div><span class="eyebrow">You may also like</span><h2>Goes well with this</h2></div></div>
      ${cardGrid(related)}
    </section>` : ''}
  </div>`;
}

function tabDesc(p) { return `<p>${esc(p.description || p.short_description || '')}</p>`; }
function tabSpec(p) {
  const rows = [['Fabric', p.fabric], ['Care', p.care], ['SKU', p.sku],
    ['Sizes', p.sizes.join(', ')], ['Colours', p.colors.map((c) => c.name).join(', ')]].filter(([, v]) => v);
  return `<dl class="spec">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}
function tabShip() {
  const s = state.settings;
  return `<p><strong>Delivery.</strong> Inside Dhaka ${taka(s.delivery_inside_dhaka || 70)}, 1 to 2 days.
    Outside Dhaka ${taka(s.delivery_outside_dhaka || 130)}, 2 to 4 days.
    ${Number(s.free_delivery_threshold) > 0 ? `Free delivery over ${taka(s.free_delivery_threshold)}.` : ''}</p>
    <p><strong>Returns.</strong> ${esc(s.return_days || 7)} days from delivery, unworn and with tags on.
    Message us on WhatsApp and we arrange the pickup.</p>`;
}

/* ------------------------------------------------------------- cart page */
function cartPage() {
  const { subtotal } = cartTotals();
  if (!state.cart.length) {
    return `<div class="wrap"><div class="empty">
      <svg viewBox="0 0 24 24"><path d="M6 7h12l-1 13H7L6 7z"/><path d="M9 7V5.5a3 3 0 0 1 6 0V7"/></svg>
      <h2>Your bag is empty</h2>
      <p>Nothing here yet. Have a look at what just landed.</p>
      <a class="btn btn-primary" href="/shop" data-link>Start shopping</a></div></div>`;
  }
  return `<div class="wrap">
    <nav class="crumb"><a href="/" data-link>Home</a><span>/</span><span>Bag</span></nav>
    <header class="page-head"><h1>Your bag</h1></header>
    <div class="cart-page">
      <div>${state.cart.map((line) => {
        const p = state.products.find((x) => x.id === line.product_id);
        if (!p) return '';
        const key = cartKey(line);
        return `<div class="cart-line">
          <img src="${esc(smallImg(imgOf(p)))}" alt="${esc(p.title)}" width="72" height="90" loading="lazy">
          <div class="meta">
            <b><a href="/product/${esc(p.slug)}" data-link>${esc(p.title)}</a></b>
            <span>${[line.size, line.color].filter(Boolean).map(esc).join(' · ') || 'One size'}</span>
            <span class="ln-price">${taka(priceOf(p) * line.quantity)}</span>
            <div class="qty">
              <button data-qty="${esc(key)}" data-delta="-1" aria-label="Decrease">−</button>
              <b>${line.quantity}</b>
              <button data-qty="${esc(key)}" data-delta="1" aria-label="Increase">+</button>
            </div>
          </div>
          <button class="ln-remove" data-remove="${esc(key)}">Remove</button>
        </div>`;
      }).join('')}</div>
      <aside class="summary">
        <h3>Order summary</h3>
        <div class="row"><span>Subtotal</span><strong>${taka(subtotal)}</strong></div>
        <div class="row"><span>Delivery</span><span class="muted">Calculated at checkout</span></div>
        <div class="row grand"><span>Total</span><strong>${taka(subtotal)}</strong></div>
        <a class="btn btn-primary btn-block" href="/checkout" data-link>Checkout</a>
        <a class="btn btn-ghost btn-block" href="/shop" data-link>Keep shopping</a>
      </aside>
    </div>
  </div>`;
}

/* --------------------------------------------------------------- districts */
const DISTRICTS = ['Dhaka','Gazipur','Narayanganj','Narsingdi','Manikganj','Munshiganj','Tangail','Kishoreganj','Faridpur','Gopalganj','Madaripur','Rajbari','Shariatpur',
'Chattogram','Cox\'s Bazar','Cumilla','Brahmanbaria','Chandpur','Feni','Lakshmipur','Noakhali','Khagrachhari','Rangamati','Bandarban',
'Rajshahi','Bogura','Joypurhat','Naogaon','Natore','Chapainawabganj','Pabna','Sirajganj',
'Khulna','Bagerhat','Chuadanga','Jashore','Jhenaidah','Kushtia','Magura','Meherpur','Narail','Satkhira',
'Barishal','Barguna','Bhola','Jhalokathi','Patuakhali','Pirojpur',
'Sylhet','Habiganj','Moulvibazar','Sunamganj',
'Rangpur','Dinajpur','Gaibandha','Kurigram','Lalmonirhat','Nilphamari','Panchagarh','Thakurgaon',
'Mymensingh','Jamalpur','Netrokona','Sherpur'];

function deliveryFor(district) {
  const s = state.settings;
  return district === 'Dhaka' ? Number(s.delivery_inside_dhaka || 70) : Number(s.delivery_outside_dhaka || 130);
}

/* ----------------------------------------------------------- checkout page */
function checkoutPage() {
  if (!state.cart.length) { navigate('/cart'); return ''; }
  const { subtotal } = cartTotals();
  const s = state.settings;

  return `<div class="wrap">
    <nav class="crumb"><a href="/" data-link>Home</a><span>/</span><a href="/cart" data-link>Bag</a><span>/</span><span>Checkout</span></nav>
    <header class="page-head"><h1>Checkout</h1><p>Cash on delivery available everywhere in Bangladesh.</p></header>

    <form class="checkout" id="checkoutForm" novalidate>
      <div>
        <section class="co-card">
          <h3><i>1</i> Delivery details</h3>
          <div class="grid-2">
            <label class="field"><span>Full name *</span><input name="customer_name" required autocomplete="name" placeholder="Your name"></label>
            <label class="field"><span>Mobile number *</span><input name="customer_phone" required inputmode="tel" autocomplete="tel" placeholder="01XXXXXXXXX"></label>
          </div>
          <label class="field"><span>Full address *</span><textarea name="address" required autocomplete="street-address" placeholder="House, road, area"></textarea></label>
          <div class="grid-2">
            <label class="field"><span>District *</span>
              <select name="district" required>
                <option value="">Choose district</option>
                ${DISTRICTS.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join('')}
              </select></label>
            <label class="field"><span>Thana / Upazila</span><input name="thana" placeholder="Area"></label>
          </div>
          <label class="field"><span>Email (optional)</span><input name="customer_email" type="email" autocomplete="email" placeholder="your@email.com"></label>
          <label class="field"><span>Order note (optional)</span><textarea name="notes" placeholder="Anything we should know"></textarea></label>
        </section>

        <section class="co-card">
          <h3><i>2</i> Payment</h3>
          <div class="pay-opts" id="payOpts">
            <label class="pay-opt on"><input type="radio" name="payment_method" value="cod" checked>
              <div><b>Cash on delivery</b><span>Pay the courier when it arrives. Most popular.</span></div></label>
            ${s.bkash_number ? `<label class="pay-opt"><input type="radio" name="payment_method" value="bkash">
              <div><b>bKash</b><span>Send money, then enter the transaction ID</span></div></label>` : ''}
            ${s.nagad_number ? `<label class="pay-opt"><input type="radio" name="payment_method" value="nagad">
              <div><b>Nagad</b><span>Send money, then enter the transaction ID</span></div></label>` : ''}
            ${s.rocket_number ? `<label class="pay-opt"><input type="radio" name="payment_method" value="rocket">
              <div><b>Rocket</b><span>Send money, then enter the transaction ID</span></div></label>` : ''}
          </div>
          <div id="payExtra"></div>
        </section>
      </div>

      <aside class="summary">
        <h3>Your order</h3>
        ${state.cart.map((line) => {
          const p = state.products.find((x) => x.id === line.product_id);
          if (!p) return '';
          return `<div class="row"><span>${esc(p.title)} ${line.size ? `(${esc(line.size)})` : ''} × ${line.quantity}</span>
            <strong>${taka(priceOf(p) * line.quantity)}</strong></div>`;
        }).join('')}
        <div class="coupon-row">
          <input id="couponInput" placeholder="Coupon code" value="${esc(state.coupon?.code || '')}" autocomplete="off">
          <button type="button" id="couponBtn">Apply</button>
        </div>
        <p class="coupon-msg" id="couponMsg"></p>
        <div class="row"><span>Subtotal</span><strong id="sumSubtotal">${taka(subtotal)}</strong></div>
        <div class="row save ${state.coupon ? '' : 'hide'}" id="sumDiscountRow"><span>Discount</span><strong id="sumDiscount">−${taka(state.coupon?.discount || 0)}</strong></div>
        <div class="row"><span>Delivery</span><strong id="sumDelivery">—</strong></div>
        <div class="row grand"><span>Total</span><strong id="sumTotal">${taka(subtotal)}</strong></div>
        <button class="btn btn-primary btn-block" type="submit" id="placeBtn">Place order</button>
        <p class="muted-sm">By placing this order you agree to our <a href="/page/terms" data-link>terms</a>.</p>
      </aside>
    </form>
  </div>`;
}

function recalcCheckout() {
  const form = $('#checkoutForm'); if (!form) return;
  const { subtotal } = cartTotals();
  const district = form.district.value;
  let delivery = district ? deliveryFor(district) : null;
  const discount = state.coupon?.discount || 0;
  const threshold = Number(state.settings.free_delivery_threshold || 0);
  if (delivery != null && (state.coupon?.freeShipping || (threshold > 0 && subtotal >= threshold))) delivery = 0;

  $('#sumSubtotal').textContent = taka(subtotal);
  $('#sumDiscountRow').classList.toggle('hide', !discount);
  $('#sumDiscount').textContent = `−${taka(discount)}`;
  $('#sumDelivery').textContent = delivery == null ? 'Choose district' : delivery === 0 ? 'Free' : taka(delivery);
  $('#sumTotal').textContent = taka(Math.max(0, subtotal - discount) + (delivery || 0));
}

function payExtraHTML(method) {
  const s = state.settings;
  const number = { bkash: s.bkash_number, nagad: s.nagad_number, rocket: s.rocket_number }[method];
  if (!number) return '';
  const label = { bkash: 'bKash', nagad: 'Nagad', rocket: 'Rocket' }[method];
  const { subtotal } = cartTotals();
  const discount = state.coupon?.discount || 0;
  return `<div class="pay-note">
      Send <b>${taka(Math.max(0, subtotal - discount))}</b> (plus delivery) to our ${esc(label)} number
      <b>${esc(number)}</b> using <b>Send Money</b>, then enter the transaction ID below.
    </div>
    <label class="field"><span>${esc(label)} transaction ID *</span>
      <input name="payment_trx_id" placeholder="e.g. 8N7A2XK9QB" autocomplete="off"></label>`;
}

/* --------------------------------------------------------- success + track */
function successPage(order) {
  return `<div class="wrap"><div class="success">
    <div class="success-mark"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></div>
    <h1>Order placed</h1>
    <p class="muted">We have your order and will call you shortly to confirm.</p>
    <div class="order-box">
      <p class="order-num">${esc(order.id)}</p>
      <div class="row"><span>Subtotal</span><strong>${taka(order.subtotal)}</strong></div>
      ${order.discount ? `<div class="row"><span>Discount</span><strong>−${taka(order.discount)}</strong></div>` : ''}
      <div class="row"><span>Delivery</span><strong>${order.delivery_charge ? taka(order.delivery_charge) : 'Free'}</strong></div>
      <div class="row"><span>Total</span><strong>${taka(order.total)}</strong></div>
      <div class="row"><span>Payment</span><strong>${order.payment_method === 'cod' ? 'Cash on delivery' : esc(order.payment_method)}</strong></div>
    </div>
    <p class="muted-sm">Save your order number. You can check progress any time on the track page.</p>
    <div class="hero-cta">
      <a class="btn btn-primary" href="/track?id=${encodeURIComponent(order.id)}" data-link>Track this order</a>
      <a class="btn btn-ghost" href="/shop" data-link>Keep shopping</a>
    </div>
  </div></div>`;
}

const STATUS_FLOW = ['pending', 'confirmed', 'packed', 'shipped', 'delivered'];
const STATUS_LABEL = {
  pending: 'Order received', confirmed: 'Confirmed by phone', packed: 'Packed and ready',
  shipped: 'Handed to courier', delivered: 'Delivered', cancelled: 'Cancelled', returned: 'Returned',
};

function trackPage(params) {
  return `<div class="wrap">
    <nav class="crumb"><a href="/" data-link>Home</a><span>/</span><span>Track order</span></nav>
    <header class="page-head"><h1>Track your order</h1>
      <p>Enter the order number we sent you and the phone number you ordered with.</p></header>
    <form class="track-form" id="trackForm">
      <label class="field"><span>Order number</span><input name="id" required placeholder="SHK-261030-4821" value="${esc(params.id || '')}"></label>
      <label class="field"><span>Mobile number</span><input name="phone" required inputmode="tel" placeholder="01XXXXXXXXX"></label>
      <button class="btn btn-primary btn-block" type="submit">Find my order</button>
    </form>
    <div id="trackResult"></div>
  </div>`;
}

function trackResultHTML(o) {
  const idx = STATUS_FLOW.indexOf(o.status);
  const steps = ['cancelled', 'returned'].includes(o.status)
    ? [{ status: o.status, done: true }]
    : STATUS_FLOW.map((st, i) => ({ status: st, done: i <= idx }));
  return `<div class="summary">
    <h3>${esc(o.id)}</h3>
    <div class="row"><span>Total</span><strong>${taka(o.total)}</strong></div>
    ${o.courier ? `<div class="row"><span>Courier</span><strong>${esc(o.courier)}</strong></div>` : ''}
    ${o.tracking_code ? `<div class="row"><span>Tracking code</span><strong>${esc(o.tracking_code)}</strong></div>` : ''}
    <div class="timeline">
      ${steps.map((s) => `<div class="tl-item ${s.done ? 'done' : ''}">
        <b>${esc(STATUS_LABEL[s.status] || s.status)}</b>
        <span>${s.done ? 'Done' : 'Pending'}</span></div>`).join('')}
    </div>
    <h4 class="track-items-h">Items</h4>
    ${o.items.map((it) => `<div class="row"><span>${esc(it.title)} ${it.size ? `(${esc(it.size)})` : ''} × ${it.quantity}</span>
      <strong>${taka(it.line_total)}</strong></div>`).join('')}
  </div>`;
}

/* -------------------------------------------------------------- wishlist */
function wishlistPage() {
  const list = state.wishlist.map((id) => state.products.find((p) => p.id === id)).filter(Boolean);
  return `<div class="wrap">
    <nav class="crumb"><a href="/" data-link>Home</a><span>/</span><span>Saved</span></nav>
    <header class="page-head"><h1>Saved pieces</h1><p>${list.length} saved.</p></header>
    ${list.length ? cardGrid(list, { cols3: true }) : `<div class="empty">
      <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.6-7-9.3A4 4 0 0 1 12 8a4 4 0 0 1 7-.7c0 4.7-7 12.7-7 12.7z"/></svg>
      <p>Nothing saved yet. Tap the heart on any piece to keep it here.</p>
      <a class="btn btn-primary" href="/shop" data-link>Browse the shop</a></div>`}
  </div>`;
}

function notFound() {
  return `<div class="wrap"><div class="empty">
    <h2>Page not found</h2><p>That link does not lead anywhere.</p>
    <a class="btn btn-primary" href="/" data-link>Back home</a></div></div>`;
}

/* ---------------------------------------------------------- prose pages */
function prosePage(slug) {
  const s = state.settings;
  const pages = {
    about: ['Our story', `
      <p>Shoukhin started with a simple complaint: the cotton available in most shops either looked good and felt stiff, or felt good and looked like nothing much. We wanted both.</p>
      <h2>What we make</h2>
      <p>Three piece sets, kurtis, sarees and the loose, easy pieces that get worn on ordinary days. Cotton and handloom first, because that is what the weather here asks for.</p>
      <h2>How we work</h2>
      <p>We work with small units in and around Dhaka. Runs are short, which means a piece sells out and sometimes does not come back. Every order is checked by hand before it is packed.</p>
      <h2>Finding us</h2>
      <p>${esc(s.address || 'Dhaka, Bangladesh')}. Call ${esc(s.hotline || '')} or message us on WhatsApp, we answer quickly.</p>`],
    contact: ['Contact us', `
      <p>We answer WhatsApp and Messenger fastest, usually within an hour during the day.</p>
      <ul>
        <li><strong>Hotline:</strong> ${esc(s.hotline || 'Coming soon')}</li>
        <li><strong>Email:</strong> ${esc(s.email || '')}</li>
        <li><strong>Address:</strong> ${esc(s.address || 'Dhaka, Bangladesh')}</li>
      </ul>
      <p>For an order already placed, have your order number ready, it makes everything quicker.</p>`],
    shipping: ['Delivery', `
      <p>We deliver to all 64 districts of Bangladesh.</p>
      <h2>Charges</h2>
      <ul>
        <li>Inside Dhaka: ${taka(s.delivery_inside_dhaka || 70)}, usually 1 to 2 days</li>
        <li>Outside Dhaka: ${taka(s.delivery_outside_dhaka || 130)}, usually 2 to 4 days</li>
        ${Number(s.free_delivery_threshold) > 0 ? `<li>Free delivery on orders over ${taka(s.free_delivery_threshold)}</li>` : ''}
      </ul>
      <h2>How it works</h2>
      <p>After you place an order we call to confirm before dispatch. If we cannot reach you after three attempts the order is held, not cancelled.</p>
      <p>Cash on delivery means you pay the courier when the parcel arrives. You can check the parcel before paying, but please do not wear it.</p>`],
    returns: ['Returns and exchange', `
      <p>You have ${esc(s.return_days || 7)} days from delivery to return or exchange a piece.</p>
      <h2>What qualifies</h2>
      <ul>
        <li>Unworn, unwashed, with tags still on</li>
        <li>In its original packaging</li>
        <li>Wrong size, wrong item, or a fault we missed</li>
      </ul>
      <h2>What does not</h2>
      <ul><li>Unstitched fabric that has already been cut</li><li>Pieces bought in a clearance sale</li><li>Anything worn or washed</li></ul>
      <h2>How to start one</h2>
      <p>Message us on WhatsApp with your order number and a photo. We arrange pickup where the courier covers it. Size exchange is free once per order; the return courier charge applies otherwise.</p>`],
    faq: ['Frequently asked', `
      <h3>Do you deliver outside Dhaka?</h3><p>Yes, all 64 districts. ${taka(s.delivery_outside_dhaka || 130)}, 2 to 4 days.</p>
      <h3>Can I pay cash on delivery?</h3><p>Yes, everywhere. It is the option most customers choose.</p>
      <h3>Can I check the parcel before paying?</h3><p>You can open and look. Please do not wear it before paying.</p>
      <h3>How do I know my size?</h3><p>Use the size guide on any product page. If you are between sizes, take the larger one, or message us for the exact measurements of that piece.</p>
      <h3>Is the colour the same as the photo?</h3><p>Very close, but screens differ. If a colour is noticeably off, that counts as a valid return.</p>
      <h3>Do you restock sold out pieces?</h3><p>Sometimes. Runs are short. Message us and we will tell you honestly whether it is coming back.</p>`],
    'size-guide': ['Size guide', sizeChartHTML(['36', '38', '40']) + `
      <h2>How to measure</h2>
      <ul>
        <li><strong>Bust:</strong> around the fullest part, tape flat and level</li>
        <li><strong>Waist:</strong> around the narrowest part, usually just above the navel</li>
        <li><strong>Hip:</strong> around the fullest part, about 8 inches below the waist</li>
      </ul>
      <p>Measure over light clothing, not over a kameez. If you are between sizes, take the larger one.</p>`],
    privacy: ['Privacy policy', `
      <p>We collect only what we need to get your order to you: name, phone number, delivery address, and an email if you give one.</p>
      <h2>What we do with it</h2>
      <ul><li>Confirm, pack and deliver your order</li><li>Contact you about that order</li><li>Send offers, only if you subscribed</li></ul>
      <h2>What we do not do</h2>
      <p>We do not sell your details to anyone. Courier partners get only what they need to deliver the parcel.</p>
      <h2>Your choices</h2>
      <p>Write to ${esc(s.email || 'us')} to see what we hold about you, correct it, or have it deleted.</p>`],
    terms: ['Terms and conditions', `
      <p>By ordering from Shoukhin you accept these terms.</p>
      <h2>Orders</h2>
      <p>An order is confirmed once we reach you by phone. We may cancel an order if a piece turns out to be out of stock, and we will tell you if that happens.</p>
      <h2>Pricing</h2>
      <p>All prices are in Bangladeshi Taka and include VAT where it applies. Delivery is charged separately and shown before you place the order.</p>
      <h2>Product images</h2>
      <p>We photograph pieces as accurately as we can. Slight variation in colour and in hand-finished detail is normal and is not a fault.</p>
      <h2>Liability</h2>
      <p>Our responsibility is limited to the value of the order. Nothing here affects your rights under Bangladeshi consumer law.</p>`],
  };
  const page = pages[slug];
  if (!page) return notFound();
  return `<div class="wrap">
    <nav class="crumb"><a href="/" data-link>Home</a><span>/</span><span>${esc(page[0])}</span></nav>
    <header class="page-head"><h1>${esc(page[0])}</h1></header>
    <article class="prose">${page[1]}</article>
  </div>`;
}

/* ========================================================================
   Router
   ======================================================================== */
let lastOrder = null;

function parseQuery(search) {
  return Object.fromEntries(new URLSearchParams(search));
}

function routeFor(pathname, search) {
  const q = parseQuery(search);
  const seg = pathname.replace(/\/+$/, '').split('/').filter(Boolean);

  if (!seg.length) return { title: 'Shoukhin — Thoughtfully yours', html: homePage(), init: ['hero', 'countdown', 'rails'] };
  if (seg[0] === 'shop') return { title: 'Shop — Shoukhin', html: shopPage(q), init: ['shop'] };
  if (seg[0] === 'category' && seg[1]) {
    const c = catBySlug(seg[1]);
    return { title: `${c ? c.name : 'Shop'} — Shoukhin`, html: shopPage({ ...q, category: seg[1] }), init: ['shop'] };
  }
  if (seg[0] === 'product' && seg[1]) {
    const p = bySlug(seg[1]);
    return { title: `${p ? p.title : 'Product'} — Shoukhin`, html: productPage(seg[1]), init: ['pdp'] };
  }
  if (seg[0] === 'cart') return { title: 'Your bag — Shoukhin', html: cartPage(), init: [] };
  if (seg[0] === 'checkout') return { title: 'Checkout — Shoukhin', html: checkoutPage(), init: ['checkout'] };
  if (seg[0] === 'success') return { title: 'Order placed — Shoukhin', html: lastOrder ? successPage(lastOrder) : notFound(), init: [] };
  if (seg[0] === 'track') return { title: 'Track your order — Shoukhin', html: trackPage(q), init: ['track'] };
  if (seg[0] === 'wishlist') return { title: 'Saved — Shoukhin', html: wishlistPage(), init: [] };
  if (seg[0] === 'page' && seg[1]) return { title: 'Shoukhin', html: prosePage(seg[1]), init: [] };
  return { title: 'Not found — Shoukhin', html: notFound(), init: [] };
}

function render() {
  const route = routeFor(location.pathname, location.search);
  const main = $('#main');
  document.title = route.title;
  main.innerHTML = route.html;
  main.classList.remove('view-swap');
  void main.offsetWidth;
  if (!REDUCED) main.classList.add('view-swap');

  paintStockBars(main);
  initReveal(main);
  for (const step of route.init) {
    if (step === 'hero') initHero(main);
    if (step === 'countdown') initCountdown(main);
    if (step === 'rails') initRails(main);
    if (step === 'shop') initShop(main);
    if (step === 'pdp') initPDP(main);
    if (step === 'checkout') initCheckout(main);
    if (step === 'track') initTrack(main);
  }
  $$('.tabbar a[data-tab]').forEach((a) => a.classList.toggle('on', a.dataset.tab === location.pathname));
  $$('.nav a[data-link]').forEach((a) => {
    const href = a.getAttribute('href').split('?')[0];
    a.classList.toggle('active', href === location.pathname);
  });
}

function navigate(url, { replace = false } = {}) {
  if (replace) history.replaceState({}, '', url);
  else history.pushState({}, '', url);
  closeOverlays();
  window.scrollTo({ top: 0, behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' });
  render();
}

function updateQuery(patch) {
  const url = new URL(location.href);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === '' || v === undefined) url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  navigate(url.pathname + url.search);
}

/* ========================================================================
   Page initialisers
   ======================================================================== */
function initShop(root) {
  $('#sortBy', root)?.addEventListener('change', (e) => updateQuery({ sort: e.target.value }));

  $$('input[name="f-cat"]', root).forEach((r) => r.addEventListener('change', () => {
    const url = new URL(location.href);
    const keep = url.search;
    navigate(r.value ? `/category/${r.value}${keep}` : `/shop${keep}`);
  }));

  $$('input[name="f-size"]', root).forEach((r) =>
    r.addEventListener('change', () => updateQuery({ size: r.value || null })));

  $('#fApply', root)?.addEventListener('click', () =>
    updateQuery({ min: $('#fMin', root).value || null, max: $('#fMax', root).value || null }));

  $('#fStock', root)?.addEventListener('change', (e) => updateQuery({ instock: e.target.checked ? '1' : null }));

  $$('[data-clear]', root).forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.clear;
    if (k === 'all') return navigate('/shop');
    if (k === 'category') {
      const url = new URL(location.href);
      return navigate(`/shop${url.search}`);
    }
    if (k === 'price') return updateQuery({ min: null, max: null });
    updateQuery({ [k]: null });
  }));
}

function initPDP(root) {
  const stage = $('#stage', root), stageImg = $('#stageImg', root);

  $$('.thumb', root).forEach((t) => t.addEventListener('click', () => {
    $$('.thumb', root).forEach((x) => x.classList.remove('on'));
    t.classList.add('on');
    stageImg.style.opacity = '0';
    const next = new Image();
    next.onload = () => { stageImg.src = t.dataset.img; stageImg.style.opacity = '1'; };
    next.src = t.dataset.img;
  }));

  // Click to zoom, mouse position sets the origin.
  stage?.addEventListener('click', () => stage.classList.toggle('zoom'));
  stage?.addEventListener('mousemove', (e) => {
    if (!stage.classList.contains('zoom')) return;
    const r = stage.getBoundingClientRect();
    stageImg.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
  });
  stage?.addEventListener('mouseleave', () => stage.classList.remove('zoom'));

  $$('#sizeSwatches .sw-size', root).forEach((b) => b.addEventListener('click', () => {
    $$('#sizeSwatches .sw-size', root).forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
  }));

  $$('#colorSwatches .sw-color', root).forEach((b) => {
    b.style.background = b.dataset.hex;
    b.addEventListener('click', () => {
      $$('#colorSwatches .sw-color', root).forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      const label = $('#colorName', root);
      if (label) label.textContent = b.dataset.color;
    });
  });

  let qty = 1;
  const qtyVal = $('#qtyVal', root);
  $('#qtyMinus', root)?.addEventListener('click', () => { qty = Math.max(1, qty - 1); qtyVal.textContent = qty; });
  $('#qtyPlus', root)?.addEventListener('click', () => { qty = Math.min(20, qty + 1); qtyVal.textContent = qty; });

  const chosen = () => ({
    size: $('#sizeSwatches .sw-size.on', root)?.dataset.size || null,
    color: $('#colorSwatches .sw-color.on', root)?.dataset.color || null,
    quantity: qty,
  });

  $('#addBtn', root)?.addEventListener('click', (e) => addToCart(e.currentTarget.dataset.id, chosen()));
  $('#buyBtn', root)?.addEventListener('click', (e) => {
    addToCart(e.currentTarget.dataset.id, { ...chosen(), quiet: true });
    navigate('/checkout');
  });

  $('#sizeChartBtn', root)?.addEventListener('click', () => {
    const p = bySlug(location.pathname.split('/').pop());
    openModal('Size guide', sizeChartHTML(p?.sizes || []));
  });

  const p = bySlug(location.pathname.split('/').pop());
  $$('#pdpTabs button', root).forEach((b) => b.addEventListener('click', () => {
    $$('#pdpTabs button', root).forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    $('#tabBody', root).innerHTML =
      b.dataset.tab === 'spec' ? tabSpec(p) : b.dataset.tab === 'ship' ? tabShip() : tabDesc(p);
  }));
}

function initCheckout(root) {
  const form = $('#checkoutForm', root);
  if (!form) return;
  recalcCheckout();

  form.district.addEventListener('change', recalcCheckout);

  $$('.pay-opt input', root).forEach((r) => r.addEventListener('change', () => {
    $$('.pay-opt', root).forEach((o) => o.classList.toggle('on', o.contains(r) && r.checked));
    $('#payExtra', root).innerHTML = r.value === 'cod' ? '' : payExtraHTML(r.value);
  }));

  $('#couponBtn', root)?.addEventListener('click', async () => {
    const code = $('#couponInput', root).value.trim();
    const msg = $('#couponMsg', root);
    if (!code) { state.coupon = null; msg.textContent = ''; recalcCheckout(); return; }
    msg.textContent = 'Checking…'; msg.className = 'coupon-msg';
    try {
      const { subtotal } = cartTotals();
      const res = await api('/coupons/validate', { method: 'POST', body: { code, subtotal } });
      state.coupon = res;
      msg.textContent = res.freeShipping ? 'Free delivery applied' : `Code applied, you save ${taka(res.discount)}`;
      msg.className = 'coupon-msg good';
    } catch (err) {
      state.coupon = null;
      msg.textContent = err.message;
      msg.className = 'coupon-msg bad';
    }
    recalcCheckout();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#placeBtn', root);
    $$('.field.err', root).forEach((f) => f.classList.remove('err'));
    $$('.err-msg', root).forEach((m) => m.remove());

    const data = Object.fromEntries(new FormData(form));
    const problems = [];
    if (!data.customer_name || data.customer_name.trim().length < 2) problems.push(['customer_name', 'Please enter your name']);
    if (!/^(?:\+?880|0)1[3-9]\d{8}$/.test((data.customer_phone || '').replace(/[\s-]/g, '')))
      problems.push(['customer_phone', 'Enter a valid Bangladeshi number, e.g. 01712345678']);
    if (!data.address || data.address.trim().length < 6) problems.push(['address', 'Please enter your full address']);
    if (!data.district) problems.push(['district', 'Choose your district']);
    if (data.payment_method !== 'cod' && !(data.payment_trx_id || '').trim())
      problems.push(['payment_trx_id', 'Enter the transaction ID']);

    if (problems.length) {
      for (const [name, text] of problems) {
        const input = form.elements[name];
        const field = input?.closest('.field');
        if (field) {
          field.classList.add('err');
          const m = document.createElement('p');
          m.className = 'err-msg';
          m.textContent = text;
          field.appendChild(m);
        }
      }
      form.elements[problems[0][0]]?.focus();
      toast(problems[0][1], 'bad');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Placing order…';
    try {
      const res = await api('/orders', {
        method: 'POST',
        body: { ...data, items: state.cart, coupon_code: state.coupon?.code || null },
      });
      lastOrder = res.order;
      state.cart = [];
      state.coupon = null;
      saveCart();
      navigate('/success');
    } catch (err) {
      toast(err.message, 'bad');
      btn.disabled = false;
      btn.textContent = 'Place order';
    }
  });
}

function initTrack(root) {
  const form = $('#trackForm', root);
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const box = $('#trackResult', root);
    const id = form.id.value.trim();
    const phone = form.phone.value.trim();
    box.innerHTML = '<p class="sr-hint">Looking up your order…</p>';
    try {
      const res = await api(`/track?id=${encodeURIComponent(id)}&phone=${encodeURIComponent(phone)}`);
      box.innerHTML = trackResultHTML(res.order);
    } catch (err) {
      box.innerHTML = `<p class="sr-hint">${esc(err.message)}</p>`;
    }
  });
}

/* ========================================================================
   Chrome: announcement, header, menus, footer, chat
   ======================================================================== */
function initAnnouncement() {
  const s = state.settings;
  const items = [
    s.announcement,
    s.hotline ? `Order by phone: ${s.hotline}` : null,
    `Cash on delivery in all 64 districts`,
    Number(s.free_delivery_threshold) > 0 ? `Free delivery over ${taka(s.free_delivery_threshold)}` : null,
  ].filter(Boolean);

  const track = $('#announceTrack');
  track.innerHTML = items.map((t, i) => `<div class="announce-item ${i === 0 ? 'on' : ''}">${esc(t)}</div>`).join('');
  const els = $$('.announce-item', track);
  if (els.length < 2) return;

  let i = 0;
  const go = (n) => {
    const prev = els[i];
    i = (n + els.length) % els.length;
    prev.classList.remove('on'); prev.classList.add('out');
    setTimeout(() => prev.classList.remove('out'), 520);
    els[i].classList.add('on');
  };
  $$('[data-announce]').forEach((b) =>
    b.addEventListener('click', () => go(i + (b.dataset.announce === 'next' ? 1 : -1))));
  if (!REDUCED) setInterval(() => go(i + 1), 5000);
}

function initHeader() {
  const head = $('#head');
  let last = window.scrollY;
  let ticking = false;
  const onScroll = () => {
    const y = window.scrollY;
    head.classList.toggle('stuck', y > 8);
    // Hide on the way down, show on the way up, but never near the top.
    if (!$('.drawer.open') && !$('#searchOverlay.open')) {
      head.classList.toggle('hidden', y > last && y > 260);
    }
    last = y;
    ticking = false;
  };
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });

  // Mega menu
  const mega = $('#navMega');
  const trigger = $('.nav-trigger', mega);
  const open = (on) => { mega.classList.toggle('open', on); trigger.setAttribute('aria-expanded', String(on)); };
  trigger.addEventListener('click', () => open(!mega.classList.contains('open')));
  mega.addEventListener('mouseenter', () => open(true));
  mega.addEventListener('mouseleave', () => open(false));
  document.addEventListener('click', (e) => { if (!mega.contains(e.target)) open(false); });
}

function buildMega() {
  const cats = topCategories();
  const promo = state.products.find((p) => p.is_flash_sale) || state.products[0];
  $('#megaPanel').innerHTML = `
    <div class="mega-cols">
      ${cats.slice(0, 2).map((c) => `<div>
        <h5>${esc(c.name)}</h5>
        <ul>
          <li><a href="/category/${esc(c.slug)}" data-link>All ${esc(c.name.toLowerCase())}</a></li>
          ${childrenOf(c.id).map((k) => `<li><a href="/category/${esc(k.slug)}" data-link>${esc(k.name)}</a></li>`).join('')}
        </ul></div>`).join('')}
      <div>
        <h5>More</h5>
        <ul>${cats.slice(2).map((c) => `<li><a href="/category/${esc(c.slug)}" data-link>${esc(c.name)}</a></li>`).join('')}</ul>
      </div>
      <div>
        <h5>Shop by</h5>
        <ul>
          <li><a href="/shop?sort=new" data-link>New arrivals</a></li>
          <li><a href="/shop?filter=flash" data-link>On sale</a></li>
          <li><a href="/shop?sort=popular" data-link>Best sellers</a></li>
          <li><a href="/shop?instock=1" data-link>In stock now</a></li>
          <li><a href="/page/size-guide" data-link>Size guide</a></li>
        </ul>
      </div>
    </div>
    ${promo ? `<a class="mega-promo" href="/shop?filter=flash" data-link>
      <img src="${esc(smallImg(imgOf(promo)))}" alt="" width="500" height="621" loading="lazy">
      <div class="mega-promo-txt"><strong>Flash sale</strong><span>Up to 50% off, this week only</span></div>
    </a>` : ''}`;
}

function buildMenuDrawer() {
  const cats = topCategories();
  $('#menuBody').innerHTML = `
    ${cats.map((c) => {
      const kids = childrenOf(c.id);
      return kids.length
        ? `<details class="menu-acc"><summary>${esc(c.name)}</summary><ul>
            <li><a href="/category/${esc(c.slug)}" data-link>All ${esc(c.name.toLowerCase())}</a></li>
            ${kids.map((k) => `<li><a href="/category/${esc(k.slug)}" data-link>${esc(k.name)}</a></li>`).join('')}
           </ul></details>`
        : `<div class="menu-flat"><a href="/category/${esc(c.slug)}" data-link>${esc(c.name)}</a></div>`;
    }).join('')}
    <div class="menu-flat">
      <a href="/shop?filter=flash" data-link>Flash sale</a>
      <a href="/wishlist" data-link>Saved pieces</a>
      <a href="/track" data-link>Track order</a>
      <a href="/page/about" data-link>Our story</a>
      <a href="/page/faq" data-link>FAQ</a>
      <a href="/page/contact" data-link>Contact</a>
    </div>`;
}

function buildFooter() {
  const s = state.settings;
  $('#footCats').innerHTML = topCategories().slice(0, 6)
    .map((c) => `<li><a href="/category/${esc(c.slug)}" data-link>${esc(c.name)}</a></li>`).join('');

  const socials = [
    [s.facebook_url, 'Facebook', 'M14 9h3V6h-3a4 4 0 0 0-4 4v2H8v3h2v6h3v-6h3l1-3h-4v-2a1 1 0 0 1 1-1z'],
    [s.instagram_url, 'Instagram', 'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zm5 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm5-1h.01'],
  ].filter(([url]) => url);
  $('#footSocial').innerHTML = socials.map(([url, label, d]) =>
    `<a href="${esc(url)}" target="_blank" rel="noopener" aria-label="${esc(label)}"><svg viewBox="0 0 24 24"><path d="${d}"/></svg></a>`).join('');

  const methods = ['Cash on delivery', s.bkash_number && 'bKash', s.nagad_number && 'Nagad', s.rocket_number && 'Rocket'].filter(Boolean);
  $('#payRow').innerHTML = methods.map((m) => `<span class="pay-chip">${esc(m)}</span>`).join('');

  $('#footContact').innerHTML = [s.address, s.hotline, s.email].filter(Boolean).map(esc).join(' · ');
  $('#year').textContent = new Date().getFullYear();

  if (s.hotline) {
    $('#hotlineLink').href = `tel:${s.hotline}`;
    $('#hotlineText').textContent = s.hotline;
  } else {
    $('#hotlineLink').classList.add('hide');
  }
}

function buildChatDock() {
  const s = state.settings;
  const wa = (s.whatsapp_number || '').replace(/\D/g, '');
  const out = [];
  if (wa) out.push(`<a class="chat-fab wa" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener" aria-label="Chat on WhatsApp">
    <svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-8.7 15l-1.3 5 5.2-1.4A10 10 0 1 0 12 2zm0 2a8 8 0 1 1-4.1 14.8l-.4-.2-2.6.7.7-2.5-.2-.4A8 8 0 0 1 12 4z"/></svg></a>`);
  if (s.messenger_username) out.push(`<a class="chat-fab ms" href="https://m.me/${esc(s.messenger_username)}" target="_blank" rel="noopener" aria-label="Chat on Messenger">
    <svg viewBox="0 0 24 24"><path d="M12 2C6.5 2 2 6.1 2 11.2c0 2.9 1.4 5.5 3.7 7.2V22l3.4-1.9c.9.3 1.9.4 2.9.4 5.5 0 10-4.1 10-9.2S17.5 2 12 2zm1 12.4l-2.5-2.7-4.9 2.7 5.4-5.7 2.6 2.7 4.8-2.7-5.4 5.7z"/></svg></a>`);
  if (s.hotline) out.push(`<a class="chat-fab call" href="tel:${esc(s.hotline)}" aria-label="Call us">
    <svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1.1 1A16 16 0 0 1 4 5.1 1 1 0 0 1 5 4z"/></svg></a>`);
  $('#chatDock').innerHTML = out.join('');
}

/* ========================================================================
   Global events
   ======================================================================== */
function initGlobalEvents() {
  // SPA link interception
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-link]');
    if (!link) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    const url = new URL(link.href, location.origin);
    if (url.origin !== location.origin) return;
    e.preventDefault();
    navigate(url.pathname + url.search);
  });

  window.addEventListener('popstate', render);

  // Delegated actions
  document.addEventListener('click', (e) => {
    const t = e.target;

    const add = t.closest('[data-add]');
    if (add) {
      const p = state.products.find((x) => x.id === add.dataset.add);
      // A piece with sizes needs a choice, so send them to the product page.
      if (p?.sizes?.length > 1) { navigate(`/product/${p.slug}`); toast('Choose a size first'); }
      else addToCart(add.dataset.add, { size: p?.sizes?.[0] || null });
      return;
    }

    const quick = t.closest('[data-quick]');
    if (quick) { quickView(quick.dataset.quick); return; }

    const qvAdd = t.closest('[data-qv-add]');
    if (qvAdd) {
      const size = $('[data-qv-sizes] .sw-size.on')?.dataset.size || null;
      addToCart(qvAdd.dataset.qvAdd, { size });
      $('#modal').classList.remove('open');
      return;
    }

    const qvSize = t.closest('[data-qv-sizes] .sw-size');
    if (qvSize) {
      $$('[data-qv-sizes] .sw-size').forEach((x) => x.classList.remove('on'));
      qvSize.classList.add('on');
      return;
    }

    const wish = t.closest('[data-wish]');
    if (wish) { toggleWish(wish.dataset.wish); return; }

    const qty = t.closest('[data-qty]');
    if (qty) { setQty(qty.dataset.qty, Number(qty.dataset.delta)); return; }

    const rm = t.closest('[data-remove]');
    if (rm) { removeLine(rm.dataset.remove); return; }

    const chip = t.closest('[data-search-chip]');
    if (chip) { $('#searchInput').value = chip.dataset.searchChip; renderSearch(chip.dataset.searchChip); return; }

    if (t.closest('[data-close]') || t === $('#scrim')) { closeOverlays(); return; }
  });

  $('#cartBtn').addEventListener('click', () => openDrawer('#cartDrawer'));
  $('#tabCart').addEventListener('click', () => openDrawer('#cartDrawer'));
  $('#searchBtn').addEventListener('click', openSearch);
  $('#tabSearch').addEventListener('click', openSearch);
  $('#burger').addEventListener('click', () => {
    const open = $('#menuDrawer').classList.contains('open');
    if (open) closeOverlays();
    else { openDrawer('#menuDrawer'); $('#burger').setAttribute('aria-expanded', 'true'); }
  });

  $('#searchInput').addEventListener('input', debounce((e) => renderSearch(e.target.value), 160));
  $('#searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#searchInput').value.trim();
    if (q) navigate(`/shop?q=${encodeURIComponent(q)}`);
  });

  $('#subForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#subMsg');
    const email = e.target.email.value.trim();
    msg.textContent = 'Signing you up…';
    try {
      await api('/subscribe', { method: 'POST', body: { email } });
      msg.textContent = 'You are on the list. Thank you.';
      e.target.reset();
    } catch (err) { msg.textContent = err.message; }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeOverlays();
    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); openSearch(); }
  });
}

/* ========================================================================
   Boot
   ======================================================================== */
function progress(to) {
  let bar = $('.progress');
  if (!bar) { bar = document.createElement('div'); bar.className = 'progress'; document.body.appendChild(bar); }
  bar.style.width = `${to}%`;
  if (to >= 100) setTimeout(() => { bar.style.opacity = '0'; setTimeout(() => bar.remove(), 300); }, 200);
}

async function boot() {
  progress(25);
  $('#main').innerHTML = `<div class="wrap sec">${skeletonGrid(8)}</div>`;
  try {
    const data = await api('/catalog');
    state.products = data.products || [];
    state.categories = data.categories || [];
    state.settings = data.settings || {};
    state.loaded = true;
  } catch (err) {
    $('#main').innerHTML = `<div class="wrap"><div class="empty">
      <h2>We could not load the shop</h2>
      <p>${esc(err.message)}</p>
      <button class="btn btn-primary" id="retryBtn">Try again</button></div></div>`;
    $('#retryBtn')?.addEventListener('click', () => location.reload());
    progress(100);
    return;
  }
  progress(70);

  // Drop cart lines whose product has gone away.
  const ids = new Set(state.products.map((p) => p.id));
  const before = state.cart.length;
  state.cart = state.cart.filter((l) => ids.has(l.product_id));
  if (state.cart.length !== before) store.set('shk_cart', state.cart);

  buildMega();
  buildMenuDrawer();
  buildFooter();
  buildChatDock();
  initAnnouncement();
  initHeader();
  paintCart();
  render();
  progress(100);
}

initGlobalEvents();
boot();
