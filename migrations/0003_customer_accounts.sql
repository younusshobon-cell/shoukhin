CREATE TABLE IF NOT EXISTS customers (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_hash TEXT NOT NULL,
 phone TEXT NOT NULL DEFAULT '',
 address TEXT NOT NULL DEFAULT '',
 district TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS customer_sessions (
 token_hash TEXT PRIMARY KEY,
 customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_owner ON customer_sessions(customer_id);
CREATE TABLE IF NOT EXISTS customer_auth_attempts (
 id TEXT PRIMARY KEY,
 attempts INTEGER NOT NULL,
 window_start INTEGER NOT NULL
);
ALTER TABLE orders ADD COLUMN customer_id TEXT REFERENCES customers(id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, created_at DESC);
