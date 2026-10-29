-- Shoukhin storefront + dashboard schema (Cloudflare D1 / SQLite)
-- Apply with: npx wrangler d1 execute shoukhin-db --remote --file=migrations/0001_init.sql

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- categories
CREATE TABLE IF NOT EXISTS categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  name_bn     TEXT,
  slug        TEXT NOT NULL UNIQUE,
  parent_id   TEXT,
  image       TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active, sort_order);

-- ------------------------------------------------------------------ products
CREATE TABLE IF NOT EXISTS products (
  id                 TEXT PRIMARY KEY,
  title              TEXT NOT NULL,
  title_bn           TEXT,
  slug               TEXT NOT NULL UNIQUE,
  sku                TEXT,
  short_description  TEXT,
  description        TEXT,
  category_id        TEXT,
  price              REAL NOT NULL,            -- regular price in BDT
  discount_price     REAL,                     -- sale price; NULL = not on sale
  stock              INTEGER NOT NULL DEFAULT 0,
  sizes              TEXT NOT NULL DEFAULT '[]',  -- JSON array of strings
  colors             TEXT NOT NULL DEFAULT '[]',  -- JSON array of {name,hex}
  images             TEXT NOT NULL DEFAULT '[]',  -- JSON array of image paths
  fabric             TEXT,
  care               TEXT,
  tag                TEXT,                     -- badge text e.g. "New", "Best Seller"
  is_featured        INTEGER NOT NULL DEFAULT 0,
  is_flash_sale      INTEGER NOT NULL DEFAULT 0,
  flash_sale_ends_at TEXT,
  is_active          INTEGER NOT NULL DEFAULT 1,
  views              INTEGER NOT NULL DEFAULT 0,
  sold               INTEGER NOT NULL DEFAULT 0,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id, is_active);
CREATE INDEX IF NOT EXISTS idx_products_flash    ON products(is_flash_sale, is_active);
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(is_featured, is_active);
CREATE INDEX IF NOT EXISTS idx_products_created  ON products(created_at DESC);

-- ------------------------------------------------------------------- coupons
CREATE TABLE IF NOT EXISTS coupons (
  id            TEXT PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  description   TEXT,
  type          TEXT NOT NULL DEFAULT 'percent',  -- percent | fixed | free_shipping
  value         REAL NOT NULL DEFAULT 0,
  min_order     REAL NOT NULL DEFAULT 0,
  max_discount  REAL,
  usage_limit   INTEGER,
  used_count    INTEGER NOT NULL DEFAULT 0,
  starts_at     TEXT,
  expires_at    TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code, is_active);

-- -------------------------------------------------------------------- orders
CREATE TABLE IF NOT EXISTS orders (
  id               TEXT PRIMARY KEY,          -- e.g. SHK-261030-0014
  customer_name    TEXT NOT NULL,
  customer_phone   TEXT NOT NULL,
  customer_email   TEXT,
  address          TEXT NOT NULL,
  district         TEXT NOT NULL,
  thana            TEXT,
  postcode         TEXT,
  notes            TEXT,
  subtotal         REAL NOT NULL DEFAULT 0,
  discount         REAL NOT NULL DEFAULT 0,
  delivery_charge  REAL NOT NULL DEFAULT 0,
  total            REAL NOT NULL DEFAULT 0,
  coupon_code      TEXT,
  payment_method   TEXT NOT NULL DEFAULT 'cod',   -- cod | bkash | nagad | rocket
  payment_status   TEXT NOT NULL DEFAULT 'unpaid',-- unpaid | paid | refunded
  payment_trx_id   TEXT,
  status           TEXT NOT NULL DEFAULT 'pending',
      -- pending | confirmed | packed | shipped | delivered | cancelled | returned
  courier          TEXT,
  tracking_code    TEXT,
  source           TEXT NOT NULL DEFAULT 'website', -- website | messenger | whatsapp | phone
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_phone   ON orders(customer_phone);

CREATE TABLE IF NOT EXISTS order_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    TEXT NOT NULL,
  product_id  TEXT,
  title       TEXT NOT NULL,
  image       TEXT,
  size        TEXT,
  color       TEXT,
  unit_price  REAL NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 1,
  line_total  REAL NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS order_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   TEXT NOT NULL,
  status     TEXT NOT NULL,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id, created_at);

-- ---------------------------------------------------- messaging (FB / WhatsApp)
CREATE TABLE IF NOT EXISTS conversations (
  id              TEXT PRIMARY KEY,
  channel         TEXT NOT NULL,              -- messenger | whatsapp
  external_id     TEXT NOT NULL,              -- Messenger PSID or WhatsApp wa_id
  customer_name   TEXT,
  customer_phone  TEXT,
  avatar          TEXT,
  last_message    TEXT,
  last_direction  TEXT,
  last_message_at TEXT,
  unread          INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'open',  -- open | closed
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (channel, external_id)
);
CREATE INDEX IF NOT EXISTS idx_conversations_recent ON conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status, last_message_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id  TEXT NOT NULL,
  direction        TEXT NOT NULL,             -- in | out
  body             TEXT,
  attachment_url   TEXT,
  attachment_type  TEXT,
  external_mid     TEXT,
  status           TEXT NOT NULL DEFAULT 'sent', -- sent | delivered | read | failed
  error            TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_mid ON messages(external_mid) WHERE external_mid IS NOT NULL;

-- ------------------------------------------------------------------ settings
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- --------------------------------------------------------- reviews / newsletter
CREATE TABLE IF NOT EXISTS reviews (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  TEXT NOT NULL,
  name        TEXT NOT NULL,
  rating      INTEGER NOT NULL DEFAULT 5,
  body        TEXT,
  is_approved INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id, is_approved);

CREATE TABLE IF NOT EXISTS subscribers (
  email      TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
