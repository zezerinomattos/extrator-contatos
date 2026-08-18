import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { contactsRepository } from './contacts.repository';
import { importContactsFile } from './contacts.import';

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
