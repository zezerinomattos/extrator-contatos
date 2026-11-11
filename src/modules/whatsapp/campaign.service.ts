import { MessageMedia } from 'whatsapp-web.js';
import fs from 'node:fs';
import { contactsRepository, Contact } from '../contacts/contacts.repository';
import { toWhatsAppId } from '../../shared/phone';
import { sessionManager, ManagedSession } from './whatsapp.client';

export interface CampaignOptions {
  sessionId: number;        // qual número conectado vai enviar
  contactIds: number[];
  greeting: string;         // 1ª mensagem (saudação) — vazia = pular
  message: string;          // 2ª mensagem (texto principal); aceita {nome}
  mediaPath?: string;       // criativo opcional (imagem/vídeo) já salvo em data/uploads
  betweenMsgSec?: number;   // pausa entre saudação e mensagem principal (padrão 3s)
  minDelaySec?: number;     // intervalo entre contatos
  maxDelaySec?: number;
}

export interface CampaignProgress {
  running: boolean;
  total: number;
  sent: number;
  failed: number;
  skipped: number;          // sem WhatsApp ou já enviados
  current: string | null;   // nome do contato em andamento
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
}

/**
 * Fluxo por contato (replica o processo manual do usuário):
 *   1. envia a saudação (dispara a resposta automática do estabelecimento)
 *   2. aguarda ~3 segundos
 *   3. envia a mensagem principal, com o criativo anexado se houver
 *   4. aguarda o intervalo aleatório (25–60s) e segue para o próximo
 */
class CampaignRunner {
  private progress: CampaignProgress = this.emptyProgress();
  private stopRequested = false;

  private emptyProgress(): CampaignProgress {
    return {
      running: false,
      total: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      current: null,
      startedAt: null,
      finishedAt: null,
      lastError: null,
    };
  }

  getProgress(): CampaignProgress {
    return this.progress;
  }

  requestStop(): void {
    this.stopRequested = true;
  }

  start(options: CampaignOptions): void {
    if (this.progress.running) {
      throw new Error('Já existe uma campanha em andamento.');
    }

    const session = sessionManager.get(options.sessionId);
    if (!session || !session.isConnected()) {
      throw new Error('O número selecionado não está conectado.');
    }

    if (options.mediaPath && !fs.existsSync(options.mediaPath)) {
      throw new Error('Arquivo do criativo não encontrado. Envie o arquivo novamente.');
    }

    const contacts = contactsRepository
      .findByIds(options.contactIds)
      .filter((c) => c.status !== 'enviado');

    if (!contacts.length) {
      throw new Error('Nenhum contato pendente selecionado (todos já receberam mensagem?).');
    }

    this.stopRequested = false;
    this.progress = {
      ...this.emptyProgress(),
      running: true,
      total: contacts.length,
      startedAt: new Date().toISOString(),
    };

    // roda em segundo plano; o front acompanha via GET /campaign/status
    void this.run(session, contacts, options);
  }

