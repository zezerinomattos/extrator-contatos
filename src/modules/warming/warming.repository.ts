import { db } from '../../database/connection';

export interface WarmingConfig {
  enabled: boolean;
  activeStart: number; // hora local 0-23 em que o aquecimento começa
  activeEnd: number; // hora local 0-23 em que para (números descansam à noite)
  intensity: 'leve' | 'moderado' | 'intenso';
}

const DEFAULT_CONFIG: WarmingConfig = {
  enabled: false,
  activeStart: 8,
  activeEnd: 21,
  intensity: 'moderado',
};

export interface MemberRow {
  session_id: number;
  started_at: string;
}

export interface ActivityRow {
  id: number;
  from_session_id: number;
  to_session_id: number;
  text: string;
  created_at: string;
  fromName: string | null;
  toName: string | null;
}

function countMap(rows: Array<{ s: number; c: number }>): Map<number, number> {
  const map = new Map<number, number>();
  rows.forEach((r) => map.set(r.s, r.c));
  return map;
}

export const warmingRepository = {
  getConfig(): WarmingConfig {
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'warming'").get() as
      | { value: string }
      | undefined;
    if (!row) return { ...DEFAULT_CONFIG };
    try {
      return { ...DEFAULT_CONFIG, ...JSON.parse(row.value) };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  },

  saveConfig(config: WarmingConfig): void {
    db.prepare(
      `INSERT INTO app_settings (key, value) VALUES ('warming', @v)
       ON CONFLICT(key) DO UPDATE SET value = @v`,
    ).run({ v: JSON.stringify(config) });
  },

  listMembers(): MemberRow[] {
    return db.prepare('SELECT * FROM warming_members ORDER BY session_id').all() as MemberRow[];
  },

  addMember(sessionId: number): void {
    db.prepare('INSERT OR IGNORE INTO warming_members (session_id) VALUES (?)').run(sessionId);
  },

  removeMember(sessionId: number): void {
    db.prepare('DELETE FROM warming_members WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM warming_group_members WHERE session_id = ?').run(sessionId);
  },

  /** Incrementa o contador diário do número (usado para a cota do dia). */
  recordSent(fromSessionId: number): void {
    db.prepare(
      `INSERT INTO warming_counters (session_id, date, count, last_at)
       VALUES (?, date('now', 'localtime'), 1, datetime('now', 'localtime'))
       ON CONFLICT(session_id, date)
       DO UPDATE SET count = count + 1, last_at = datetime('now', 'localtime')`,
    ).run(fromSessionId);
  },

  logMessage(fromSessionId: number, toSessionId: number, text: string): void {
    db.prepare(
      'INSERT INTO warming_log (from_session_id, to_session_id, text) VALUES (?, ?, ?)',
    ).run(fromSessionId, toSessionId, text);
    this.recordSent(fromSessionId);
  },

  /** Limpa o histórico de conversas (feed). NÃO mexe nas cotas do dia. */
  clearLog(): number {
    return db.prepare('DELETE FROM warming_log').run().changes;
  },

  /** Mensagens enviadas hoje (data local) por número — vem dos contadores. */
  sentTodayBySession(): Map<number, number> {
    const rows = db
      .prepare(
        `SELECT session_id AS s, count AS c FROM warming_counters
         WHERE date = date('now', 'localtime')`,
      )
      .all() as Array<{ s: number; c: number }>;
    return countMap(rows);
  },

  totalBySession(): Map<number, number> {
    const rows = db
      .prepare('SELECT session_id AS s, SUM(count) AS c FROM warming_counters GROUP BY session_id')
      .all() as Array<{ s: number; c: number }>;
    return countMap(rows);
  },

  lastActivityBySession(): Map<number, string> {
    const rows = db
      .prepare(
        'SELECT session_id AS s, MAX(last_at) AS t FROM warming_counters GROUP BY session_id',
      )
      .all() as Array<{ s: number; t: string }>;
    const map = new Map<number, string>();
    rows.forEach((r) => map.set(r.s, r.t));
    return map;
  },

  recentActivity(limit: number): ActivityRow[] {
    return db
      .prepare(
        `SELECT wl.id, wl.from_session_id, wl.to_session_id, wl.text, wl.created_at,
                fs.name AS fromName, ts.name AS toName
         FROM warming_log wl
         LEFT JOIN wa_sessions fs ON fs.id = wl.from_session_id
         LEFT JOIN wa_sessions ts ON ts.id = wl.to_session_id
         ORDER BY wl.id DESC LIMIT ?`,
      )
      .all(limit) as ActivityRow[];
  },
};
