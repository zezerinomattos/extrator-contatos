import { db } from './connection';

/**
 * Migrações simples por versão (user_version do SQLite).
 * Para evoluir o banco, adicione um novo bloco com a próxima versão.
 */
const migrations: string[] = [
  // v1 — esquema inicial
  `
  CREATE TABLE IF NOT EXISTS contacts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    phone         TEXT NOT NULL UNIQUE,   -- E.164 sem '+', ex: 5551999998888
    phone_display TEXT NOT NULL,          -- como veio do Google, ex: (51) 99999-8888
    address       TEXT,
    niche         TEXT NOT NULL,          -- termo pesquisado, ex: "Cabeleireiros em Sapiranga"
    source        TEXT NOT NULL DEFAULT 'google',
    status        TEXT NOT NULL DEFAULT 'novo',  -- novo | enviado | erro
    created_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    sent_at       TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_contacts_niche  ON contacts(niche);
  CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);

  CREATE TABLE IF NOT EXISTS message_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER NOT NULL REFERENCES contacts(id),
    message    TEXT NOT NULL,
    status     TEXT NOT NULL,             -- enviado | erro
    error      TEXT,
    sent_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
  `,

  // v2 — múltiplas conexões de WhatsApp
  `
  CREATE TABLE IF NOT EXISTS wa_sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,           -- apelido dado pelo usuário, ex: "Chip Vivo 1"
    client_id  TEXT NOT NULL UNIQUE,    -- chave da pasta de autenticação (.wwebjs_auth)
    phone      TEXT,                    -- preenchido após a primeira conexão
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
  `,

  // v3 — maturação (aquecimento) de números
  `
  CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS warming_members (
    session_id INTEGER PRIMARY KEY,     -- referencia wa_sessions.id
    started_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS warming_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    from_session_id INTEGER NOT NULL,
    to_session_id   INTEGER NOT NULL,
    text            TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_warming_log_from ON warming_log(from_session_id, created_at);
  `,

  // v4 — aquecimento em grupos
  `
  ALTER TABLE warming_log ADD COLUMN group_id INTEGER;

  CREATE TABLE IF NOT EXISTS warming_groups (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    wa_group_id        TEXT NOT NULL UNIQUE,  -- id do grupo no WhatsApp (xxxx@g.us)
    name               TEXT NOT NULL,
    creator_session_id INTEGER NOT NULL,
    created_at         TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS warming_group_members (
    group_id   INTEGER NOT NULL,
    session_id INTEGER NOT NULL,
    PRIMARY KEY (group_id, session_id)
  );
  `,

  // v5 — contadores de maturação (separados do log) + listas de remarketing
  `
  -- contador diário por número: independe do log, então dá para limpar o
  -- histórico de conversas sem zerar as cotas do dia (limites de segurança)
  CREATE TABLE IF NOT EXISTS warming_counters (
    session_id INTEGER NOT NULL,
    date       TEXT NOT NULL,            -- YYYY-MM-DD (local)
    count      INTEGER NOT NULL DEFAULT 0,
    last_at    TEXT,
    PRIMARY KEY (session_id, date)
  );

  -- listas de remarketing: cópia do contato + etiqueta. Sobrevive à limpeza
  -- da base de contatos e a bloqueios do número.
  CREATE TABLE IF NOT EXISTS remarketing (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    phone         TEXT NOT NULL UNIQUE,  -- E.164 sem '+', chave de deduplicação
    name          TEXT NOT NULL,
    phone_display TEXT NOT NULL,
    niche         TEXT,
    address       TEXT,
    tag           TEXT NOT NULL,         -- morno | quente | muito_quente | placas
    updated_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_remarketing_tag ON remarketing(tag);
  `,
];

export function runMigrations(): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let v = current; v < migrations.length; v++) {
    db.exec(migrations[v]);
    db.pragma(`user_version = ${v + 1}`);
  }
}
