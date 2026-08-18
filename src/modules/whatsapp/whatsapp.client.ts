import { Client, LocalAuth } from 'whatsapp-web.js';
import QRCode from 'qrcode';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { sessionsRepository, SessionRow } from './sessions.repository';

export type WhatsAppState = 'desconectado' | 'iniciando' | 'aguardando_qr' | 'conectado';

export interface SessionStatus {
  id: number;
  name: string;
  phone: string | null;
  state: WhatsAppState;
  qr: string | null;
  error: string | null;
}

// se a conexão não chegar a "conectado" nem "aguardando QR" nesse tempo,
// assume que travou (pasta de sessão presa) e reinicia a tentativa
const INIT_WATCHDOG_MS = 120_000;

/**
 * O WhatsApp recusa o pareamento ("Não foi possível conectar o dispositivo")
 * quando o navegador é antigo. O Chromium embutido no puppeteer da biblioteca
 * é desatualizado, então usamos o Chrome instalado na máquina.
 * Pode ser sobrescrito com a variável de ambiente CHROME_PATH.
 */
function findChromePath(): string | undefined {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  ].filter((p): p is string => Boolean(p));
  return candidates.find((p) => fs.existsSync(p));
}

/**
 * Mata processos do Chrome que ficaram órfãos de execuções anteriores.
 * No Windows, quando o Node morre (reinício, Ctrl+C), o Chrome que o
 * WhatsApp abriu continua vivo e trava a pasta de sessão — o que impede a
 * reconexão (fica preso em "Iniciando…"). Identificamos só os nossos Chrome
 * pela pasta ".wwebjs_auth" na linha de comando, sem tocar no Chrome pessoal.
 */
function killOrphanChrome(): void {
  if (process.platform !== 'win32') return;
  try {
    const cmd =
      "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'chrome.exe' -and $_.CommandLine -like '*.wwebjs_auth*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }";
    execSync(`powershell -NoProfile -Command "${cmd}"`, { stdio: 'ignore', timeout: 20_000 });
  } catch {
    /* melhor esforço */
  }
}

/**
 * Remove os arquivos de trava que o Chrome deixa quando é morto à força.
 * Sem isso, o perfil pode ficar "preso" e a próxima abertura trava — foi o
 * que impedia a reconexão. Roda depois de matar os Chrome órfãos.
 */
function clearProfileLocks(): void {
  const authRoot = path.resolve(process.cwd(), '.wwebjs_auth');
  if (!fs.existsSync(authRoot)) return;
  for (const dir of fs.readdirSync(authRoot)) {
    if (!dir.startsWith('session-')) continue;
    const base = path.join(authRoot, dir);
    for (const lock of ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile']) {
      try {
        fs.rmSync(path.join(base, lock), { force: true });
      } catch {
        /* trava ainda em uso — melhor esforço */
      }
    }
  }
}

/** Uma conexão de WhatsApp (um número). Várias podem existir ao mesmo tempo. */
export class ManagedSession {
  private client: Client | null = null;
  private state: WhatsAppState = 'desconectado';
  private qrDataUrl: string | null = null;
  private lastError: string | null = null;
  private phone: string | null;
  private manualStop = false; // true quando o usuário exclui a conexão
  private initWatchdog: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private healthTimer: NodeJS.Timeout | null = null;
  private retryCount = 0;

  constructor(private readonly row: SessionRow) {
    this.phone = row.phone;
  }

  get id(): number {
    return this.row.id;
  }

  getStatus(): SessionStatus {
    return {
      id: this.row.id,
      name: this.row.name,
      phone: this.phone,
      state: this.state,
      qr: this.qrDataUrl,
      error: this.lastError,
    };
  }

  isConnected(): boolean {
    return this.state === 'conectado';
  }

  getClient(): Client {
    if (!this.client || this.state !== 'conectado') {
      throw new Error(`O número "${this.row.name}" não está conectado.`);
    }
    return this.client;
  }