  private async run(
    session: ManagedSession,
    contacts: Contact[],
    options: CampaignOptions,
  ): Promise<void> {
    const minDelay = Math.max(10, options.minDelaySec ?? 25);
    const maxDelay = Math.max(minDelay, options.maxDelaySec ?? 60);
    const betweenMsg = Math.max(1, options.betweenMsgSec ?? 3);

    // confere se a sessão está realmente saudável antes de começar
    try {
      await session.getClient().getState();
    } catch {
      session.notifyUnhealthy();
      this.progress.lastError =
        'A conexão do número não está saudável. Reconectando… aguarde ficar "Conectado" e reenvie.';
      this.progress.running = false;
      this.progress.finishedAt = new Date().toISOString();
      return;
    }

    const media = options.mediaPath ? MessageMedia.fromFilePath(options.mediaPath) : null;

    for (const contact of contacts) {
      if (this.stopRequested) break;
      this.progress.current = contact.name;

      try {
        await this.sendTo(session, contact, options, media, betweenMsg);
        contactsRepository.markSent(contact.id);
        this.progress.sent++;
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'erro desconhecido';
        console.error(`[campanha] falha ao enviar para ${contact.name} (${contact.phone}): ${reason}`);

        // A conexão morreu no meio (página do WhatsApp "desanexou" / navegador
        // fechou): PARA a campanha, reconecta o número e deixa os contatos
        // restantes como PENDENTES para reenviar depois — não marca todos como erro.
        if (this.isSessionDeadError(reason)) {
          session.notifyUnhealthy();
          this.progress.lastError =
            'A conexão do número caiu durante o envio. Reconectando… aguarde ficar "Conectado" e reenvie os pendentes.';
          break;
        }

        // "No LID for user" = número sem WhatsApp (ou sem conversa anterior)
        const friendly = /No LID for user/i.test(reason)
          ? 'número sem WhatsApp ou sem conversa anterior (limitação do WhatsApp)'
          : reason;
        this.progress.failed++;
        this.progress.lastError = `${contact.name}: ${friendly}`;
        contactsRepository.markError(contact.id);
        contactsRepository.logMessage(contact.id, options.message, 'erro', friendly);
      }

      const isLast = contact === contacts[contacts.length - 1];
      if (!isLast && !this.stopRequested) {
        await this.sleep(this.randomBetween(minDelay, maxDelay) * 1000);
      }
    }

    this.progress.running = false;
    this.progress.current = null;
    this.progress.finishedAt = new Date().toISOString();
  }

  private async sendTo(
    session: ManagedSession,
    contact: Contact,
    options: CampaignOptions,
    media: MessageMedia | null,
    betweenMsgSec: number,
  ): Promise<void> {
    const client = session.getClient();
    let chatId = toWhatsAppId(contact.phone);

    // Tenta resolver o id correto do número. NÃO barra o envio se falhar:
    // nas versões recentes do WhatsApp (sistema "LID"), o getNumberId ficou
    // instável e devolvia "sem WhatsApp" para números que têm. Então, se der
    // certo usamos o id resolvido; se não, enviamos direto para <phone>@c.us
    // (é assim que a maturação envia, e funciona).
    try {
      const numberId = (await client.getNumberId(contact.phone)) as { _serialized?: string } | null;
      if (numberId?._serialized) chatId = numberId._serialized;
    } catch {
      /* getNumberId instável — segue com <phone>@c.us */
    }

    const fillTemplate = (text: string) => text.replaceAll('{nome}', contact.name);

    // 1ª mensagem: saudação (dispara a resposta automática do estabelecimento)
    const greeting = options.greeting.trim();
    if (greeting) {
      await client.sendMessage(chatId, fillTemplate(greeting));
      await this.sleep(betweenMsgSec * 1000);
    }

    // 2ª mensagem: texto principal — é o essencial, então vai PRIMEIRO e sozinho.
    const message = fillTemplate(options.message);
    await client.sendMessage(chatId, message);

    // 3ª: criativo como mensagem SEPARADA (sem legenda). Enviar imagem/vídeo COM
    // legenda estava travando o envio (bug conhecido da whatsapp-web.js) e, como
    // a mensagem ia junto na legenda, ela também não chegava. Separando, o texto
    // é garantido e a imagem/vídeo é enviada logo em seguida.
    if (media) {
      try {
        await this.sleep(1500); // pequena pausa entre o texto e o criativo
        await client.sendMessage(chatId, media);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(
          `[campanha] criativo falhou para ${contact.name} (${contact.phone}): ${reason} — mas a mensagem de texto foi enviada`,
        );
        // se o envio da mídia derrubou a página, reconecta para os próximos
        if (this.isSessionDeadError(reason)) session.notifyUnhealthy();
      }
    }

    const logText = greeting ? `${fillTemplate(greeting)}\n---\n${message}` : message;
    contactsRepository.logMessage(contact.id, logText, 'enviado');
  }

  /** Erros que indicam que a sessão (navegador/página) morreu — não é erro do contato. */
  private isSessionDeadError(reason: string): boolean {
    return /detached Frame|Session closed|Target closed|Protocol error|Execution context was destroyed|page has been closed|not connected|não está conectado/i.test(
      reason,
    );
  }

  private randomBetween(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const campaignRunner = new CampaignRunner();
