/* =========================================================================
   Shoukhin dashboard
   ========================================================================= */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const taka = (n) => `৳${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const num = (v, f = 0) => (v === '' || v == null || !Number.isFinite(Number(v)) ? f : Number(v));

function when(iso) {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function dateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/* ------------------------------------------------------------------- api */
async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'content-type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* no body */ }
  // The login route answers 401 for a wrong password; that is not an expired session.
  if (res.status === 401 && !path.startsWith('/auth/login')) {
    showGate();
    throw new Error('Your session expired. Sign in again.');
  }
  if (!res.ok || data.ok === false) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/* ---------------------------------------------------------------- toasts */
function toast(msg, kind = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); el.addEventListener('animationend', () => el.remove(), { once: true }); }, 3000);
}

/* ----------------------------------------------------------- sheet/confirm */
function openSheet(title, html, onMount) {
  $('#sheetTitle').textContent = title;
  $('#sheetBody').innerHTML = html;
  $('#sheet').classList.add('open');
  $('#sheet').setAttribute('aria-hidden', 'false');
  const scrim = $('#scrim');
  scrim.hidden = false;
  requestAnimationFrame(() => scrim.classList.add('on'));
  document.body.style.overflow = 'hidden';
  onMount?.($('#sheetBody'));
}
function closeSheet() {
  $('#sheet').classList.remove('open');
  $('#sheet').setAttribute('aria-hidden', 'true');
  $('#scrim').classList.remove('on');
  setTimeout(() => { $('#scrim').hidden = true; }, 300);
  document.body.style.overflow = '';
}
function confirmAction(title, text, confirmLabel = 'Confirm') {
  return new Promise((resolve) => {
    $('#confirmTitle').textContent = title;
    $('#confirmText').textContent = text;
    $('#confirmYes').textContent = confirmLabel;
    const box = $('#confirm');
    box.classList.add('open');
    box.setAttribute('aria-hidden', 'false');
    const done = (val) => {
      box.classList.remove('open');
      box.setAttribute('aria-hidden', 'true');
      $('#confirmYes').onclick = null;
      $('#confirmNo').onclick = null;
      resolve(val);
    };
    $('#confirmYes').onclick = () => done(true);
    $('#confirmNo').onclick = () => done(false);
  });
}

/* ------------------------------------------------------------------ state */
const S = { products: [], categories: [], coupons: [], orders: [], stats: null,
            conversations: [], activeConv: null, settings: {}, view: 'overview' };

/* ------------------------------------------------------------------- gate */
function showGate() {
  $('#gate').hidden = false;
  $('#shell').hidden = true;
  document.body.classList.remove('booting');
  setTimeout(() => $('#pw')?.focus(), 80);
}
function showShell() {
  $('#gate').hidden = true;
  $('#shell').hidden = false;
  document.body.classList.remove('booting');
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#loginBtn'), msg = $('#gateMsg');
  btn.disabled = true; btn.textContent = 'Signing in…'; msg.textContent = '';
  try {
    await api('/auth/login', { method: 'POST', body: { password: $('#pw').value } });
    $('#pw').value = '';
    showShell();
    await loadAll();
    setView('overview');
  } catch (err) {
    msg.textContent = err.message;
    $('#pw').select();
  } finally {
    btn.disabled = false; btn.textContent = 'Sign in';
  }
});

$('#logoutBtn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  location.reload();
});

/* ----------------------------------------------------------------- router */
const VIEWS = {
  overview: ['Overview', renderOverview],
  orders: ['Orders', renderOrders],
  products: ['Products', renderProducts],
  categories: ['Categories', renderCategories],
  coupons: ['Coupons', renderCoupons],
  inbox: ['Inbox', renderInbox],
  settings: ['Settings', renderSettings],
};

function setView(name) {
  S.view = name;
  const [title, fn] = VIEWS[name] || VIEWS.overview;
  $('#viewTitle').textContent = title;
  $$('.side-nav button').forEach((b) => b.classList.toggle('on', b.dataset.view === name));
  $('#topbarTools').innerHTML = '';
  $('#side').classList.remove('open');
  fn();
  location.hash = name;
}

$$('.side-nav button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
$('#sideToggle').addEventListener('click', () => $('#side').classList.toggle('open'));
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]') || e.target === $('#scrim')) closeSheet();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

/* ---------------------------------------------------------------- loaders */
async function loadAll() {
  const [cats, prods, stats] = await Promise.all([
    api('/categories'), api('/products'), api('/stats'),
  ]);
  S.categories = cats.categories;
  S.products = prods.products;
  S.stats = stats;
  paintNavPips();
}

function paintNavPips() {
  const openOrders = (S.stats?.byStatus?.pending || 0) + (S.stats?.byStatus?.confirmed || 0);
  const po = $('#pipOrders');
  po.textContent = openOrders; po.hidden = !openOrders;
  const pi = $('#pipInbox');
  pi.textContent = S.stats?.unreadConversations || 0;
  pi.hidden = !S.stats?.unreadConversations;
}

const catName = (id) => S.categories.find((c) => c.id === id)?.name || '—';

/* ========================================================================
   Overview
   ======================================================================== */
async function renderOverview() {
  const c = $('#content');
  c.innerHTML = `<div class="kpis">${'<div class="sk"></div>'.repeat(4)}</div>`;
  try { S.stats = await api('/stats'); paintNavPips(); } catch (e) { c.innerHTML = `<p class="empty-row">${esc(e.message)}</p>`; return; }

  const t = S.stats.totals || {};
  const daily = S.stats.daily || [];
  const peak = Math.max(1, ...daily.map((d) => d.revenue));

  c.innerHTML = `
    <div class="kpis">
      <div class="kpi"><span>Revenue (30 days)</span><b>${taka(t.revenue_30d)}</b><small>${taka(t.revenue)} all time</small></div>
      <div class="kpi"><span>Orders today</span><b>${t.orders_today || 0}</b><small>${taka(t.revenue_today)} today</small></div>
      <div class="kpi"><span>Total orders</span><b>${t.orders || 0}</b><small>${S.stats.byStatus?.pending || 0} awaiting confirmation</small></div>
      <div class="kpi"><span>Unread messages</span><b>${S.stats.unreadConversations || 0}</b><small>Facebook &amp; WhatsApp</small></div>
    </div>

    <div class="panel">
      <div class="panel-head"><h3>Revenue, last 14 days</h3></div>
      <div class="panel-body">
        ${daily.length ? `<div class="chart">${daily.map((d) => `<div class="bar" title="${esc(d.day)}: ${taka(d.revenue)}">
          <i data-h="${(d.revenue / peak) * 100}"></i>
          <span>${new Date(d.day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></div>`).join('')}</div>`
          : '<div class="chart-empty">No orders in the last 14 days yet.</div>'}
      </div>
    </div>

    <div class="grid-2">
      <div class="panel">
        <div class="panel-head"><h3>Recent orders</h3>
          <button class="btn btn-ghost btn-sm" data-goto="orders">View all</button></div>
        <div class="panel-body flush"><div class="tbl-wrap"><table>
          <thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th></tr></thead>
          <tbody>${(S.stats.recent || []).map((o) => `<tr data-order="${esc(o.id)}">
            <td><b>${esc(o.id)}</b><br><small class="muted">${when(o.created_at)}</small></td>
            <td class="wrap">${esc(o.customer_name)}<br><small class="muted">${esc(o.customer_phone)}</small></td>
            <td class="money">${taka(o.total)}</td>
            <td><span class="pill ${esc(o.status)}">${esc(o.status)}</span></td>
          </tr>`).join('') || '<tr><td colspan="4" class="empty-row">No orders yet.</td></tr>'}</tbody>
        </table></div></div>
      </div>

      <div class="panel">
        <div class="panel-head"><h3>Low stock</h3>
          <button class="btn btn-ghost btn-sm" data-goto="products">Manage</button></div>
        <div class="panel-body flush"><div class="tbl-wrap"><table>
          <thead><tr><th>Product</th><th>Left</th></tr></thead>
          <tbody>${(S.stats.lowStock || []).map((p) => `<tr>
            <td class="wrap">${esc(p.title)}</td>
            <td><span class="pill ${p.stock <= 2 ? 'low' : 'off'}">${p.stock}</span></td></tr>`).join('')
            || '<tr><td colspan="2" class="empty-row">Everything is well stocked.</td></tr>'}</tbody>
        </table></div></div>
      </div>
    </div>

    ${(S.stats.topProducts || []).length ? `<div class="panel">
      <div class="panel-head"><h3>Best sellers</h3></div>
      <div class="panel-body flush"><div class="tbl-wrap"><table>
        <thead><tr><th>Product</th><th>Units</th><th>Revenue</th></tr></thead>
        <tbody>${S.stats.topProducts.map((p) => `<tr>
          <td class="wrap">${esc(p.title)}</td><td>${p.qty}</td><td class="money">${taka(p.revenue)}</td></tr>`).join('')}</tbody>
      </table></div></div></div>` : ''}`;

  // Bar heights set from JS so no inline style attribute is needed.
  requestAnimationFrame(() => $$('.chart .bar i', c).forEach((i) => { i.style.height = `${Math.max(3, Number(i.dataset.h))}%`; }));
  $$('[data-goto]', c).forEach((b) => b.addEventListener('click', () => setView(b.dataset.goto)));
  $$('[data-order]', c).forEach((r) => r.addEventListener('click', () => openOrder(r.dataset.order)));
}

/* ========================================================================
   Orders
   ======================================================================== */
const STATUSES = ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled', 'returned'];
const COURIERS = ['Pathao', 'Steadfast', 'RedX', 'Sundarban', 'SA Paribahan', 'Own delivery'];

async function renderOrders() {
  $('#topbarTools').innerHTML = `
    <input id="oSearch" type="search" placeholder="Order no, name or phone" value="">
    <select id="oStatus">
      <option value="all">All statuses</option>
      ${STATUSES.map((s) => `<option value="${s}">${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}
    </select>`;
  $('#oSearch').addEventListener('input', debounce(loadOrders, 280));
  $('#oStatus').addEventListener('change', loadOrders);
  await loadOrders();
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

async function loadOrders() {
  const c = $('#content');
  const q = $('#oSearch')?.value.trim() || '';
  const status = $('#oStatus')?.value || 'all';
  c.innerHTML = '<div class="sk"></div>';
  try {
    const res = await api(`/orders?status=${encodeURIComponent(status)}&q=${encodeURIComponent(q)}`);
    S.orders = res.orders;
  } catch (e) { c.innerHTML = `<p class="empty-row">${esc(e.message)}</p>`; return; }

  c.innerHTML = `<div class="panel"><div class="panel-body flush"><div class="tbl-wrap"><table>
    <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th>Placed</th><th></th></tr></thead>
    <tbody>${S.orders.map((o) => `<tr>
      <td><b>${esc(o.id)}</b></td>
      <td class="wrap">${esc(o.customer_name)}<br><small class="muted">${esc(o.customer_phone)} · ${esc(o.district)}</small></td>
      <td>${o.items?.length || 0}</td>
      <td class="money">${taka(o.total)}</td>
      <td><small>${o.payment_method === 'cod' ? 'COD' : esc(o.payment_method)}</small></td>
      <td><span class="pill ${esc(o.status)}">${esc(o.status)}</span></td>
      <td><small class="muted">${when(o.created_at)}</small></td>
      <td class="t-actions"><button class="btn btn-ghost btn-sm" data-open="${esc(o.id)}">Open</button></td>
    </tr>`).join('') || '<tr><td colspan="8" class="empty-row">No orders match this filter.</td></tr>'}</tbody>
  </table></div></div></div>`;

  $$('[data-open]', c).forEach((b) => b.addEventListener('click', () => openOrder(b.dataset.open)));
}

async function openOrder(id) {
  openSheet(`Order ${id}`, '<div class="sk"></div>');
  let order;
  try { order = (await api(`/orders/${encodeURIComponent(id)}`)).order; }
  catch (e) { $('#sheetBody').innerHTML = `<p class="empty-row">${esc(e.message)}</p>`; return; }

  const waNumber = (order.customer_phone || '').replace(/\D/g, '').replace(/^0/, '880');
  $('#sheetBody').innerHTML = `
    <div class="panel"><div class="panel-body">
      <div class="row-2">
        <div><span class="field"><span>Customer</span></span>
          <b>${esc(order.customer_name)}</b><br>
          <a href="tel:${esc(order.customer_phone)}">${esc(order.customer_phone)}</a>
          ${order.customer_email ? `<br><small class="muted">${esc(order.customer_email)}</small>` : ''}
        </div>
        <div><span class="field"><span>Deliver to</span></span>
          ${esc(order.address)}<br><small class="muted">${esc(order.thana ? order.thana + ', ' : '')}${esc(order.district)}</small>
        </div>
      </div>
      ${order.notes ? `<p class="setup-note">Note from customer: ${esc(order.notes)}</p>` : ''}
      <div class="t-actions" data-contact>
        <a class="btn btn-ghost btn-sm" href="tel:${esc(order.customer_phone)}">Call</a>
        <a class="btn btn-ghost btn-sm" href="https://wa.me/${esc(waNumber)}" target="_blank" rel="noopener">WhatsApp</a>
      </div>
    </div></div>

    <div class="panel"><div class="panel-head"><h3>Items</h3></div>
      <div class="panel-body flush"><div class="tbl-wrap"><table>
        <tbody>${order.items.map((it) => `<tr>
          <td><div class="t-prod">
            ${it.image ? `<img src="${esc(it.image)}" alt="" loading="lazy">` : ''}
            <div><b>${esc(it.title)}</b><small>${[it.size, it.color].filter(Boolean).map(esc).join(' · ') || 'One size'} × ${it.quantity}</small></div>
          </div></td>
          <td class="money">${taka(it.line_total)}</td></tr>`).join('')}
          <tr><td>Subtotal</td><td class="money">${taka(order.subtotal)}</td></tr>
          ${order.discount ? `<tr><td>Discount${order.coupon_code ? ` (${esc(order.coupon_code)})` : ''}</td><td class="money">−${taka(order.discount)}</td></tr>` : ''}
          <tr><td>Delivery</td><td class="money">${order.delivery_charge ? taka(order.delivery_charge) : 'Free'}</td></tr>
          <tr><td><b>Total</b></td><td class="money"><b>${taka(order.total)}</b></td></tr>
        </tbody></table></div></div></div>

    <div class="panel"><div class="panel-head"><h3>Fulfilment</h3></div><div class="panel-body">
      <div class="row-2">
        <label class="field"><span>Status</span>
          <select id="oStatusSel">${STATUSES.map((s) => `<option value="${s}" ${order.status === s ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select></label>
        <label class="field"><span>Payment</span>
          <select id="oPaySel">${['unpaid', 'paid', 'refunded'].map((s) => `<option value="${s}" ${order.payment_status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      </div>
      <div class="row-2">
        <label class="field"><span>Courier</span>
          <select id="oCourier"><option value="">Not assigned</option>
            ${COURIERS.map((x) => `<option value="${x}" ${order.courier === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label class="field"><span>Tracking code</span><input id="oTracking" value="${esc(order.tracking_code || '')}" placeholder="Courier consignment no"></label>
      </div>
      ${order.payment_trx_id ? `<label class="field"><span>Transaction ID</span><input value="${esc(order.payment_trx_id)}" readonly></label>` : ''}
      <label class="field"><span>Internal note for this change</span><input id="oNote" placeholder="Optional"></label>
    </div></div>

    <div class="panel"><div class="panel-head"><h3>History</h3></div><div class="panel-body">
      <div class="ev-list">${order.events.map((e) => `<div>
        <span class="pill ${esc(e.status)}">${esc(e.status)}</span>
        <span>${esc(e.note || '')}</span>
        <time>${dateTime(e.created_at)}</time></div>`).join('') || '<p class="muted">Nothing yet.</p>'}</div>
    </div></div>

    <div class="sheet-actions">
      <button class="btn btn-ghost" data-close>Close</button>
      <button class="btn btn-primary" id="oSave">Save changes</button>
    </div>`;

  $('#oSave').addEventListener('click', async (e) => {
    e.target.disabled = true; e.target.textContent = 'Saving…';
    const patch = {
      status: $('#oStatusSel').value,
      payment_status: $('#oPaySel').value,
      courier: $('#oCourier').value,
      tracking_code: $('#oTracking').value,
      note: $('#oNote').value,
    };
    if (['cancelled', 'returned'].includes(patch.status) && patch.status !== order.status) {
      const sure = await confirmAction('Put the stock back?',
        `Marking this ${patch.status} returns every item to stock. This cannot be undone from here.`, `Yes, mark ${patch.status}`);
      if (!sure) { e.target.disabled = false; e.target.textContent = 'Save changes'; return; }
    }
    try {
      await api(`/orders/${encodeURIComponent(id)}`, { method: 'PUT', body: patch });
      toast('Order updated', 'good');
      closeSheet();
      await loadAll();
      if (S.view === 'orders') loadOrders(); else renderOverview();
    } catch (err) {
      toast(err.message, 'bad');
      e.target.disabled = false; e.target.textContent = 'Save changes';
    }
  });
}

/* ========================================================================
   Products
   ======================================================================== */
async function renderProducts() {
  $('#topbarTools').innerHTML = `
    <input id="pSearch" type="search" placeholder="Search products">
    <select id="pCat"><option value="">All categories</option>
      ${S.categories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select>
    <button class="btn btn-primary btn-sm" id="pNew">+ Add product</button>`;
  $('#pNew').addEventListener('click', () => productForm(null));
  $('#pSearch').addEventListener('input', debounce(paintProducts, 220));
  $('#pCat').addEventListener('change', paintProducts);
  await reloadProducts();
}

async function reloadProducts() {
  $('#content').innerHTML = '<div class="sk"></div>';
  S.products = (await api('/products')).products;
  paintProducts();
}

function paintProducts() {
  const q = ($('#pSearch')?.value || '').toLowerCase();
  const cat = $('#pCat')?.value || '';
  const list = S.products.filter((p) =>
    (!q || p.title.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q)) &&
    (!cat || p.category_id === cat));

  $('#content').innerHTML = `<div class="panel"><div class="panel-body flush"><div class="tbl-wrap"><table>
    <thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Flags</th><th></th></tr></thead>
    <tbody>${list.map((p) => `<tr>
      <td><div class="t-prod">
        <img src="${esc(p.images[0] || '/assets/texture/fabric-1.webp')}" alt="" loading="lazy">
        <div><b>${esc(p.title)}</b><small>${esc(p.sku || p.slug)}</small></div></div></td>
      <td>${esc(catName(p.category_id))}</td>
      <td class="money">${p.discount_price ? `${taka(p.discount_price)} <small class="muted"><s>${taka(p.price)}</s></small>` : taka(p.price)}</td>
      <td><span class="pill ${p.stock <= 5 ? 'low' : 'off'}">${p.stock}</span></td>
      <td>
        ${p.is_active ? '<span class="pill on">live</span>' : '<span class="pill off">hidden</span>'}
        ${p.is_flash_sale ? '<span class="pill packed">flash</span>' : ''}
        ${p.is_featured ? '<span class="pill confirmed">featured</span>' : ''}
      </td>
      <td class="t-actions">
        <button class="btn btn-ghost btn-sm" data-edit="${esc(p.id)}">Edit</button>
        <button class="btn btn-ghost btn-sm" data-del="${esc(p.id)}">Archive</button></td>
    </tr>`).join('') || '<tr><td colspan="6" class="empty-row">No products match.</td></tr>'}</tbody>
  </table></div></div></div>`;

  $$('[data-edit]').forEach((b) => b.addEventListener('click', () =>
    productForm(S.products.find((p) => p.id === b.dataset.edit))));
  $$('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const p = S.products.find((x) => x.id === b.dataset.del);
    if (!await confirmAction('Archive this product?',
      `"${p.title}" will be hidden from the shop. Past orders keep their record.`, 'Archive')) return;
    try { await api(`/products/${p.id}`, { method: 'DELETE' }); toast('Product archived', 'good'); reloadProducts(); }
    catch (e) { toast(e.message, 'bad'); }
  }));
}

function productForm(p) {
  const isNew = !p;
  const v = p || { title: '', slug: '', sku: '', short_description: '', description: '', category_id: '',
    price: '', discount_price: '', stock: 0, sizes: [], colors: [], images: [], fabric: '', care: '',
    tag: '', is_featured: 0, is_flash_sale: 0, flash_sale_ends_at: '', is_active: 1, sort_order: 0 };

  openSheet(isNew ? 'Add product' : 'Edit product', `
    <label class="field"><span>Title *</span><input id="f-title" value="${esc(v.title)}" placeholder="Rose &amp; Azure Cotton Set"></label>
    <label class="field"><span>Title in Bangla</span><input id="f-title_bn" value="${esc(v.title_bn || '')}" placeholder="Optional"></label>
    <div class="row-2">
      <label class="field"><span>Category</span><select id="f-category_id">
        <option value="">Uncategorised</option>
        ${S.categories.map((c) => `<option value="${esc(c.id)}" ${v.category_id === c.id ? 'selected' : ''}>${esc(c.parent_id ? '— ' : '')}${esc(c.name)}</option>`).join('')}
      </select></label>
      <label class="field"><span>SKU</span><input id="f-sku" value="${esc(v.sku || '')}" placeholder="SHK-TP-001"></label>
    </div>
    <div class="row-3">
      <label class="field"><span>Regular price (৳) *</span><input id="f-price" type="number" min="0" step="1" value="${esc(v.price)}"></label>
      <label class="field"><span>Discount price (৳)</span><input id="f-discount_price" type="number" min="0" step="1" value="${esc(v.discount_price ?? '')}"
        placeholder="Leave empty"><small class="hint">Must be below the regular price</small></label>
      <label class="field"><span>Stock *</span><input id="f-stock" type="number" min="0" step="1" value="${esc(v.stock)}"></label>
    </div>
    <label class="field"><span>Short description</span><input id="f-short_description" value="${esc(v.short_description || '')}"
      placeholder="One line shown under the title"></label>
    <label class="field"><span>Full description</span><textarea id="f-description">${esc(v.description || '')}</textarea></label>

    <label class="field"><span>Images</span></label>
    <div class="img-list" id="imgList"></div>
    <div class="row-2">
      <label class="field"><span>Upload</span><input type="file" id="imgFile" accept="image/webp,image/jpeg,image/png,image/avif" multiple></label>
      <label class="field"><span>Or paste a path</span><input id="imgPath" placeholder="/assets/products/p01.webp"></label>
    </div>

    <label class="field"><span>Sizes</span></label>
    <div class="tag-input" id="sizeTags"><input placeholder="Type a size and press Enter"></div>
    <label class="field"><span>Colours</span></label>
    <div id="colorList"></div>
    <button class="btn btn-ghost btn-sm" id="addColor" type="button">+ Add colour</button>

    <div class="row-2">
      <label class="field"><span>Fabric</span><input id="f-fabric" value="${esc(v.fabric || '')}" placeholder="100% Handloom Cotton"></label>
      <label class="field"><span>Care</span><input id="f-care" value="${esc(v.care || '')}" placeholder="Hand wash cold"></label>
    </div>
    <div class="row-2">
      <label class="field"><span>Badge</span><input id="f-tag" value="${esc(v.tag || '')}" placeholder="New, Best Seller, Premium"></label>
      <label class="field"><span>Sort order</span><input id="f-sort_order" type="number" value="${esc(v.sort_order || 0)}"></label>
    </div>
    <label class="field"><span>Flash sale ends</span><input id="f-flash_sale_ends_at" type="datetime-local"
      value="${esc((v.flash_sale_ends_at || '').slice(0, 16))}"></label>

    <label class="check"><input type="checkbox" id="f-is_active" ${v.is_active ? 'checked' : ''}> Visible in the shop</label>
    <label class="check"><input type="checkbox" id="f-is_featured" ${v.is_featured ? 'checked' : ''}> Show in best sellers</label>
    <label class="check"><input type="checkbox" id="f-is_flash_sale" ${v.is_flash_sale ? 'checked' : ''}> Include in flash sale</label>

    <div class="sheet-actions">
      <button class="btn btn-ghost" data-close>Cancel</button>
      <button class="btn btn-primary" id="pSave">${isNew ? 'Create product' : 'Save changes'}</button>
    </div>`, (root) => {
      

      let images = [...(v.images || [])];
      let sizes = [...(v.sizes || [])];
      let colors = [...(v.colors || [])];

      const paintImages = () => {
        $('#imgList', root).innerHTML = images.map((src, i) => `<div class="img-chip">
          <img src="${esc(src)}" alt="" loading="lazy"><button type="button" data-rmimg="${i}" aria-label="Remove">×</button></div>`).join('')
          || '<p class="muted">No images yet. The first one is used on the product card.</p>';
        $$('[data-rmimg]', root).forEach((b) => b.addEventListener('click', () => {
          images.splice(Number(b.dataset.rmimg), 1); paintImages();
        }));
      };
      paintImages();

      $('#imgPath', root).addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const val = e.target.value.trim();
        if (val) { images.push(val); e.target.value = ''; paintImages(); }
      });

      $('#imgFile', root).addEventListener('change', async (e) => {
        const files = [...e.target.files];
        e.target.value = '';
        for (const file of files) {
          const fd = new FormData();
          fd.append('file', file);
          try {
            const res = await fetch('/api/media', { method: 'POST', body: fd });
            const data = await res.json();
            if (!res.ok || !data.ok) throw new Error(data.error || 'Upload failed');
            images.push(data.path);
            paintImages();
            toast(`${file.name} uploaded`, 'good');
          } catch (err) { toast(err.message, 'bad'); }
        }
      });

      const sizeBox = $('#sizeTags', root);
      const sizeInput = sizeBox.querySelector('input');
      const paintSizes = () => {
        $$('.tag', sizeBox).forEach((t) => t.remove());
        sizes.forEach((s, i) => {
          const tag = document.createElement('span');
          tag.className = 'tag';
          tag.innerHTML = `${esc(s)}<button type="button" aria-label="Remove">×</button>`;
          tag.querySelector('button').addEventListener('click', () => { sizes.splice(i, 1); paintSizes(); });
          sizeBox.insertBefore(tag, sizeInput);
        });
      };
      paintSizes();
      sizeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          const val = e.target.value.trim();
          if (val && !sizes.includes(val)) { sizes.push(val); e.target.value = ''; paintSizes(); }
        } else if (e.key === 'Backspace' && !e.target.value && sizes.length) { sizes.pop(); paintSizes(); }
      });

      const paintColors = () => {
        $('#colorList', root).innerHTML = colors.map((c, i) => `<div class="row-2">
          <label class="field"><span>Name</span><input data-cname="${i}" value="${esc(c.name || '')}" placeholder="Wine"></label>
          <label class="field"><span>Hex</span><input data-chex="${i}" type="color" value="${esc(c.hex || '#682636')}"></label>
          <button class="btn btn-ghost btn-sm" type="button" data-crm="${i}">Remove colour</button>
        </div>`).join('');
        $$('[data-cname]', root).forEach((i) => i.addEventListener('input', (e) => { colors[Number(e.target.dataset.cname)].name = e.target.value; }));
        $$('[data-chex]', root).forEach((i) => i.addEventListener('input', (e) => { colors[Number(e.target.dataset.chex)].hex = e.target.value; }));
        $$('[data-crm]', root).forEach((b) => b.addEventListener('click', () => { colors.splice(Number(b.dataset.crm), 1); paintColors(); }));
      };
      paintColors();
      $('#addColor', root).addEventListener('click', () => { colors.push({ name: '', hex: '#682636' }); paintColors(); });

      $('#pSave', root).addEventListener('click', async (e) => {
        const body = {
          title: $('#f-title', root).value.trim(),
          title_bn: $('#f-title_bn', root).value.trim(),
          sku: $('#f-sku', root).value.trim(),
          category_id: $('#f-category_id', root).value,
          price: num($('#f-price', root).value),
          discount_price: $('#f-discount_price', root).value === '' ? null : num($('#f-discount_price', root).value),
          stock: num($('#f-stock', root).value),
          short_description: $('#f-short_description', root).value.trim(),
          description: $('#f-description', root).value.trim(),
          fabric: $('#f-fabric', root).value.trim(),
          care: $('#f-care', root).value.trim(),
          tag: $('#f-tag', root).value.trim(),
          sort_order: num($('#f-sort_order', root).value),
          flash_sale_ends_at: $('#f-flash_sale_ends_at', root).value ? new Date($('#f-flash_sale_ends_at', root).value).toISOString() : null,
          is_active: $('#f-is_active', root).checked,
          is_featured: $('#f-is_featured', root).checked,
          is_flash_sale: $('#f-is_flash_sale', root).checked,
          sizes, colors, images,
        };
        if (!body.title) { toast('Title is required', 'bad'); return; }
        if (!(body.price > 0)) { toast('Enter a price above zero', 'bad'); return; }
        if (body.discount_price != null && body.discount_price >= body.price) {
          toast('Discount price must be below the regular price', 'bad'); return;
        }
        e.target.disabled = true; e.target.textContent = 'Saving…';
        try {
          if (isNew) await api('/products', { method: 'POST', body });
          else await api(`/products/${p.id}`, { method: 'PUT', body });
          toast(isNew ? 'Product created' : 'Product saved', 'good');
          closeSheet();
          reloadProducts();
        } catch (err) {
          toast(err.message, 'bad');
          e.target.disabled = false; e.target.textContent = isNew ? 'Create product' : 'Save changes';
        }
      });
    });
}

/* ========================================================================
   Categories
   ======================================================================== */
async function renderCategories() {
  $('#topbarTools').innerHTML = `<button class="btn btn-primary btn-sm" id="cNew">+ Add category</button>`;
  $('#cNew').addEventListener('click', () => categoryForm(null));
  await reloadCategories();
}

async function reloadCategories() {
  $('#content').innerHTML = '<div class="sk"></div>';
  S.categories = (await api('/categories')).categories;
  const tops = S.categories.filter((c) => !c.parent_id);
  const rows = [];
  for (const t of tops) {
    rows.push([t, 0]);
    for (const k of S.categories.filter((c) => c.parent_id === t.id)) rows.push([k, 1]);
  }
  $('#content').innerHTML = `<div class="panel"><div class="panel-body flush"><div class="tbl-wrap"><table>
    <thead><tr><th>Name</th><th>Slug</th><th>Products</th><th>Visible</th><th></th></tr></thead>
    <tbody>${rows.map(([c, depth]) => `<tr>
      <td>${depth ? '<span class="muted">— </span>' : ''}<b>${esc(c.name)}</b>
        ${c.name_bn ? `<br><small class="muted">${esc(c.name_bn)}</small>` : ''}</td>
      <td><code>${esc(c.slug)}</code></td>
      <td>${c.product_count}</td>
      <td>${c.is_active ? '<span class="pill on">live</span>' : '<span class="pill off">hidden</span>'}</td>
      <td class="t-actions">
        <button class="btn btn-ghost btn-sm" data-cedit="${esc(c.id)}">Edit</button>
        <button class="btn btn-ghost btn-sm" data-cdel="${esc(c.id)}">Delete</button></td>
    </tr>`).join('')}</tbody></table></div></div></div>`;

  $$('[data-cedit]').forEach((b) => b.addEventListener('click', () =>
    categoryForm(S.categories.find((c) => c.id === b.dataset.cedit))));
  $$('[data-cdel]').forEach((b) => b.addEventListener('click', async () => {
    const c = S.categories.find((x) => x.id === b.dataset.cdel);
    if (!await confirmAction('Delete this category?', `"${c.name}" will be removed. Products must be moved first.`, 'Delete')) return;
    try { await api(`/categories/${c.id}`, { method: 'DELETE' }); toast('Category deleted', 'good'); reloadCategories(); }
    catch (e) { toast(e.message, 'bad'); }
  }));
}

function categoryForm(c) {
  const isNew = !c;
  const v = c || { name: '', name_bn: '', slug: '', parent_id: '', image: '', sort_order: 0, is_active: 1 };
  openSheet(isNew ? 'Add category' : 'Edit category', `
    <label class="field"><span>Name *</span><input id="c-name" value="${esc(v.name)}" placeholder="Three Piece"></label>
    <label class="field"><span>Name in Bangla</span><input id="c-name_bn" value="${esc(v.name_bn || '')}" placeholder="তিন পিস"></label>
    <div class="row-2">
      <label class="field"><span>Parent category</span><select id="c-parent_id"><option value="">None (top level)</option>
        ${S.categories.filter((x) => !x.parent_id && x.id !== v.id).map((x) =>
          `<option value="${esc(x.id)}" ${v.parent_id === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}
      </select></label>
      <label class="field"><span>Sort order</span><input id="c-sort_order" type="number" value="${esc(v.sort_order || 0)}"></label>
    </div>
    <label class="field"><span>Tile image</span><input id="c-image" value="${esc(v.image || '')}" placeholder="/assets/categories/three-piece.webp">
      <small class="hint">Shown on the homepage category grid. Upload one under Products to get a path.</small></label>
    <label class="check"><input type="checkbox" id="c-is_active" ${v.is_active ? 'checked' : ''}> Visible in the shop</label>
    <div class="sheet-actions">
      <button class="btn btn-ghost" data-close>Cancel</button>
      <button class="btn btn-primary" id="cSave">${isNew ? 'Create' : 'Save'}</button>
    </div>`, (root) => {
      $('#cSave', root).addEventListener('click', async (e) => {
        const body = {
          name: $('#c-name', root).value.trim(),
          name_bn: $('#c-name_bn', root).value.trim(),
          parent_id: $('#c-parent_id', root).value,
          image: $('#c-image', root).value.trim(),
          sort_order: num($('#c-sort_order', root).value),
          is_active: $('#c-is_active', root).checked,
        };
        if (!body.name) { toast('Name is required', 'bad'); return; }
        e.target.disabled = true;
        try {
          if (isNew) await api('/categories', { method: 'POST', body });
          else await api(`/categories/${c.id}`, { method: 'PUT', body });
          toast('Saved', 'good'); closeSheet(); reloadCategories();
        } catch (err) { toast(err.message, 'bad'); e.target.disabled = false; }
      });
    });
}

/* ========================================================================
   Coupons
   ======================================================================== */
async function renderCoupons() {
  $('#topbarTools').innerHTML = `<button class="btn btn-primary btn-sm" id="kNew">+ Add coupon</button>`;
  $('#kNew').addEventListener('click', () => couponForm(null));
  await reloadCoupons();
}

async function reloadCoupons() {
  $('#content').innerHTML = '<div class="sk"></div>';
  S.coupons = (await api('/coupons')).coupons;
  const label = (k) => k.type === 'percent' ? `${k.value}% off`
    : k.type === 'fixed' ? `${taka(k.value)} off` : 'Free delivery';
  $('#content').innerHTML = `<div class="panel"><div class="panel-body flush"><div class="tbl-wrap"><table>
    <thead><tr><th>Code</th><th>Gives</th><th>Min order</th><th>Used</th><th>Expires</th><th>Status</th><th></th></tr></thead>
    <tbody>${S.coupons.map((k) => {
      const expired = k.expires_at && new Date(k.expires_at) < new Date();
      const spent = k.usage_limit != null && k.used_count >= k.usage_limit;
      return `<tr>
        <td><b><code>${esc(k.code)}</code></b>${k.description ? `<br><small class="muted">${esc(k.description)}</small>` : ''}</td>
        <td>${esc(label(k))}${k.max_discount ? `<br><small class="muted">max ${taka(k.max_discount)}</small>` : ''}</td>
        <td class="money">${k.min_order ? taka(k.min_order) : '—'}</td>
        <td>${k.used_count}${k.usage_limit != null ? ` / ${k.usage_limit}` : ''}</td>
        <td><small>${k.expires_at ? new Date(k.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never'}</small></td>
        <td>${!k.is_active ? '<span class="pill off">off</span>' : expired ? '<span class="pill cancelled">expired</span>'
          : spent ? '<span class="pill returned">used up</span>' : '<span class="pill on">active</span>'}</td>
        <td class="t-actions">
          <button class="btn btn-ghost btn-sm" data-kedit="${esc(k.id)}">Edit</button>
          <button class="btn btn-ghost btn-sm" data-kdel="${esc(k.id)}">Delete</button></td>
      </tr>`;
    }).join('') || '<tr><td colspan="7" class="empty-row">No coupons yet.</td></tr>'}</tbody>
  </table></div></div></div>`;

  $$('[data-kedit]').forEach((b) => b.addEventListener('click', () =>
    couponForm(S.coupons.find((k) => k.id === b.dataset.kedit))));
  $$('[data-kdel]').forEach((b) => b.addEventListener('click', async () => {
    const k = S.coupons.find((x) => x.id === b.dataset.kdel);
    if (!await confirmAction('Delete this coupon?', `Code ${k.code} will stop working immediately.`, 'Delete')) return;
    try { await api(`/coupons/${k.id}`, { method: 'DELETE' }); toast('Coupon deleted', 'good'); reloadCoupons(); }
    catch (e) { toast(e.message, 'bad'); }
  }));
}

function couponForm(k) {
  const isNew = !k;
  const v = k || { code: '', description: '', type: 'percent', value: 10, min_order: 0,
    max_discount: '', usage_limit: '', starts_at: '', expires_at: '', is_active: 1 };
  openSheet(isNew ? 'Add coupon' : 'Edit coupon', `
    <label class="field"><span>Code *</span><input id="k-code" value="${esc(v.code)}" placeholder="EID200" ${isNew ? '' : 'readonly'}>
      ${isNew ? '<small class="hint">Customers type this at checkout. Uppercase, no spaces.</small>' : '<small class="hint">The code itself cannot be changed.</small>'}</label>
    <label class="field"><span>Description</span><input id="k-description" value="${esc(v.description || '')}" placeholder="Eid offer"></label>
    <div class="row-2">
      <label class="field"><span>Type</span><select id="k-type">
        <option value="percent" ${v.type === 'percent' ? 'selected' : ''}>Percent off</option>
        <option value="fixed" ${v.type === 'fixed' ? 'selected' : ''}>Fixed Taka off</option>
        <option value="free_shipping" ${v.type === 'free_shipping' ? 'selected' : ''}>Free delivery</option>
      </select></label>
      <label class="field" id="kValWrap"><span>Value</span><input id="k-value" type="number" min="0" value="${esc(v.value)}"></label>
    </div>
    <div class="row-2">
      <label class="field"><span>Minimum order (৳)</span><input id="k-min_order" type="number" min="0" value="${esc(v.min_order || 0)}"></label>
      <label class="field"><span>Max discount (৳)</span><input id="k-max_discount" type="number" min="0" value="${esc(v.max_discount ?? '')}"
        placeholder="No cap"><small class="hint">Caps a percent coupon</small></label>
    </div>
    <div class="row-2">
      <label class="field"><span>Usage limit</span><input id="k-usage_limit" type="number" min="1" value="${esc(v.usage_limit ?? '')}" placeholder="Unlimited"></label>
      <label class="field"><span>Expires</span><input id="k-expires_at" type="date" value="${esc((v.expires_at || '').slice(0, 10))}"></label>
    </div>
    <label class="check"><input type="checkbox" id="k-is_active" ${v.is_active ? 'checked' : ''}> Active</label>
    <div class="sheet-actions">
      <button class="btn btn-ghost" data-close>Cancel</button>
      <button class="btn btn-primary" id="kSave">${isNew ? 'Create' : 'Save'}</button>
    </div>`, (root) => {
      const typeSel = $('#k-type', root);
      const syncType = () => { $('#kValWrap', root).classList.toggle('hide', typeSel.value === 'free_shipping'); };
      typeSel.addEventListener('change', syncType); syncType();

      $('#kSave', root).addEventListener('click', async (e) => {
        const type = typeSel.value;
        const body = {
          code: $('#k-code', root).value.trim().toUpperCase(),
          description: $('#k-description', root).value.trim(),
          type,
          value: type === 'free_shipping' ? 0 : num($('#k-value', root).value),
          min_order: num($('#k-min_order', root).value),
          max_discount: $('#k-max_discount', root).value === '' ? null : num($('#k-max_discount', root).value),
          usage_limit: $('#k-usage_limit', root).value === '' ? null : num($('#k-usage_limit', root).value),
          expires_at: $('#k-expires_at', root).value ? `${$('#k-expires_at', root).value}T23:59:59Z` : null,
          is_active: $('#k-is_active', root).checked,
        };
        if (!body.code) { toast('Code is required', 'bad'); return; }
        if (type === 'percent' && (body.value <= 0 || body.value > 100)) { toast('Percent must be 1 to 100', 'bad'); return; }
        if (type === 'fixed' && body.value <= 0) { toast('Enter an amount above zero', 'bad'); return; }
        e.target.disabled = true;
        try {
          if (isNew) await api('/coupons', { method: 'POST', body });
          else await api(`/coupons/${k.id}`, { method: 'PUT', body });
          toast('Saved', 'good'); closeSheet(); reloadCoupons();
        } catch (err) { toast(err.message, 'bad'); e.target.disabled = false; }
      });
    });
}

/* ========================================================================
   Inbox (Facebook Messenger + WhatsApp)
   ======================================================================== */
let inboxPoll = null;

async function renderInbox() {
  clearInterval(inboxPoll);
  const connected = S.settings.meta_page_token || S.settings.whatsapp_token;
  $('#topbarTools').innerHTML = `<button class="btn btn-ghost btn-sm" id="inboxSetup">Connection guide</button>`;
  $('#inboxSetup').addEventListener('click', showMetaGuide);

  $('#content').innerHTML = `
    ${connected ? '' : `<div class="setup-note">
      <b>Not connected yet.</b> Messages will appear here once Facebook and WhatsApp are linked to this dashboard.
      That setup happens in your Meta account, it cannot be done from here.
      <button class="btn btn-ghost btn-sm" id="guideBtn2">Show me the steps</button>
    </div>`}
    <div class="inbox" id="inbox">
      <div class="conv-list" id="convList">
        <div class="conv-tabs">
          <button class="on" data-ch="all">All</button>
          <button data-ch="messenger">Facebook</button>
          <button data-ch="whatsapp">WhatsApp</button>
        </div>
        <div id="convItems"></div>
      </div>
      <div class="thread" id="thread">
        <div class="inbox-empty">
          <svg viewBox="0 0 24 24"><path d="M4 5h16v11H7l-3 3z"/></svg>
          <p>Pick a conversation to read and reply.</p>
        </div>
      </div>
    </div>`;
  $('#guideBtn2')?.addEventListener('click', showMetaGuide);
  $$('.conv-tabs button').forEach((b) => b.addEventListener('click', () => {
    $$('.conv-tabs button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    loadConversations(b.dataset.ch);
  }));
  await loadConversations('all');
  // Light polling keeps the list fresh without a websocket.
  inboxPoll = setInterval(() => { if (S.view === 'inbox') loadConversations(currentChannel(), true); }, 20000);
}

const currentChannel = () => $('.conv-tabs button.on')?.dataset.ch || 'all';

async function loadConversations(channel = 'all', quiet = false) {
  const box = $('#convItems');
  if (!box) return;
  if (!quiet) box.innerHTML = '<div class="sk"></div>';
  try { S.conversations = (await api(`/conversations?channel=${channel}&status=all`)).conversations; }
  catch (e) { box.innerHTML = `<p class="empty-row">${esc(e.message)}</p>`; return; }

  if (!S.conversations.length) {
    box.innerHTML = '<p class="empty-row">No conversations yet.</p>';
    return;
  }
  box.innerHTML = S.conversations.map((c) => {
    const name = c.customer_name || c.customer_phone || (c.channel === 'whatsapp' ? 'WhatsApp user' : 'Facebook user');
    return `<div class="conv ${S.activeConv === c.id ? 'on' : ''}" data-conv="${esc(c.id)}">
      <span class="conv-av ${esc(c.channel)}">${esc(name[0].toUpperCase())}</span>
      <div>
        <b>${esc(name)} ${c.unread ? `<span class="unread">${c.unread}</span>` : ''}</b>
        <p>${c.last_direction === 'out' ? 'You: ' : ''}${esc(c.last_message || '')}</p>
        <span class="when">${esc(c.channel === 'whatsapp' ? 'WhatsApp' : 'Facebook')} · ${when(c.last_message_at)}</span>
      </div></div>`;
  }).join('');
  $$('[data-conv]').forEach((el) => el.addEventListener('click', () => openThread(el.dataset.conv)));
}

async function openThread(id) {
  S.activeConv = id;
  $('#inbox')?.classList.add('has-thread');
  $$('[data-conv]').forEach((el) => el.classList.toggle('on', el.dataset.conv === id));
  const thread = $('#thread');
  thread.innerHTML = '<div class="sk"></div>';
  let data;
  try { data = await api(`/conversations/${encodeURIComponent(id)}`); }
  catch (e) { thread.innerHTML = `<p class="empty-row">${esc(e.message)}</p>`; return; }

  const c = data.conversation;
  const name = c.customer_name || c.customer_phone || 'Customer';
  thread.innerHTML = `
    <div class="thread-head">
      <button class="icon-btn only-sm" id="backToList" aria-label="Back">
        <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>
      <span class="conv-av ${esc(c.channel)}">${esc(name[0].toUpperCase())}</span>
      <div><b>${esc(name)}</b><br><small class="muted">${esc(c.channel === 'whatsapp' ? 'WhatsApp' : 'Facebook Messenger')}</small></div>
      <span class="pill ${c.status === 'open' ? 'on' : 'off'}">${esc(c.status)}</span>
      <button class="btn btn-ghost btn-sm" id="toggleStatus">${c.status === 'open' ? 'Mark done' : 'Reopen'}</button>
    </div>
    <div class="thread-body" id="threadBody">
      ${data.messages.map((m) => `<div class="msg ${m.direction} ${m.status === 'failed' ? 'failed' : ''}">
        ${esc(m.body || '')}${m.attachment_url ? `<br><a href="${esc(m.attachment_url)}" target="_blank" rel="noopener">attachment</a>` : ''}
        <time>${dateTime(m.created_at)}${m.status === 'failed' ? ` · failed: ${esc(m.error || '')}` : ''}</time>
      </div>`).join('') || '<p class="muted">No messages in this thread.</p>'}
    </div>
    <form class="thread-form" id="replyForm">
      <input id="replyInput" placeholder="Write a reply…" autocomplete="off">
      <button class="btn btn-primary" type="submit">Send</button>
    </form>`;

  const body = $('#threadBody');
  body.scrollTop = body.scrollHeight;
  $('#backToList')?.addEventListener('click', () => $('#inbox').classList.remove('has-thread'));

  $('#toggleStatus').addEventListener('click', async () => {
    try {
      await api(`/conversations/${encodeURIComponent(id)}`, { method: 'PUT', body: { status: c.status === 'open' ? 'closed' : 'open' } });
      openThread(id); loadConversations(currentChannel(), true);
    } catch (e) { toast(e.message, 'bad'); }
  });

  $('#replyForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#replyInput');
    const text = input.value.trim();
    if (!text) return;
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      await api(`/conversations/${encodeURIComponent(id)}/send`, { method: 'POST', body: { body: text } });
      input.value = '';
      await openThread(id);
      loadConversations(currentChannel(), true);
    } catch (err) {
      toast(err.message, 'bad');
      if (/not connected/i.test(err.message)) showMetaGuide();
    } finally { btn.disabled = false; }
  });

  loadConversations(currentChannel(), true);
  try { S.stats = await api('/stats'); paintNavPips(); } catch { /* non-critical */ }
}

function showMetaGuide() {
  const origin = location.origin;
  openSheet('Connecting Facebook and WhatsApp', `
    <div class="setup-note">
      These steps happen inside your own Meta account. Nobody else can do them for you,
      because they need your business identity and your phone number.
    </div>
    <h3>1. Create a Meta app</h3>
    <p class="muted">Go to developers.facebook.com, create an app of type <b>Business</b>, and note its
    <b>App Secret</b> under Settings → Basic.</p>

    <h3>2. Point the webhook here</h3>
    <p class="muted">In the app, add the <b>Webhooks</b> product and use:</p>
    <label class="field"><span>Callback URL</span><input readonly value="${esc(origin)}/api/webhooks/meta"></label>
    <label class="field"><span>Verify token</span><input readonly value="${esc(S.settings.meta_verify_token || '(set one in Settings first)')}"></label>
    <p class="muted">Subscribe to <code>messages</code> and <code>messaging_postbacks</code>.</p>

    <h3>3. Facebook Messenger</h3>
    <p class="muted">Add the <b>Messenger</b> product, connect your Shoukhin Page, and generate a
    <b>Page access token</b>. Paste it into Settings along with your Page ID.</p>

    <h3>4. WhatsApp</h3>
    <p class="muted">Add the <b>WhatsApp</b> product, register your business number, then copy the
    <b>Phone number ID</b> and an access token into Settings.</p>

    <h3>5. Go live</h3>
    <p class="muted">While the app is in Development mode only your own test accounts can message it.
    Submit for review to open it to customers. Approval for <code>pages_messaging</code> usually takes a few days.</p>

    <div class="setup-note">
      <b>One limit worth knowing.</b> Facebook only lets you reply within 24 hours of the customer's
      last message, unless you use an approved message template. WhatsApp works the same way.
    </div>
    <div class="sheet-actions">
      <button class="btn btn-ghost" data-close>Close</button>
      <button class="btn btn-primary" id="goSettings">Open settings</button>
    </div>`, (root) => {
      $('#goSettings', root).addEventListener('click', () => { closeSheet(); setView('settings'); });
    });
}

/* ========================================================================
   Settings
   ======================================================================== */
const SETTING_GROUPS = [
  ['Store', [
    ['store_name', 'Store name', 'text', ''],
    ['tagline', 'Tagline', 'text', 'Shown under the logo'],
    ['announcement', 'Announcement bar', 'text', 'The rotating line at the very top'],
    ['address', 'Address', 'text', ''],
    ['email', 'Email', 'email', ''],
    ['hotline', 'Hotline number', 'tel', 'Shown in the header and used for call-to-order'],
  ]],
  ['Delivery', [
    ['delivery_inside_dhaka', 'Inside Dhaka (৳)', 'number', ''],
    ['delivery_outside_dhaka', 'Outside Dhaka (৳)', 'number', ''],
    ['free_delivery_threshold', 'Free delivery above (৳)', 'number', 'Set 0 to switch free delivery off'],
    ['return_days', 'Return window (days)', 'number', ''],
  ]],
  ['Payment numbers', [
    ['bkash_number', 'bKash number', 'tel', 'Leave empty to hide bKash at checkout'],
    ['nagad_number', 'Nagad number', 'tel', 'Leave empty to hide Nagad at checkout'],
    ['rocket_number', 'Rocket number', 'tel', 'Leave empty to hide Rocket at checkout'],
  ]],
  ['Social and chat', [
    ['whatsapp_number', 'WhatsApp number', 'tel', 'With country code, e.g. 8801712345678'],
    ['messenger_username', 'Messenger username', 'text', 'The part after m.me/'],
    ['facebook_url', 'Facebook page URL', 'url', ''],
    ['instagram_url', 'Instagram URL', 'url', ''],
  ]],
  ['Facebook &amp; WhatsApp API', [
    ['meta_page_id', 'Facebook Page ID', 'text', ''],
    ['meta_page_token', 'Page access token', 'password', 'From your Meta app, Messenger product'],
    ['meta_verify_token', 'Webhook verify token', 'text', 'Invent any string, then paste the same one into Meta'],
    ['meta_app_secret', 'App secret', 'password', 'Settings → Basic in your Meta app. Used to verify every webhook.'],
    ['whatsapp_phone_id', 'WhatsApp phone number ID', 'text', ''],
    ['whatsapp_token', 'WhatsApp access token', 'password', ''],
  ]],
];

async function renderSettings() {
  $('#content').innerHTML = '<div class="sk"></div>';
  try { S.settings = (await api('/settings')).settings; }
  catch (e) { $('#content').innerHTML = `<p class="empty-row">${esc(e.message)}</p>`; return; }

  $('#topbarTools').innerHTML = `<button class="btn btn-primary btn-sm" id="sSave">Save settings</button>`;

  $('#content').innerHTML = SETTING_GROUPS.map(([group, fields]) => `
    <div class="panel"><div class="panel-head"><h3>${group}</h3></div><div class="panel-body">
      ${group.includes('API') ? `<div class="setup-note">
        These are filled in after you create a Meta app. Tokens already saved show as dots;
        leave them untouched to keep them. <b>Webhook URL:</b> <code>${esc(location.origin)}/api/webhooks/meta</code>
      </div>` : ''}
      <div class="row-2">
        ${fields.map(([key, label, type, hint]) => `<label class="field">
          <span>${esc(label)}</span>
          <input id="s-${esc(key)}" type="${type}" value="${esc(S.settings[key] ?? '')}"
            ${type === 'password' ? 'autocomplete="new-password"' : ''}>
          ${hint ? `<small class="hint">${esc(hint)}</small>` : ''}
        </label>`).join('')}
      </div>
    </div></div>`).join('') + `
    <div class="panel"><div class="panel-head"><h3>Dashboard password</h3></div><div class="panel-body">
      <p class="muted">The password lives in your Cloudflare environment, not in the database, so it cannot be
      changed from this screen. To change it, run <code>npm run hash-password</code> locally and replace
      <code>ADMIN_PASSWORD_HASH</code> in the Pages project settings, then redeploy.</p>
    </div></div>`;

  $('#sSave').addEventListener('click', async (e) => {
    e.target.disabled = true; e.target.textContent = 'Saving…';
    const patch = {};
    for (const [, fields] of SETTING_GROUPS) {
      for (const [key] of fields) {
        const el = $(`#s-${key}`);
        if (el) patch[key] = el.value.trim();
      }
    }
    try {
      await api('/settings', { method: 'PUT', body: { settings: patch } });
      toast('Settings saved', 'good');
      S.settings = (await api('/settings')).settings;
    } catch (err) { toast(err.message, 'bad'); }
    e.target.disabled = false; e.target.textContent = 'Save settings';
  });
}

/* ========================================================================
   Boot
   ======================================================================== */
(async function boot() {
  try {
    const session = await (await fetch('/api/auth/session')).json();
    if (!session.configured) {
      $('#gateNote').hidden = false;
      showGate();
      return;
    }
    if (!session.signedIn) { showGate(); return; }
    showShell();
    await loadAll();
    try { S.settings = (await api('/settings')).settings; } catch { /* non-critical */ }
    const start = location.hash.replace('#', '');
    setView(VIEWS[start] ? start : 'overview');
  } catch {
    showGate();
  }
})();