  async connect(): Promise<void> {
    if (this.client) return; // já iniciando ou conectado
    this.manualStop = false;
    this.state = 'iniciando';
    this.qrDataUrl = null;

    // Opcional: fixa uma versão específica do WhatsApp Web (variável de ambiente
    // WA_WEB_VERSION, ex: "2.2412.54"). Serve para contornar o erro "No LID for
    // user" das versões novas. Se não definida, usa a versão atual (padrão).
    const pinnedVersion = process.env.WA_WEB_VERSION;
    const webVersionCache = pinnedVersion
      ? {
          type: 'remote' as const,
          remotePath: `https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/${pinnedVersion}.html`,
        }
      : undefined;

    const client = new Client({
      authStrategy: new LocalAuth({ clientId: this.row.client_id }),
      ...(webVersionCache ? { webVersionCache } : {}),
      puppeteer: {
        headless: true,
        executablePath: findChromePath(),
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });

    client.on('qr', async (qr) => {
      this.clearInitWatchdog(); // chegou ao QR: Chrome vivo, não travou
      this.retryCount = 0;
      this.state = 'aguardando_qr';
      this.qrDataUrl = await QRCode.toDataURL(qr, { width: 300 });
    });

    client.on('ready', () => {
      this.clearInitWatchdog();
      this.retryCount = 0;
      this.lastError = null;
      this.state = 'conectado';
      this.qrDataUrl = null;
      const phone = client.info?.wid?.user;
      if (phone) {
        this.phone = phone;
        sessionsRepository.updatePhone(this.row.id, phone);
      }
      this.startHealthCheck();
    });

    client.on('auth_failure', (msg) => {
      this.lastError = `Falha na autenticação: ${msg}`;
      void this.teardown().then(() => this.scheduleReconnect());
    });

    client.on('disconnected', (reason) => {
      this.lastError = `Caiu (${reason}); reconectando…`;
      void this.teardown().then(() => this.scheduleReconnect());
    });

    this.client = client;

    // vigia: se travar ao iniciar (pasta de sessão presa), reinicia a tentativa
    this.initWatchdog = setTimeout(() => {
      if (this.state === 'iniciando') {
        this.lastError = 'Demorou para iniciar; reiniciando a tentativa…';
        void this.teardown().then(() => this.scheduleReconnect());
      }
    }, INIT_WATCHDOG_MS);

    try {
      await client.initialize();
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : 'Erro ao iniciar o WhatsApp';
      await this.teardown();
      this.scheduleReconnect();
    }
  }

  private clearInitWatchdog(): void {
    if (this.initWatchdog) {
      clearTimeout(this.initWatchdog);
      this.initWatchdog = null;
    }
  }

  /** Verificação periódica de saúde: se a página do WhatsApp "desanexou"
   *  (detached Frame), a sessão é reiniciada sozinha. */
  private startHealthCheck(): void {
    this.stopHealthCheck();
    this.healthTimer = setInterval(() => void this.checkHealth(), 45_000);
  }

  private stopHealthCheck(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }

  private async checkHealth(): Promise<void> {
    if (!this.client || this.state !== 'conectado') return;
    try {
      await this.client.getState(); // lê o estado pela página; falha se morreu
    } catch {
      this.markUnhealthyAndReconnect('conexão instável detectada');
    }
  }

  /** Chamado quando um envio detecta que a sessão morreu ("detached Frame"):
   *  reinicia a conexão desse número. */
  notifyUnhealthy(): void {
    if (this.state === 'conectado') {
      this.markUnhealthyAndReconnect('a conexão caiu durante o envio');
    }
  }

  private markUnhealthyAndReconnect(reason: string): void {
    this.lastError = `${reason}; reconectando…`;
    void this.teardown().then(() => this.scheduleReconnect());
  }

  /** Reagenda a reconexão com backoff — a sessão nunca desiste sozinha. */
  private scheduleReconnect(): void {
    if (this.manualStop || this.reconnectTimer || this.client) return;
    this.retryCount++;
    this.state = 'iniciando'; // sinaliza na UI que ainda está tentando
    const delay = Math.min(60_000, 5_000 * this.retryCount);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  /** Encerra o navegador desta sessão (a autenticação continua salva em disco). */
  async teardown(): Promise<void> {
    this.clearInitWatchdog();
    this.stopHealthCheck();
    const client = this.client;
    this.client = null;
    this.state = 'desconectado';
    this.qrDataUrl = null;
    if (client) {
      try {
        // destroy pode travar se o init estava preso — corre com um tempo-limite
        await Promise.race([client.destroy(), this.sleep(10_000)]);
      } catch {
        // navegador já encerrado — ignorar
      }
    }
  }

  /** Sai da conta no WhatsApp e apaga a autenticação salva em disco. */
  async logoutAndWipe(): Promise<void> {
    this.manualStop = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.client && this.state === 'conectado') {
      try {
        await this.client.logout();
      } catch {
        // se o logout falhar, ainda assim removemos os dados locais
      }
    }
    await this.teardown();
    const authDir = path.resolve(process.cwd(), '.wwebjs_auth', `session-${this.row.client_id}`);
    fs.rmSync(authDir, { recursive: true, force: true });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Registro central das conexões. Na subida do servidor, todas as sessões
 * salvas no banco são reconectadas automaticamente — atualizar a página ou
 * reiniciar o sistema não perde a conexão. A conexão só termina quando o
 * usuário clica em "Excluir".
 */
class SessionManager {
  private sessions = new Map<number, ManagedSession>();

  restoreAll(): void {
    // limpa Chromes órfãos de execuções anteriores e as travas de perfil que
    // eles deixam (libera as pastas de sessão para reconectar)
    killOrphanChrome();
    clearProfileLocks();

    // migração da versão anterior (sessão única): registra no banco se existir
    const legacyAuth = path.resolve(process.cwd(), '.wwebjs_auth', 'session-extrator-contatos');
    if (!sessionsRepository.list().length && fs.existsSync(legacyAuth)) {
      sessionsRepository.insert('Número 1', 'extrator-contatos');
    }

    // conecta de forma escalonada — evita abrir vários Chrome ao mesmo tempo
    let i = 0;
    for (const row of sessionsRepository.list()) {
      const session = new ManagedSession(row);
      this.sessions.set(row.id, session);
      setTimeout(() => {
        void session.connect().catch(() => {
          /* erro fica registrado no status da sessão */
        });
      }, i * 4000);
      i++;
    }
  }

  create(name: string): ManagedSession {
    const clientId = `wa-${Date.now()}`;
    const row = sessionsRepository.insert(name.trim(), clientId);
    const session = new ManagedSession(row);
    this.sessions.set(row.id, session);
    void session.connect().catch(() => {
      /* erro fica registrado no status da sessão */
    });
    return session;
  }

  get(id: number): ManagedSession | undefined {
    return this.sessions.get(id);
  }

  listStatuses(): SessionStatus[] {
    return Array.from(this.sessions.values()).map((s) => s.getStatus());
  }

  async remove(id: number): Promise<void> {
    const session = this.sessions.get(id);
    if (session) {
      await session.logoutAndWipe();
      this.sessions.delete(id);
    }
    sessionsRepository.remove(id);
  }

  /** Fecha todos os navegadores ao desligar o servidor — evita Chrome órfão. */
  async shutdownAll(): Promise<void> {
    await Promise.all(Array.from(this.sessions.values()).map((s) => s.teardown()));
  }
}

export const sessionManager = new SessionManager();
