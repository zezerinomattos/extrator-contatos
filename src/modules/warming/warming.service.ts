import { warmingRepository, WarmingConfig } from './warming.repository';
import { sessionManager } from '../whatsapp/whatsapp.client';
import { toWhatsAppId } from '../../shared/phone';
import { pickScript } from './conversation.scripts';

export interface MemberView {
  sessionId: number;
  name: string;
  phone: string | null;
  connected: boolean;
  startedAt: string;
  ageDays: number;
  sentToday: number;
  target: number;
  total: number;
  lastActivity: string | null;
}

export interface WarmingStatus {
  config: WarmingConfig;
  activeNow: boolean;
  activeConversations: number;
  canRun: boolean;
  members: MemberView[];
  availableToAdd: Array<{ id: number; name: string; phone: string | null }>;
}

// até 2 conversas em par ao mesmo tempo = até 4 números aquecendo juntos,
// com rodízio aleatório entre todos os números do aquecimento.
const MAX_CONCURRENT_CONVERSATIONS = 2;

/**
 * Curva de aquecimento: quantas mensagens (aproximadas) o número deve enviar
 * por dia conforme a idade dele no aquecimento. Chip novo começa baixo e sobe
 * aos poucos — é justamente o ramp-up gradual que evita o bloqueio.
 */
function baseTargetForAge(ageDays: number): number {
  // Curva calibrada para que o piso (Leve, dia 0) fique em ~15 msgs/dia,
  // subindo conforme o chip "envelhece". Os demais níveis escalam a partir daqui.
  if (ageDays < 1) return 30;
  if (ageDays < 3) return 45;
  if (ageDays < 7) return 70;
  if (ageDays < 14) return 100;
  return 135;
}

function intensityMultiplier(intensity: WarmingConfig['intensity']): number {
  if (intensity === 'leve') return 0.6;
  if (intensity === 'intenso') return 1.4;
  return 1.0;
}

/** Pseudo-aleatório estável a partir de uma string (mesmo dia → mesma meta). */
function seededRandom(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 10000 / 10000;
}

function localDateStr(): string {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
}

