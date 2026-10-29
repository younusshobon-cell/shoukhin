# Shoukhin

Storefront and dashboard for Shoukhin, a Bangladeshi women's wear shop.
Static front end on Cloudflare Pages, API on Pages Functions, data in D1, product
photos in R2. No build framework, no web fonts, one request to boot the shop.

```
public/            storefront (index.html, styles.css, app.js) + /admin dashboard
public/assets/     imagery, webp at two widths
functions/api/     Pages Functions: catalogue, orders, products, coupons, inbox, auth
migrations/        D1 schema and starter catalogue
scripts/           build, dev server, password hashing
```

---

## First-time setup

Everything below is done once. The database and R2 bucket already exist in the
Cloudflare account (`shoukhin-db`, `shoukhin-media`) and the schema and starter
catalogue are already applied.

### 1. Set the dashboard password

The password is never stored in the database. Generate a hash:

```bash
npm install
npm run hash-password -- "a long password you will remember"
```

In the Cloudflare dashboard, open the Pages project → **Settings → Environment
variables** and add both, marked **Encrypt**:

| Name | Value |
|---|---|
| `ADMIN_PASSWORD_HASH` | the `pbkdf2$...` line the script printed |
| `SESSION_SECRET` | the random string the script printed |

Add them to **Production** and **Preview** so the preview deployments work too.
Redeploy after saving; environment variables only apply to new builds.

The dashboard is then at `/admin`. Eight wrong attempts locks sign-in for 15 minutes.

### 2. Fill in your real details

Sign in to `/admin` → **Settings** and replace the placeholders: hotline, bKash,
Nagad and Rocket numbers, WhatsApp number, delivery charges, address. Anything
left empty simply disappears from the storefront, so an empty bKash number hides
bKash at checkout.

### 3. Replace the demo catalogue

The 24 seeded products are placeholders with generated imagery, there to show the
layout working. Archive them from **Products** once your real inventory is in.

---

## Images

The imagery shipped here was generated for this project, so it is free of any
third-party rights. It is still placeholder work: replace it with real Shoukhin
photography before you push the store properly.

**Two ways to swap an image.**

*From the dashboard (normal way).* Products → Edit → **Upload**. The file goes to
R2 and the product points at it. Accepts WebP, JPEG, PNG and AVIF up to 8 MB.

*By replacing a file (bulk way).* Keep the existing filenames and the whole site
updates at once. Export at **900 × 1117** for products and **2000 × 1125** for
hero images, then save a second copy at half width with `-sm` in the name:

```
public/assets/products/p01.webp      900 × 1117   product detail
public/assets/products/p01-sm.webp   500 × 621    product card
public/assets/hero/hero-1.webp       2000 × 1125  hero slider
public/assets/hero/hero-1-sm.webp    1100 × 619   hero on mobile
public/assets/categories/<slug>.webp 700 × 869    homepage category tile
```

Product cards load the `-sm` file and the detail page loads the full one, which is
what keeps the catalogue fast on a phone. Shoot on a plain, evenly lit backdrop;
the layout expects a 4:5 portrait crop with the garment centred.

---

## Connecting Facebook and WhatsApp

The dashboard inbox is built and waiting, but it stays empty until Meta is
connected. Those steps need your own business identity and phone number, so they
have to happen in your Meta account. The dashboard has the same walkthrough under
**Inbox → Connection guide**.

1. **Create the app.** developers.facebook.com → new app, type **Business**.
   Copy the **App Secret** from Settings → Basic.
2. **Point the webhook here.** Add the **Webhooks** product.
   Callback URL: `https://<your-domain>/api/webhooks/meta`.
   Verify token: invent any string, and put the same string in dashboard Settings.
   Subscribe to `messages` and `messaging_postbacks`.
3. **Messenger.** Add the **Messenger** product, connect your Shoukhin Page,
   generate a **Page access token**. Paste it and the Page ID into Settings.
