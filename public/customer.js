const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => '৳' + Number(n).toLocaleString('en-BD');
const date = value => new Date(value.replace(' ', 'T') + (value.includes('Z') ? '' : 'Z')).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'});
async function request(method = 'GET', body) {
 const r = await fetch('/api/customer', {method,headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
 const data = await r.json();
 if (!r.ok || !data.ok) throw new Error(data.error || 'Please try again.');
 return data;
}
const field = (name,label,value='',type='text',required=false) => `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" ${required?'required':''} maxlength="${name==='name'?120:254}" autocomplete="${name==='name'?'name':name==='phone'?'tel':name==='district'?'address-level1':'email'}"></label>`;
export async function initCustomer(root) {
 let state, mode='login', tab='overview';
 function error(message) { const el=root.querySelector('[data-account-message]');if(el){el.textContent=message;el.setAttribute('role','alert');} }
 async function refresh(){state=await request();paint();}
 function paint(){
  root.innerHTML = state.customer ? dashboard() : auth();
  if (!state.customer) {
   root.querySelector('[data-switch]').onclick=()=>{mode=mode==='login'?'register':'login';paint();};
   root.querySelector('form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await request('POST',{...Object.fromEntries(new FormData(e.target)),action:mode});tab='overview';await refresh();}catch(err){error(err.message);b.disabled=false;}};
   return;
  }
  root.querySelectorAll('[data-account-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.accountTab;paint();});
  root.querySelector('[data-signout]').onclick=async e=>{e.currentTarget.disabled=true;try{await request('POST',{action:'logout'});await refresh();}catch(err){error(err.message);}};
  const form=root.querySelector('[data-profile-form]');
  if(form) form.onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{await request('PUT',Object.fromEntries(new FormData(form)));await refresh();root.querySelector('[data-account-message]').textContent='Your details have been saved.';}catch(err){error(err.message);button.disabled=false;}};
 }
 function auth(){return `<div class="account-auth"><span class="eyebrow">YOUR SHOUKHIN</span><h1>${mode==='register'?'Create your account':'Welcome back'}</h1><p class="muted">Save your delivery details and follow your orders in one place.</p><form class="account-auth-form">${mode==='register'?field('name','Full name','','text',true):''}${field('email','Email address','','email',true)}<label class="field"><span>Password</span><input type="password" name="password" required minlength="12" maxlength="128" autocomplete="${mode==='register'?'new-password':'current-password'}"></label><p class="muted-sm">Use at least 12 characters.</p><p data-account-message aria-live="polite"></p><button class="btn btn-primary btn-block">${mode==='register'?'Create account':'Sign in'}</button></form><p>${mode==='register'?'Already a customer?':'New to Shoukhin?'} <button class="account-text-button" data-switch>${mode==='register'?'Sign in':'Create an account'}</button></p><a href="/track" data-link class="account-text-button">Track a guest order</a></div>`;}
 function dashboard(){
  const c=state.customer,orders=state.orders;
  return `<div class="account-heading"><div><span class="eyebrow">YOUR OWN LITTLE CORNER</span><h1>My Shoukhin</h1><p>Welcome, ${esc(c.name)}.</p></div><a class="btn btn-ghost" href="/shop" data-link>Continue shopping</a></div><div class="account-layout"><aside class="account-sidebar"><div class="account-avatar" aria-hidden="true">${esc(c.name[0].toUpperCase())}</div><strong>${esc(c.name)}</strong><span>${esc(c.email)}</span>${[['overview','Overview'],['orders','My orders'],['details','Personal details'],['address','Delivery address']].map(([key,label])=>`<button data-account-tab="${key}" aria-current="${tab===key?'page':'false'}">${label}</button>`).join('')}<a href="/wishlist" data-link>My wishlist</a><button data-signout>Sign out</button></aside><div class="account-panel"><p data-account-message aria-live="polite"></p>${tab==='overview'?`<h2>Your account, at a glance</h2><div class="account-stats"><div><strong>${orders.length}</strong><span>Recent orders</span></div><div><strong>${orders.filter(o=>!['delivered','cancelled','returned'].includes(o.status)).length}</strong><span>In progress</span></div></div><div class="account-address"><h3>Saved delivery address</h3><p>${c.address?esc(c.address):'Add your address for a quicker checkout.'}</p>${c.district?`<p>${esc(c.district)}</p>`:''}<button class="account-text-button" data-account-tab="address">Edit delivery details</button></div><h3>Latest order</h3>${orders.length?order(orders[0]):emptyOrders()}`:tab==='orders'?`<h2>My orders</h2><p class="muted account-intro">Orders placed while signed in appear here. For an earlier guest order, use <a href="/track" data-link>Track order</a>.</p>${orders.length?orders.map(order).join(''):emptyOrders()}`:`<h2>${tab==='address'?'Delivery address':'Personal details'}</h2><form data-profile-form><div class="account-form-grid">${field('name','Full name',c.name,'text',true)}<label class="field"><span>Email address</span><input type="email" value="${esc(c.email)}" readonly aria-readonly="true"></label>${field('phone','Mobile number',c.phone,'tel')}${field('district','District',c.district)}<label class="field account-wide"><span>Full delivery address</span><textarea name="address" maxlength="500" autocomplete="street-address">${esc(c.address)}</textarea></label></div><button class="btn btn-primary">Save details</button></form>`}</div></div>`;
 }
 function emptyOrders(){return '<div class="account-empty"><h3>Your next favourite is waiting.</h3><p>No orders yet. Orders placed while signed in will appear here.</p><a class="btn btn-primary" href="/shop" data-link>Explore the collection</a></div>';}
 function order(o){return `<article class="account-order"><div><strong>${esc(o.id)}</strong><span class="account-order-status">${esc(o.status.replaceAll('_',' '))}</span></div><p>${date(o.created_at)} · ${money(o.total)}</p>${(o.items||[]).map(i=>`<p>${esc(i.title)}${i.size?' · '+esc(i.size):''} · Qty ${i.quantity}</p>`).join('')}${o.courier?`<p>Courier: ${esc(o.courier)} ${esc(o.tracking_code||'')}</p>`:''}<a href="/track?id=${encodeURIComponent(o.id)}" data-link class="account-text-button">Track this order</a></article>`;}
 try{await refresh();}catch(err){root.innerHTML=`<div class="account-empty"><h1>Your account</h1><p>${esc(err.message)}</p><a href="/account" class="btn btn-primary">Try again</a></div>`;}
}
