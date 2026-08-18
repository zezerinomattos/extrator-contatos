import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { sessionManager } from './whatsapp.client';
import { campaignRunner } from './campaign.service';
import { warmingRepository } from '../warming/warming.repository';

export const whatsappRouter = Router();

const uploadsDir = path.resolve(process.cwd(), 'data', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

// mantém a extensão original — o WhatsApp usa ela para detectar o tipo do arquivo
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (_req, file, cb) => cb(null, `${Date.now()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 60 * 1024 * 1024 }, // 60 MB (limite prático de vídeo no WhatsApp)
});

/* ===== Conexões (números) ===== */

whatsappRouter.get('/sessions', (_req, res) => {
  res.json(sessionManager.listStatuses());
});

whatsappRouter.post('/sessions', (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name || !name.trim()) {
    res.status(400).json({ error: 'Dê um nome para o número (ex: "Chip Vivo 1").' });
    return;
  }
  const session = sessionManager.create(name);
  res.json(session.getStatus());
});

whatsappRouter.post('/sessions/:id/connect', (req, res) => {
  const session = sessionManager.get(Number(req.params.id));
  if (!session) {
    res.status(404).json({ error: 'Conexão não encontrada.' });
    return;
  }
  void session.connect().catch(() => {
    /* erro fica registrado no status */
  });
  res.json({ ok: true });
});

whatsappRouter.delete('/sessions/:id', async (req, res) => {
  const id = Number(req.params.id);
  warmingRepository.removeMember(id); // tira do aquecimento também
  await sessionManager.remove(id);
  res.json({ ok: true });
});

/* ===== Criativo (imagem/vídeo da campanha) ===== */

whatsappRouter.post('/media', upload.single('media'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    return;
  }
  res.json({ path: req.file.path, name: req.file.originalname });
});

/* ===== Campanha ===== */

whatsappRouter.post('/campaign', (req, res) => {
  const body = req.body as {
    sessionId?: number;
    contactIds?: number[];
    greeting?: string;
    message?: string;
    mediaPath?: string;
    betweenMsgSec?: number;
    minDelaySec?: number;
    maxDelaySec?: number;
  };

  if (!body.sessionId) {
    res.status(400).json({ error: 'Selecione o número que vai enviar.' });
    return;
  }
  if (!Array.isArray(body.contactIds) || !body.contactIds.length) {
    res.status(400).json({ error: 'Selecione ao menos um contato.' });
    return;
  }
  if (!body.message || !body.message.trim()) {
    res.status(400).json({ error: 'Escreva a mensagem principal da campanha.' });
    return;
  }
  // segurança: o criativo precisa estar dentro da pasta de uploads
  if (body.mediaPath && !path.resolve(body.mediaPath).startsWith(uploadsDir)) {
    res.status(400).json({ error: 'Caminho de criativo inválido.' });
    return;
  }

  try {
    campaignRunner.start({
      sessionId: body.sessionId,
      contactIds: body.contactIds,
      greeting: body.greeting ?? '',
      message: body.message.trim(),
      mediaPath: body.mediaPath,
      betweenMsgSec: body.betweenMsgSec,
      minDelaySec: body.minDelaySec,
      maxDelaySec: body.maxDelaySec,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : 'Erro ao iniciar campanha' });
  }
});

whatsappRouter.get('/campaign/status', (_req, res) => {
  res.json(campaignRunner.getProgress());
});

whatsappRouter.post('/campaign/stop', (_req, res) => {
  campaignRunner.requestStop();
  res.json({ ok: true });
});