4. **WhatsApp.** Add the **WhatsApp** product, register your business number,
   copy the **Phone number ID** and access token into Settings.
5. **Go live.** In Development mode only your own test accounts can message the
   app. Submit for review to open it to customers; `pages_messaging` approval
   usually takes a few days.

Every webhook delivery is checked against your App Secret, so a request that is
not really from Meta is rejected.

**Worth knowing:** Meta only allows a free-form reply within 24 hours of the
customer's last message. After that you need an approved message template. This
is Meta's rule, not a limit of this dashboard.

---

## Running it locally

```bash
npm install
npm run db:init:local     # schema into a local D1
npm run db:seed:local     # starter catalogue
npm run hash-password -- "local password"
```

Put the hash in a `.dev.vars` file at the repo root (git-ignored):

```
ADMIN_PASSWORD_HASH=pbkdf2$150000$...
SESSION_SECRET=anything-long-for-local
```

Then:

```bash
npm run build
npx wrangler pages dev dist --local
```

Storefront at `http://localhost:8788`, dashboard at `/admin`.

---

## How a few things work

**Prices are never trusted from the browser.** The checkout endpoint re-reads every
price, discount and stock level from D1 and recalculates the total. A tampered cart
is charged the real price.

**Stock moves with the order.** Placing an order decrements stock; marking an order
cancelled or returned puts it back exactly once.

**Deleting a product archives it.** `is_active` goes to 0 so it leaves the shop but
past orders still read correctly.

**Settings split in two.** The storefront reads a safe subset. Meta tokens and the
app secret never leave the server, and the dashboard shows them as dots.

**The session cookie is HttpOnly, Secure and SameSite=Lax**, signed with
`SESSION_SECRET` and valid for 12 hours.

---

## Commands

| Command | What it does |
|---|---|
| `npm run build` | Build to `dist/` |
| `npm run dev` | Local dev server with bindings |
| `npm run hash-password` | Generate `ADMIN_PASSWORD_HASH` |
| `npm run db:init` / `db:seed` | Apply schema / starter data to the live D1 |
| `npm run db:init:local` / `db:seed:local` | Same, against local D1 |


## Deployment in the connected Cloudflare account

The recovered bundle referenced resources outside the connected account. The deployed account uses D1 database `shoukhin-db` with ID `7da89647-1efc-4648-b3c3-67a9df8e4f55`. Schema and demo seed data were applied to this new database. Never re-run the seed against real inventory: it uses INSERT OR REPLACE.

R2 is not enabled in this account. The MEDIA binding is commented out until the account owner activates R2 and creates `shoukhin-media`; then uncomment the R2 block in wrangler.toml and redeploy. Image-upload APIs return 503 while storage is unavailable; the bundled catalog images remain available.

SESSION_SECRET is configured as an encrypted Pages environment variable. An initial private ADMIN_PASSWORD_HASH is configured in Production and Preview; credentials are supplied separately to the store owner. Rotate it by generating a new hash and updating the encrypted environment variable. Do not commit passwords or hashes. Without an admin password, login returns 503 and protected APIs reject unauthenticated requests. The unsafe hardcoded session-secret fallback from the recovered bundle was removed.


### Customer accounts and hero controls

The storefront header and mobile navigation link to `/account/`. Customers can create an email/password account, edit their profile and delivery address, and view orders placed while signed in. Customer sessions use a separate HttpOnly cookie and database-backed session tokens; they never authorize access to `/admin`. Existing guest orders are not automatically linked by email; use the order tracker for those. Account email changes, email verification and self-service password recovery are not implemented.

Apply `migrations/0003_customer_accounts.sql` once to an existing database before deploying these account endpoints. Fresh databases need migrations 0001, 0002 and 0003 in order; never reapply the demo seed to live inventory.

Hero CTAs are a single persistent pair outside the image/text slides. The text stack reserves the largest slide's height, and the main button reserves a stable width as its label and destination change.
