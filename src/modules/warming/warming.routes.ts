import { Router } from 'express';
import { warmingRepository } from './warming.repository';
import { warmingEngine } from './warming.service';

export const warmingRouter = Router();

const VALID_INTENSITIES = ['leve', 'moderado', 'intenso'] as const;
type Intensity = (typeof VALID_INTENSITIES)[number];

function clampHour(n: unknown): number {
  const value = Math.round(Number(n));
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(23, value));
}

warmingRouter.get('/status', (_req, res) => {
  res.json(warmingEngine.getStatus());
});

warmingRouter.post('/toggle', (req, res) => {
  const { enabled } = req.body as { enabled?: boolean };
  const config = warmingRepository.getConfig();
  config.enabled = Boolean(enabled);
  warmingRepository.saveConfig(config);
  warmingEngine.kick();
  res.json(config);
});

warmingRouter.post('/config', (req, res) => {
  const body = req.body as {
    activeStart?: number;
    activeEnd?: number;
    intensity?: string;
  };
  const config = warmingRepository.getConfig();
  if (body.activeStart != null) config.activeStart = clampHour(body.activeStart);
  if (body.activeEnd != null) config.activeEnd = clampHour(body.activeEnd);
  if (body.intensity && VALID_INTENSITIES.includes(body.intensity as Intensity)) {
    config.intensity = body.intensity as Intensity;
  }
  warmingRepository.saveConfig(config);
  warmingEngine.kick();
  res.json(config);
});

warmingRouter.post('/members', (req, res) => {
  const { sessionId } = req.body as { sessionId?: number };
  if (!sessionId) {
    res.status(400).json({ error: 'Informe o número a adicionar.' });
    return;
  }
  warmingRepository.addMember(Number(sessionId));
  warmingEngine.kick();
  res.json({ ok: true });
});

warmingRouter.delete('/members/:id', (req, res) => {
  warmingRepository.removeMember(Number(req.params.id));
  res.json({ ok: true });
});

warmingRouter.get('/activity', (req, res) => {
  const limit = Math.min(100, Number(req.query.limit) || 30);
  res.json(warmingRepository.recentActivity(limit));
});

/** Limpa o histórico de conversas (feed). Não afeta as cotas do dia. */
warmingRouter.post('/activity/clear', (_req, res) => {
  const removed = warmingRepository.clearLog();
  res.json({ removed });
});
