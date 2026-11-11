import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { contactsRepository } from './contacts.repository';
import { importContactsFile } from './contacts.import';
import { normalizeBrazilPhone } from '../../shared/phone';

export const contactsRouter = Router();

const importsDir = path.resolve(process.cwd(), 'data', 'imports');
fs.mkdirSync(importsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: importsDir,
    filename: (_req, file, cb) => cb(null, `${Date.now()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});

contactsRouter.get('/', (req, res) => {
  const { niche, status } = req.query as { niche?: string; status?: string };
  res.json(contactsRepository.list({ niche, status }));
});

contactsRouter.get('/niches', (_req, res) => {
  res.json(contactsRepository.listNiches());
});

/** Adiciona um contato manualmente (um número avulso, ótimo para testes). */
contactsRouter.post('/', (req, res) => {
  const body = req.body as { name?: string; phone?: string; niche?: string };
  const name = (body.name ?? '').trim();
  const rawPhone = (body.phone ?? '').trim();
  const niche = (body.niche ?? '').trim() || 'Manual';

  if (!name) {
    res.status(400).json({ error: 'Informe o nome/empresa do contato.' });
    return;
  }
  if (!rawPhone) {
    res.status(400).json({ error: 'Informe o telefone.' });
    return;
  }
  const phone = normalizeBrazilPhone(rawPhone);
  if (!phone) {
    res.status(400).json({ error: 'Telefone inválido. Use DDD + número, ex: (51) 99999-8888.' });
    return;
  }

  const inserted = contactsRepository.insert({
    name,
    phone,
    phone_display: rawPhone,
    address: null,
    niche,
    source: 'manual',
  });

  res.json({ inserted, duplicate: !inserted, niche });
});

contactsRouter.get('/stats', (_req, res) => {
  res.json(contactsRepository.stats());
});

/** Limpeza em massa (respeita os filtros de nicho/status enviados). */
contactsRouter.post('/clear', (req, res) => {
  const { niche, status } = req.body as { niche?: string; status?: string };
  const removed = contactsRepository.clear({ niche, status });
  res.json({ removed });
});

/** Importação de planilha (.xlsx ou .csv) de volta para a base. */
contactsRouter.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Selecione um arquivo .xlsx ou .csv.' });
    return;
  }
  const fallbackNiche =
    (req.body as { niche?: string }).niche?.trim() ||
    `Importada ${new Date().toLocaleDateString('pt-BR')}`;
  try {
    const result = await importContactsFile(req.file.path, fallbackNiche);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao importar' });
  } finally {
    fs.rm(req.file.path, { force: true }, () => {});
  }
});

contactsRouter.delete('/:id', (req, res) => {
  const removed = contactsRepository.remove(Number(req.params.id));
  if (!removed) {
    res.status(404).json({ error: 'Contato não encontrado' });
    return;
  }
  res.json({ ok: true });
});
