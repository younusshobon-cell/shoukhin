# Shoukhin storefront

A responsive women's clothing storefront with a burgundy and ivory visual identity. This is a complete front-end demo, ready to put in a Git repository and deploy as a static site on Cloudflare Pages.

## Included

- Home, shop, categories and offers pages.
- Product details, sizes, prices, discount labels and in/out-of-stock states.
- Category filters, search, price sorting and in-stock filtering.
- Wishlist and shopping bag with stock-aware quantities.
- Demo checkout and device-local order history.
- Customer dashboard with saved products, shopping bag, order totals, purchased pieces, repeat shopping links, editable customer details and delivery address.
- Product card borders with hover and keyboard-focus feedback.
- New demo orders preserve product prices and images at checkout.
- Responsive layouts, keyboard focus states, reduced-motion support, favicon and security headers.
- Self-hosted WebP demo photos; no third-party runtime dependencies.

## Run locally

Requires Node.js 20 or newer. No dependency install is necessary.

```sh
npm run dev
```

Open http://localhost:3000. Do not open index.html directly with file:// because the catalog is loaded as a JavaScript module.

```sh
npm run build
npm run preview
```

The built deployment folder is `dist/`. A prebuilt version is included in this download for convenience, but the build command regenerates it from the source.

## Publish your repository

Extract this archive. Upload the CONTENTS of the `shoukhin` directory to the root of a new GitHub or GitLab repository. Include `public/`, `scripts/`, `package.json`, `README.md` and `.gitignore`. The generated `dist/` does not need to be committed.

Alternatively, inside the extracted project:

```sh
git init
git add .
git commit -m "Create Shoukhin storefront"
git branch -M main
git remote add origin YOUR_REPOSITORY_URL
git push -u origin main
```

Replace YOUR_REPOSITORY_URL with the URL of your own empty repository.

## Cloudflare Pages — Git deployment

1. In Cloudflare, open Workers & Pages and create a Pages project connected to your GitHub or GitLab repo.
2. Select the Shoukhin repository and the `main` production branch.
3. Framework preset: **None**.
4. Build command: **npm run build**.
5. Build output directory: **dist**.
6. Root directory: leave blank if the project files are in the repo root; use `shoukhin` if you committed the wrapper folder.
7. Deploy, then attach your custom domain in the project's domain settings.

The `_redirects` file supports direct visits and reloads on each route. Build output also includes route-specific index files. The `_headers` file provides a same-origin content security policy. If you add external fonts, analytics, images or payment integrations, explicitly update that policy.

Cloudflare documentation: https://developers.cloudflare.com/pages/framework-guides/deploy-anything/
Git integration: https://developers.cloudflare.com/pages/get-started/git-integration/

For Direct Upload instead of Git, build locally and upload the CONTENTS of `dist/` as your Pages site's assets. Do not upload the project source as the website.

## Customize the store

- `public/catalog.js`: names, prices in BDT, old prices, fabric, descriptions, category, stock and sizes.
- `public/assets/`: replace `look-1.webp` through `look-5.webp` with your own product photography.
- `public/styles.css`: colours, typography and responsive layouts.
- `public/app.js`: page content, boutique address, navigation, demo delivery rates and interactions.
- `public/index.html`: site description, language and metadata.
- `public/favicon.svg`: monogram favicon; the Shoukhin wordmark is a temporary typographic treatment, not the final brand logo.

Product photos were cropped from the supplied reference screenshot. They are DEMO images and may belong to the reference retailer. Replace them with authorized Shoukhin product photos before commercial publication. The catalog names, specifications, prices, discounts, stock and delivery rates are illustrative, not verified Shoukhin inventory. Category photos reuse these demo assets.

## Before accepting real customers

This package does NOT include a production commerce backend, secure login, payment processing, admin inventory management or order fulfilment. Checkout creates a clearly labelled demo order locally; no order is transmitted and no money is collected. Customer profiles, bag, wishlist and orders are saved only in this browser's localStorage, not synchronized between devices, and can disappear if browser storage is cleared. Do not store sensitive information in the demo.

For a production store, connect a commerce backend or implement Cloudflare Pages Functions/Workers with a database, server-side inventory and order validation, secure authentication/session handling, authorization for each customer's records and an approved payment gateway. The server must calculate prices and delivery charges; never trust client data. Add final shipping/returns/privacy policies, verified business contact information, original product photos, per-size stock and a size guide. Remove demo notices only when these integrations actually work.

## Research references

Design structure was informed by the user-provided Shopping Zone BD product layout, Rainbows BD's product/options flow, Aarong's category browsing and customer order-history approach. Tailors Home BD could not be retrieved during this session. No reference brand's logo or site code was copied.

## Current deployment

The storefront is deployed to https://shoukhin.pages.dev on Cloudflare Pages.
Source lives in the repository root; run `npm run build` and upload the generated `dist/` folder.
Git-triggered auto-deployment is not configured because Cloudflare returned a Git installation error.

`/account` opens the customer dashboard. Creating or editing a local profile returns to that dashboard.
Tabs include order history, purchased pieces, saved products, personal details and delivery address.
Shopping totals include delivery fees and represent locally created demo orders, not collected payments.
Older demo orders without stored prices use the catalog price as a fallback for their item breakdown.
This remains a browser-local demo, without secure accounts or cross-device synchronization.

## Storefront improvements — October 2026

The existing burgundy (#682636), ivory and neutral palette is preserved.

- Sticky navigation, collection shortcuts, global search and a direct wishlist link.
- Size links on product cards, accurate discount percentages, touch-accessible quick previews and enlarged product photography.
- Search across names, categories, fabrics and descriptions; size, fabric, price and stock filters; clear-filter control; URL-persisted filters.
- Explicit size selection, product specifications, related styles and bag/checkout links after adding a product.
- More readable mobile layouts, larger quantity controls, optional checkout email, Bangladesh mobile-number validation and stock revalidation.
- Shopping-help page with sizing guidance, sample delivery rates and transparent demo FAQs. No unverified garment measurements, delivery promises or return guarantees have been added.
- Wishlist changes preserve product size selection and catalog filter state.

Research reviewed seven Bangladesh retailers (not a verified virality ranking):

1. Aarong — https://www.aarong.com/bgd/home — category browsing and customer service.
2. YELLOW — https://yellowclothing.net — collection storytelling and searchable product discovery.
3. Sailor — https://www.sailor.clothing — search and shopping-information structure; limited server-rendered content.
4. Ecstasy — https://www.ecstasybd.com — category hierarchy, new arrivals and size help.
5. Cats Eye — https://catseye.com.bd — visible prices, discounts, stock and wishlist.
6. Richman — https://richmanbd.com — editorial collection presentation.
7. Twelve — https://twelvebd.com/collections/all-womens-collection — size, product-type and price filters.

Le Reve product/search results were also consulted for size-help and filter patterns; its main page could not be retrieved. No reference retailer code, logos or additional photography were copied.

Validation: build, JavaScript syntax, route/DOM smoke checks, search/filter reset, wishlist toggling, mobile-menu state, product-size deep links, add-to-bag stock limits, demo checkout totals and malformed-storage fallback. A local browser preview was unavailable in the remote browser, so visual breakpoint verification remains outstanding. GitHub edits do not automatically update the live site because the current project uses manual Cloudflare uploads.
