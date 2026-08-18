import { db } from '../../database/connection';

export interface SessionRow {
  id: number;
  name: string;
  client_id: string;
  phone: string | null;
  created_at: string;
}

export const sessionsRepository = {
  list(): SessionRow[] {
    return db.prepare('SELECT * FROM wa_sessions ORDER BY id').all() as SessionRow[];
  },

  insert(name: string, clientId: string): SessionRow {
    const info = db
      .prepare('INSERT INTO wa_sessions (name, client_id) VALUES (?, ?)')
      .run(name, clientId);
    return db
      .prepare('SELECT * FROM wa_sessions WHERE id = ?')
      .get(info.lastInsertRowid) as SessionRow;
  },

  updatePhone(id: number, phone: string): void {
    db.prepare('UPDATE wa_sessions SET phone = ? WHERE id = ?').run(phone, id);
  },

  remove(id: number): void {
    db.prepare('DELETE FROM wa_sessions WHERE id = ?').run(id);
  },
};