function daysSince(dateStr: string): number {
  const then = new Date(dateStr.replace(' ', 'T')).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

/**
 * Orquestrador da maturação. Dentro do horário ativo, faz os números do
 * aquecimento conversarem entre si em conversas privadas (1 a 1), com rodízio
 * aleatório — até 4 números ativos ao mesmo tempo (2 pares em paralelo).
 * Sempre com digitação, leitura e pausas humanas.
 */
class WarmingEngine {
  private timer: NodeJS.Timeout | null = null;
  private busy = new Set<number>();
  private activeConversations = 0;

  start(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => void this.tick(), 3000);
  }

  /** Reagenda um tick imediato — usado quando o usuário liga/ajusta algo. */
  kick(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick(), 1500);
  }

  private async tick(): Promise<void> {
    const config = warmingRepository.getConfig();
    let nextDelayMs = this.randomInt(30_000, 110_000);
    try {
      if (config.enabled && this.withinActiveHours(config)) {
        // preenche até o limite de conversas simultâneas (rodízio de duplas)
        while (this.activeConversations < MAX_CONCURRENT_CONVERSATIONS) {
          if (!this.startPairConversation(config)) break;
        }
      } else {
        nextDelayMs = 60_000; // ocioso: checa com menos frequência
      }
    } finally {
      this.timer = setTimeout(() => void this.tick(), nextDelayMs);
    }
  }

  private withinActiveHours(config: WarmingConfig): boolean {
    const hour = new Date().getHours();
    const { activeStart: start, activeEnd: end } = config;
    if (start === end) return true; // 24h
    if (start < end) return hour >= start && hour < end;
    return hour >= start || hour < end; // janela que cruza a meia-noite
  }

  /** Inicia uma conversa entre dois números livres. Retorna false se não deu. */
  private startPairConversation(config: WarmingConfig): boolean {
    if (this.activeConversations >= MAX_CONCURRENT_CONVERSATIONS) return false;

    const available = this.buildMemberViews(config).filter(
      (m) => m.connected && m.phone && !this.busy.has(m.sessionId) && m.sentToday < m.target,
    );
    if (available.length < 2) return false;

    // o número menos ativo hoje entra primeiro (todos participam), com parceiro
    // aleatório — assim as duplas vão trocando ao longo do tempo.
    const byLeastActive = [...available].sort((x, y) => x.sentToday - y.sentToday);
    const a = byLeastActive[0];
    const b = byLeastActive.slice(1).sort(() => Math.random() - 0.5)[0];

    this.busy.add(a.sessionId);
    this.busy.add(b.sessionId);
    this.activeConversations++;
    void this.runPairConversation(a, b)
      .catch(() => {})
      .finally(() => {
        this.busy.delete(a.sessionId);
        this.busy.delete(b.sessionId);
        this.activeConversations--;
      });
    return true;
  }

  private async runPairConversation(a: MemberView, b: MemberView): Promise<void> {
    const script = pickScript();
    const roles = [a, b];
    try {
      for (const turn of script.turns) {
        const sender = roles[turn.role];
        const receiver = roles[turn.role === 0 ? 1 : 0];
        await this.deliverPair(sender, receiver, turn.text);
      }
    } catch {
      // sessão caiu ou envio falhou — encerra a conversa silenciosamente
    }
  }

  private async deliverPair(sender: MemberView, receiver: MemberView, text: string): Promise<void> {
    const senderSession = sessionManager.get(sender.sessionId);
    const receiverSession = sessionManager.get(receiver.sessionId);
    if (!senderSession?.isConnected() || !receiverSession?.isConnected() || !receiver.phone) {
      throw new Error('sessão indisponível');
    }
    const client = senderSession.getClient();
    const chatId = toWhatsAppId(receiver.phone);

    // o destinatário "lê" a mensagem anterior antes de responder
    if (sender.phone) {
      try {
        await receiverSession.getClient().sendSeen(toWhatsAppId(sender.phone));
      } catch {
        /* sem histórico ainda — ok */
      }
    }

    await this.humanTyping(client, chatId, text);
    await client.sendMessage(chatId, text);
    warmingRepository.logMessage(sender.sessionId, receiver.sessionId, text);
  }

  /** Simula "digitando…" por um tempo proporcional ao texto, com pausa de leitura. */
  private async humanTyping(client: unknown, chatId: string, text: string): Promise<void> {
    const c = client as {
      getChatById: (
        id: string,
      ) => Promise<{ sendStateTyping: () => Promise<void>; clearState: () => Promise<void> }>;
    };
    await this.sleep(this.randomInt(3000, 8000)); // "ler/pensar"
    try {
      const chat = await c.getChatById(chatId);
      await chat.sendStateTyping();
      await this.sleep(Math.min(7000, 600 + text.length * 60) + this.randomInt(0, 800));
      await chat.clearState();
    } catch {
      await this.sleep(this.randomInt(1500, 3500));
    }
  }

  private buildMemberViews(config: WarmingConfig): MemberView[] {
    const members = warmingRepository.listMembers();
    const sentToday = warmingRepository.sentTodayBySession();
    const total = warmingRepository.totalBySession();
    const last = warmingRepository.lastActivityBySession();
    const statuses = sessionManager.listStatuses();
    const byId = new Map(statuses.map((s) => [s.id, s]));

    return members.map((m) => {
      const st = byId.get(m.session_id);
      const ageDays = daysSince(m.started_at);
      const jitter = 0.85 + 0.3 * seededRandom(`${localDateStr()}-${m.session_id}`);
      const target = Math.max(
        2,
        Math.round(baseTargetForAge(ageDays) * intensityMultiplier(config.intensity) * jitter),
      );
      return {
        sessionId: m.session_id,
        name: st?.name ?? `#${m.session_id}`,
        phone: st?.phone ?? null,
        connected: st?.state === 'conectado',
        startedAt: m.started_at,
        ageDays,
        sentToday: sentToday.get(m.session_id) ?? 0,
        target,
        total: total.get(m.session_id) ?? 0,
        lastActivity: last.get(m.session_id) ?? null,
      };
    });
  }

  getStatus(): WarmingStatus {
    const config = warmingRepository.getConfig();
    const members = this.buildMemberViews(config);
    const memberIds = new Set(members.map((m) => m.sessionId));

    const availableToAdd = sessionManager
      .listStatuses()
      .filter((s) => s.state === 'conectado' && !memberIds.has(s.id))
      .map((s) => ({ id: s.id, name: s.name, phone: s.phone }));

    return {
      config,
      activeNow: config.enabled && this.withinActiveHours(config),
      activeConversations: this.activeConversations,
      canRun: members.filter((m) => m.connected).length >= 2,
      members,
      availableToAdd,
    };
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(min + Math.random() * (max - min));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const warmingEngine = new WarmingEngine();
