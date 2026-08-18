import { db } from '../../database/connection';

export const REMARKETING_TAGS = ['morno', 'quente', 'muito_quente', 'placas'] as const;
export type RemarketingTag = (typeof REMARKETING_TAGS)[number];

export interface RemarketingRow {
  id: number;
  phone: string;
  name: string;
  phone_display: string;
  niche: string | null;
  address: string | null;
  tag: RemarketingTag;
  updated_at: string;
}

export interface RemarketingInput {
  phone: string;
  name: string;
  phone_display: string;
  niche: string | null;
  address: string | null;
  tag: RemarketingTag;
}

export const remarketingRepository = {
  /** Define (ou troca) a etiqueta de um contato. Copia os dados do contato. */
  setTag(input: RemarketingInput): void {
    db.prepare(
      `INSERT INTO remarketing (phone, name, phone_display, niche, address, tag, updated_at)
       VALUES (@phone, @name, @phone_display, @niche, @address, @tag, datetime('now', 'localtime'))
       ON CONFLICT(phone) DO UPDATE SET
         name = @name,
         phone_display = @phone_display,
         niche = @niche,
         address = @address,
         tag = @tag,
         updated_at = datetime('now', 'localtime')`,
    ).run(input);
  },

  /** Remove o contato do remarketing (etiqueta "nenhuma"). */
  removeByPhone(phone: string): void {
    db.prepare('DELETE FROM remarketing WHERE phone = ?').run(phone);
  },

  remove(id: number): boolean {
    return db.prepare('DELETE FROM remarketing WHERE id = ?').run(id).changes > 0;
  },

  list(tag?: string): RemarketingRow[] {
    if (tag) {
      return db
        .prepare('SELECT * FROM remarketing WHERE tag = ? ORDER BY updated_at DESC, id DESC')
        .all(tag) as RemarketingRow[];
    }
    return db
      .prepare('SELECT * FROM remarketing ORDER BY updated_at DESC, id DESC')
      .all() as RemarketingRow[];
  },

  counts(): Record<string, number> {
    const rows = db
      .prepare('SELECT tag, COUNT(*) AS c FROM remarketing GROUP BY tag')
      .all() as Array<{ tag: string; c: number }>;
    const result: Record<string, number> = {};
    for (const t of REMARKETING_TAGS) result[t] = 0;
    rows.forEach((r) => (result[r.tag] = r.c));
    return result;
  },
};
