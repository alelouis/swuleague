-- Configuration des ligues
CREATE TABLE sets (
  slug       TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE shops (
  slug       TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL
);

-- Ancien pseudo melee.gg → pseudo canonique
CREATE TABLE aliases (
  alias      TEXT PRIMARY KEY,
  canonical  TEXT NOT NULL
);

-- Résultats
CREATE TABLE steps (
  set_slug    TEXT NOT NULL REFERENCES sets(slug),
  shop_slug   TEXT NOT NULL REFERENCES shops(slug),
  step        INTEGER NOT NULL,
  forfait     INTEGER NOT NULL DEFAULT 0,
  source      TEXT,
  imported_by TEXT,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (set_slug, shop_slug, step)
);

CREATE TABLE results (
  set_slug    TEXT NOT NULL,
  shop_slug   TEXT NOT NULL,
  step        INTEGER NOT NULL,
  position    INTEGER NOT NULL,
  joueur      TEXT NOT NULL,
  victoires   INTEGER NOT NULL DEFAULT 0,
  defaites    INTEGER NOT NULL DEFAULT 0,
  nuls        INTEGER NOT NULL DEFAULT 0,
  recrutement INTEGER NOT NULL DEFAULT 0,  -- héritage : recrues déclarées dans l'ancien CSV
  PRIMARY KEY (set_slug, shop_slug, step, position),
  FOREIGN KEY (set_slug, shop_slug, step) REFERENCES steps(set_slug, shop_slug, step) ON DELETE CASCADE
);

CREATE TABLE recruitments (
  set_slug    TEXT NOT NULL,
  shop_slug   TEXT NOT NULL,
  recrue      TEXT NOT NULL,
  recruteur   TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (set_slug, shop_slug, recrue)
);

-- Comptes (connexion Discord) et droits
CREATE TABLE users (
  discord_id  TEXT PRIMARY KEY,
  username    TEXT NOT NULL,
  display     TEXT NOT NULL,
  avatar      TEXT,
  role        TEXT NOT NULL DEFAULT 'pending' CHECK (role IN ('pending', 'admin', 'owner', 'refused')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  last_login  TEXT
);

-- Boutiques qu'un administrateur peut gérer (le propriétaire les gère toutes)
CREATE TABLE user_shops (
  discord_id  TEXT NOT NULL REFERENCES users(discord_id) ON DELETE CASCADE,
  shop_slug   TEXT NOT NULL REFERENCES shops(slug),
  PRIMARY KEY (discord_id, shop_slug)
);

CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  discord_id  TEXT NOT NULL REFERENCES users(discord_id) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL
);
