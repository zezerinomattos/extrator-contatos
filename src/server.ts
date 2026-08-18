import { createApp } from './app';
import { env } from './config/env';
import { runMigrations } from './database/migrations';
import { sessionManager } from './modules/whatsapp/whatsapp.client';
import { warmingEngine } from './modules/warming/warming.service';

// Blindagem: a whatsapp-web.js/puppeteer às vezes lança erros assíncronos
// ("Attempted to use detached Frame" etc.) quando a página de um número
// recarrega. Sem isso, um erro desses derruba o servidor inteiro. Aqui a
// gente registra e SEGUE — a sessão afetada reconecta sozinha.
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error('[aviso] rejeição não tratada (ignorada):', msg);
});
process.on('uncaughtException', (err) => {
  console.error('[aviso] exceção não tratada (ignorada):', err.message);
});

runMigrations();

// reconecta todos os números de WhatsApp salvos — a conexão sobrevive
// a reinícios do servidor e a atualizações da página
sessionManager.restoreAll();

// inicia o motor de maturação (só age se estiver ligado nas configurações)
warmingEngine.start();

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`✅ Extrator de Contatos rodando em http://localhost:${env.port}`);
});

// desligamento gracioso: fecha os navegadores do WhatsApp antes de sair, para
// não deixar Chrome órfão travando as pastas de sessão no próximo início.
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n⏻ Encerrando (${signal}) — fechando conexões do WhatsApp…`);
  try {
    await sessionManager.shutdownAll();
  } finally {
    server.close(() => process.exit(0));
    // trava de segurança caso algo prenda o encerramento
    setTimeout(() => process.exit(0), 8000).unref();
  }
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => void shutdown(signal));
}
