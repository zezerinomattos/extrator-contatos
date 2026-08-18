import { Router } from 'express';
import { extractContacts } from './extractor.service';

export const extractorRouter = Router();

extractorRouter.post('/search', async (req, res) => {
  const { query } = req.body as { query?: string };
  if (!query || !query.trim()) {
    res.status(400).json({ error: 'Informe o termo de busca (ex: "Cabeleireiros em Sapiranga")' });
    return;
  }
  try {
    const result = await extractContacts(query);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Erro na extração' });
  }
});
