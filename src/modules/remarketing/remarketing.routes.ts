import { Router } from 'express';
import {
  remarketingRepository,
  REMARKETING_TAGS,
  RemarketingTag,
} from './remarketing.repository';

export const remarketingRouter = Router();

function isValidTag(tag: unknown): tag is RemarketingTag {
  return typeof tag === 'string' && (REMARKETING_TAGS as readonly string[]).includes(tag);
}

remarketingRouter.get('/', (req, res) => {
  const { tag } = req.query as { tag?: string };
  res.json(remarketingRepository.list(tag));
});

remarketingRouter.get('/counts', (_req, res) => {
  res.json(remarketingRepository.counts());
});

/**
 * Define a etiqueta de um contato (cria/atualiza a linha de remarketing).
 * Se a etiqueta vier vazia ou "nenhuma", remove o contato do remarketing.
 */
remarketingRouter.post('/tag', (req, res) => {
  const body = req.body as {
    phone?: string;
    name?: string;
    phone_display?: string;
    niche?: string | null;
    address?: string | null;
    tag?: string;
  };

  if (!body.phone) {
    res.status(400).json({ error: 'Telefone é obrigatório.' });
    return;
  }

  if (!body.tag || body.tag === 'nenhuma') {
    remarketingRepository.removeByPhone(body.phone);
    res.json({ ok: true, tag: null });
    return;
  }

  if (!isValidTag(body.tag)) {
    res.status(400).json({ error: 'Etiqueta inválida.' });
    return;
  }

  remarketingRepository.setTag({
    phone: body.phone,
    name: body.name ?? 'Sem nome',
    phone_display: body.phone_display ?? body.phone,
    niche: body.niche ?? null,
    address: body.address ?? null,
    tag: body.tag,
  });
  res.json({ ok: true, tag: body.tag });
});

remarketingRouter.delete('/:id', (req, res) => {
  const removed = remarketingRepository.remove(Number(req.params.id));
  if (!removed) {
    res.status(404).json({ error: 'Contato não encontrado no remarketing.' });
    return;
  }
  res.json({ ok: true });
});
