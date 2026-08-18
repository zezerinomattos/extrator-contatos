import { db } from '../../database/connection';

export interface Contact {
  id: number;
  name: string;
  phone: string;
  phone_display: string;
  address: string | null;
  niche: string;
  source: string;
  status: 'novo' | 'enviado' | 'erro';
  created_at: string;
  sent_at: string | null;
  remarketing_tag?: string | null;
}

export interface NewContact {
  name: string;
  phone: string;
  phone_display: string;
  address: string | null;
  niche: string;
  source?: string;
}

export interface ContactFilter {
  niche?: string;
  status?: string;
}

// preparado sob demanda, pois as migrações rodam depois dos imports
let insertStmt: ReturnType<typeof db.prepare> | null = null;

function getInsertStmt() {
  insertStmt ??= db.prepare(`
    INSERT INTO contacts (name, phone, phone_display, address, niche, source)
    VALUES (@name, @phone, @phone_display, @address, @niche, @source)
    ON CONFLICT(phone) DO NOTHING
  `);
  return insertStmt;
}

export const contactsRepository = {
  /** Insere o contato; retorna false se o telefone já existia (duplicado). */
  insert(contact: NewContact): boolean {
    const result = getInsertStmt().run({ source: 'google', ...contact });
    return result.changes > 0;
  },

  list(filter: ContactFilter = {}): Contact[] {
    const where: string[] = [];
    const params: Record<string, string> = {};
    if (filter.niche) {
      where.push('niche = @niche');
      params.niche = filter.niche;
    }
    if (filter.status) {
      where.push('status = @status');
      params.status = filter.status;
    }
    const sql = `
      SELECT c.*, r.tag AS remarketing_tag
      FROM contacts c
      LEFT JOIN remarketing r ON r.phone = c.phone
      ${where.length ? `WHERE ${where.map((w) => 'c.' + w).join(' AND ')}` : ''}
      ORDER BY c.created_at DESC, c.id DESC
    `;
    return db.prepare(sql).all(params) as Contact[];
  },

  findByIds(ids: number[]): Contact[] {
    if (!ids.length) return [];
    const placeholders = ids.map(() => '?').join(',');
    return db
      .prepare(`SELECT * FROM contacts WHERE id IN (${placeholders})`)
      .all(...ids) as Contact[];
  },

  listNiches(): string[] {
    const rows = db
      .prepare('SELECT DISTINCT niche FROM contacts ORDER BY niche')
      .all() as Array<{ niche: string }>;
    return rows.map((r) => r.niche);
  },

  stats(): { total: number; novo: number; enviado: number; erro: number } {
    const row = db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'novo'    THEN 1 ELSE 0 END) AS novo,
           SUM(CASE WHEN status = 'enviado' THEN 1 ELSE 0 END) AS enviado,
           SUM(CASE WHEN status = 'erro'    THEN 1 ELSE 0 END) AS erro
         FROM contacts`,
      )
      .get() as { total: number; novo: number | null; enviado: number | null; erro: number | null };
    return {
      total: row.total,
      novo: row.novo ?? 0,
      enviado: row.enviado ?? 0,
      erro: row.erro ?? 0,
    };
  },

  markSent(id: number): void {
    db.prepare(
      `UPDATE contacts SET status = 'enviado', sent_at = datetime('now', 'localtime') WHERE id = ?`,
    ).run(id);
  },

  markError(id: number): void {
    db.prepare(`UPDATE contacts SET status = 'erro' WHERE id = ?`).run(id);
  },

  logMessage(contactId: number, message: string, status: 'enviado' | 'erro', error?: string): void {
    db.prepare(
      `INSERT INTO message_log (contact_id, message, status, error) VALUES (?, ?, ?, ?)`,
    ).run(contactId, message, status, error ?? null);
  },

  remove(id: number): boolean {
    db.prepare('DELETE FROM message_log WHERE contact_id = ?').run(id);
    return db.prepare('DELETE FROM contacts WHERE id = ?').run(id).changes > 0;
  },

  /** Apaga em massa os contatos que batem com o filtro; retorna quantos saíram. */
  clear(filter: ContactFilter = {}): number {
    const where: string[] = [];
    const params: Record<string, string> = {};
    if (filter.niche) {
      where.push('niche = @niche');
      params.niche = filter.niche;
    }
    if (filter.status) {
      where.push('status = @status');
      params.status = filter.status;
    }
    const cond = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const clearTx = db.transaction(() => {
      db.prepare(
        `DELETE FROM message_log WHERE contact_id IN (SELECT id FROM contacts ${cond})`,
      ).run(params);
      return db.prepare(`DELETE FROM contacts ${cond}`).run(params).changes;
    });
    return clearTx();
  },
};
