import express from 'express';
import path from 'node:path';
import { contactsRouter } from './modules/contacts/contacts.routes';
import { extractorRouter } from './modules/extractor/extractor.routes';
import { whatsappRouter } from './modules/whatsapp/whatsapp.routes';
import { warmingRouter } from './modules/warming/warming.routes';
import { remarketingRouter } from './modules/remarketing/remarketing.routes';
import { exportRouter } from './modules/export/export.routes';

export function createApp(): express.Express {
  const app = express();

  app.use(express.json());
  app.use(express.static(path.resolve(process.cwd(), 'public')));

  app.use('/api/contacts', contactsRouter);
  app.use('/api/extractor', extractorRouter);
  app.use('/api/whatsapp', whatsappRouter);
  app.use('/api/warming', warmingRouter);
  app.use('/api/remarketing', remarketingRouter);
  app.use('/api/export', exportRouter);

  // tratador de erros central — sempre responde JSON
  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error(err);
      res.status(500).json({ error: err.message || 'Erro interno' });
    },
  );

  return app;
}
