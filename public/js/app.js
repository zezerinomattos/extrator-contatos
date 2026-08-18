'use strict';

/* ========== Utilidades ========== */

function $(sel) {
  return document.querySelector(sel);
}
function $all(sel) {
  return Array.from(document.querySelectorAll(sel));
}

function toast(msg, isError = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.classList.add('hidden'), 5000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

/* ========== Navegação ========== */

function showView(name) {
  $all('.view').forEach((v) => v.classList.remove('active'));
  $all('.nav-item').forEach((b) => b.classList.remove('active'));
  $(`#view-${name}`).classList.add('active');
  const nav = $(`.nav-item[data-view="${name}"]`);
  if (nav) nav.classList.add('active');

  if (name === 'home') loadStats();
  if (name === 'contacts') loadContacts();
  if (name === 'whatsapp') loadCampaignContacts();
  if (name === 'whatsapp' || name === 'connections') {
    startWaPolling();
  } else {
    stopWaPolling();
  }
  if (name === 'warming') {
    startWarmingPolling();
  } else {
    stopWarmingPolling();
  }
  if (name === 'remarketing') loadRemarketing();
}

$all('.nav-item').forEach((btn) => btn.addEventListener('click', () => showView(btn.dataset.view)));
$all('[data-goto]').forEach((btn) => btn.addEventListener('click', () => showView(btn.dataset.goto)));

/* ========== Início (estatísticas) ========== */

async function loadStats() {
  try {
    const s = await api.get('/api/contacts/stats');
    $('#stat-total').textContent = s.total;
    $('#stat-novo').textContent = s.novo;
    $('#stat-enviado').textContent = s.enviado;
    $('#stat-erro').textContent = s.erro;
  } catch (err) {
    toast(err.message, true);
  }
}

/* ========== Extrator ========== */

$('#extract-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const query = $('#extract-query').value.trim();
  const btn = $('#extract-btn');
  btn.disabled = true;
  btn.textContent = 'Extraindo…';
  try {
    const r = await api.post('/api/extractor/search', { query });
    const box = $('#extract-result');
    box.classList.remove('hidden');
    box.innerHTML = `
      <h3>Resultado de "${escapeHtml(r.query)}"</h3>
      <ul>
        <li><strong>${r.found}</strong> empresas encontradas no Google</li>
        <li><strong>${r.withPhone}</strong> com telefone válido</li>
        <li><strong class="ok">${r.inserted}</strong> contatos novos salvos</li>
        <li><strong>${r.duplicates}</strong> ignorados (telefone já estava no banco)</li>
      </ul>
      <button class="btn" data-goto="contacts">Ver contatos</button>`;
    box.querySelector('[data-goto]').addEventListener('click', () => showView('contacts'));
    toast(`${r.inserted} contatos novos salvos!`);
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Extrair contatos';
  }
});

/* ========== Contatos ========== */

async function loadNicheSelects() {
  try {
    const niches = await api.get('/api/contacts/niches');
    for (const sel of [$('#ct-filter-niche'), $('#camp-niche')]) {
      const current = sel.value;
      sel.length = 1; // mantém a opção "todos"
      niches.forEach((n) => sel.add(new Option(n, n)));
      sel.value = current;
    }
  } catch {
    /* silencioso */
  }
}

let contactsList = [];

async function loadContacts() {
  await loadNicheSelects();
  const niche = $('#ct-filter-niche').value;
  const status = $('#ct-filter-status').value;
  const params = new URLSearchParams();
  if (niche) params.set('niche', niche);
  if (status) params.set('status', status);
  try {
    contactsList = await api.get(`/api/contacts?${params}`);
    const tbody = $('#ct-table tbody');
    tbody.innerHTML = contactsList
      .map(
        (c) => `
        <tr>
          <td>${escapeHtml(c.name)}</td>
          <td>${escapeHtml(c.phone_display)}</td>
          <td>${escapeHtml(c.niche)}</td>
          <td><span class="badge st-${c.status}">${c.status}</span></td>
          <td>${tagSelectHtml(c.id, c.remarketing_tag)}</td>
          <td>${escapeHtml(c.created_at)}</td>
          <td><button class="btn tiny danger" data-del="${c.id}">✕</button></td>
        </tr>`,
      )
      .join('');
    tbody.querySelectorAll('[data-del]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        if (!confirm('Excluir este contato?')) return;
        await api.del(`/api/contacts/${btn.dataset.del}`);
        loadContacts();
      }),
    );
    tbody.querySelectorAll('[data-tag-for]').forEach((sel) =>
      sel.addEventListener('change', () => setContactTag(Number(sel.dataset.tagFor), sel.value)),
    );
  } catch (err) {
    toast(err.message, true);
  }
}

/* ===== Etiquetas de remarketing ===== */

const REMARKETING_TAGS = [
  { value: 'morno', label: 'Morno' },
  { value: 'quente', label: 'Quente' },
  { value: 'muito_quente', label: 'Muito quente' },
  { value: 'placas', label: 'Já tem placas solares' },
];

function tagLabel(tag) {
  const found = REMARKETING_TAGS.find((t) => t.value === tag);
  return found ? found.label : tag;
}

function tagSelectHtml(contactId, current) {
  const opts = ['<option value="">— sem etiqueta —</option>']
    .concat(
      REMARKETING_TAGS.map(
        (t) => `<option value="${t.value}"${current === t.value ? ' selected' : ''}>${t.label}</option>`,
      ),
    )
    .join('');
  return `<select class="tag-select" data-tag-for="${contactId}">${opts}</select>`;
}

async function setContactTag(contactId, tag) {
  const contact = contactsList.find((c) => c.id === contactId);
  if (!contact) return;
  try {
    await api.post('/api/remarketing/tag', {
      phone: contact.phone,
      name: contact.name,
      phone_display: contact.phone_display,
      niche: contact.niche,
      address: contact.address,
      tag: tag || 'nenhuma',
    });
    contact.remarketing_tag = tag || null;
    toast(tag ? `Etiquetado como "${tagLabel(tag)}".` : 'Etiqueta removida.');
  } catch (err) {
    toast(err.message, true);
  }
}

$('#ct-filter-niche').addEventListener('change', loadContacts);
$('#ct-filter-status').addEventListener('change', loadContacts);

$('#ct-export-btn').addEventListener('click', () => {
  const params = new URLSearchParams();
  if ($('#ct-filter-niche').value) params.set('niche', $('#ct-filter-niche').value);
  if ($('#ct-filter-status').value) params.set('status', $('#ct-filter-status').value);
  window.location.href = `/api/export/contacts.xlsx?${params}`;
});

$('#ct-clear-btn').addEventListener('click', async () => {
  const niche = $('#ct-filter-niche').value;
  const status = $('#ct-filter-status').value;
  const scope =
    niche || status
      ? `os contatos filtrados (${[niche, status].filter(Boolean).join(', ')})`
      : 'TODOS os contatos da base';
  if (!confirm(`Apagar ${scope}?\n\nDica: exporte para Excel antes se quiser guardar a lista.`)) {
    return;
  }
  try {
    const r = await api.post('/api/contacts/clear', { niche, status });
    toast(`${r.removed} contatos apagados.`);
    loadContacts();
    loadStats();
  } catch (err) {
    toast(err.message, true);
  }
});

/* ========== Conexões WhatsApp ========== */

let waPollTimer = null;
let waSessions = [];

function startWaPolling() {
  refreshSessions();
  if (!waPollTimer) waPollTimer = setInterval(refreshSessions, 2500);
}
function stopWaPolling() {
  clearInterval(waPollTimer);
  waPollTimer = null;
}

const STATE_LABELS = {
  desconectado: ['Desconectado', 'st-off'],
  iniciando: ['Iniciando…', 'st-wait'],
  aguardando_qr: ['Escaneie o QR Code', 'st-wait'],
  conectado: ['Conectado ✓', 'st-on'],
};

async function refreshSessions() {
  try {
    waSessions = await api.get('/api/whatsapp/sessions');
  } catch {
    return; // servidor pode estar reiniciando
  }
  renderConnectionCards();
  renderSessionSelect();
  refreshCampaignProgress();
}

function renderConnectionCards() {
  const list = $('#conn-list');
  if (!waSessions.length) {
    list.innerHTML = '<p class="muted">Nenhum número conectado ainda. Adicione o primeiro acima.</p>';
    return;
  }
  list.innerHTML = waSessions
    .map((s) => {
      const [text, cls] = STATE_LABELS[s.state] || [s.state, ''];
      return `
      <div class="conn-card">
        <div class="conn-head">
          <strong>${escapeHtml(s.name)}</strong>
          <span class="badge ${cls}">${text}</span>
        </div>
        <p class="muted">${s.phone ? '📱 +' + escapeHtml(s.phone) : 'número ainda não vinculado'}</p>
        ${s.qr ? `<div class="qr-box"><p>Abra o WhatsApp no celular → <strong>Aparelhos conectados</strong> → <strong>Conectar aparelho</strong>:</p><img src="${s.qr}" alt="QR Code" /></div>` : ''}
        ${s.error ? `<p class="error-text">${escapeHtml(s.error)}</p>` : ''}
        <div class="wa-actions">
          ${s.state === 'desconectado' ? `<button class="btn primary" data-reconnect="${s.id}">🔄 Reconectar</button>` : ''}
          <button class="btn danger" data-remove="${s.id}">🗑 Excluir conexão</button>
        </div>
      </div>`;
    })
    .join('');

  list.querySelectorAll('[data-reconnect]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      await api.post(`/api/whatsapp/sessions/${btn.dataset.reconnect}/connect`);
      toast('Reconectando…');
      refreshSessions();
    }),
  );
  list.querySelectorAll('[data-remove]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const s = waSessions.find((x) => String(x.id) === btn.dataset.remove);
      if (
        !confirm(
          `Excluir a conexão "${s ? s.name : ''}"?\n\nO número será desvinculado do sistema e a autenticação salva será apagada.`,
        )
      ) {
        return;
      }
      await api.del(`/api/whatsapp/sessions/${btn.dataset.remove}`);
      toast('Conexão excluída.');
      refreshSessions();
    }),
  );
}

$('#conn-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const name = $('#conn-name').value.trim();
  if (!name) return;
  try {
    await api.post('/api/whatsapp/sessions', { name });
    $('#conn-name').value = '';
    toast('Iniciando conexão… o QR Code aparece no cartão abaixo.');
    refreshSessions();
  } catch (err) {
    toast(err.message, true);
  }
});

/* ========== Envio: seleção de número ========== */

function renderSessionSelect() {
  const sel = $('#camp-session');
  const current = sel.value;
  const connected = waSessions.filter((s) => s.state === 'conectado');
  sel.innerHTML = '';
  if (!connected.length) {
    sel.add(new Option('Nenhum número conectado', ''));
  } else {
    connected.forEach((s) =>
      sel.add(new Option(`${s.name}${s.phone ? ' (+' + s.phone + ')' : ''}`, s.id)),
    );
    if (connected.some((s) => String(s.id) === current)) sel.value = current;
  }
}

/* ========== Envio: lista de contatos ========== */

let campaignContacts = [];

async function loadCampaignContacts() {
  await loadNicheSelects();
  const niche = $('#camp-niche').value;
  const params = new URLSearchParams({ status: 'novo' });
  if (niche) params.set('niche', niche);
  try {
    campaignContacts = await api.get(`/api/contacts?${params}`);
    const checkedAll = $('#camp-select-all').checked;
    const tbody = $('#camp-table tbody');
    tbody.innerHTML = campaignContacts
      .map(
        (c) => `
        <tr>
          <td><input type="checkbox" class="camp-check" value="${c.id}" ${checkedAll ? 'checked' : ''} /></td>
          <td>${escapeHtml(c.name)}</td>
          <td>${escapeHtml(c.phone_display)}</td>
          <td>${escapeHtml(c.niche)}</td>
        </tr>`,
      )
      .join('');
    updateCampaignCount();
    tbody
      .querySelectorAll('.camp-check')
      .forEach((cb) => cb.addEventListener('change', updateCampaignCount));
  } catch (err) {
    toast(err.message, true);
  }
}

function selectedCampaignIds() {
  return $all('.camp-check:checked').map((cb) => Number(cb.value));
}

function updateCampaignCount() {
  $('#camp-count').textContent =
    `${selectedCampaignIds().length} de ${campaignContacts.length} pendentes selecionados`;
}

$('#camp-niche').addEventListener('change', loadCampaignContacts);
$('#camp-select-all').addEventListener('change', (ev) => {
  $all('.camp-check').forEach((cb) => (cb.checked = ev.target.checked));
  updateCampaignCount();
});

/* ========== Envio: importação de planilha ========== */

$('#camp-import-file').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  if (!file) return;
  const niche = prompt(
    'Nome da lista/nicho para os contatos importados:',
    file.name.replace(/\.(xlsx|csv)$/i, ''),
  );
  if (niche === null) {
    ev.target.value = '';
    return;
  }
  const form = new FormData();
  form.append('file', file);
  form.append('niche', niche);
  try {
    const res = await fetch('/api/contacts/import', { method: 'POST', body: form });
    const r = await res.json();
    if (!res.ok) throw new Error(r.error || `Erro ${res.status}`);
    toast(
      `Importação: ${r.inserted} novos · ${r.duplicates} repetidos · ${r.invalid} sem telefone válido.`,
    );
    $('#camp-niche').value = '';
    loadCampaignContacts();
  } catch (err) {
    toast(err.message, true);
  } finally {
    ev.target.value = '';
  }
});

/* ========== Envio: criativo ========== */

$('#camp-media-file').addEventListener('change', (ev) => {
  const file = ev.target.files[0];
  $('#camp-media-name').textContent = file ? file.name : 'nenhum arquivo';
  $('#camp-media-clear').classList.toggle('hidden', !file);
});

$('#camp-media-clear').addEventListener('click', () => {
  $('#camp-media-file').value = '';
  $('#camp-media-name').textContent = 'nenhum arquivo';
  $('#camp-media-clear').classList.add('hidden');
});

/* ========== Envio: campanha ========== */

$('#camp-start-btn').addEventListener('click', async () => {
  const sessionId = Number($('#camp-session').value);
  const ids = selectedCampaignIds();
  const greeting = $('#camp-greeting').value.trim();
  const message = $('#camp-message').value.trim();
  const mediaFile = $('#camp-media-file').files[0];

  if (!sessionId) return toast('Conecte e selecione um número de envio.', true);
  if (!ids.length) return toast('Selecione ao menos um contato.', true);
  if (!message) return toast('Escreva a mensagem principal.', true);

  const resumo = [
    `Enviar para ${ids.length} contato(s) pelo número selecionado?`,
    '',
    greeting ? `1ª msg: "${greeting.slice(0, 60)}"` : '1ª msg: (sem saudação)',
    `2ª msg: "${message.slice(0, 60)}"${mediaFile ? ` + criativo (${mediaFile.name})` : ''}`,
  ].join('\n');
  if (!confirm(resumo)) return;

  const btn = $('#camp-start-btn');
  btn.disabled = true;
  try {
    let mediaPath;
    if (mediaFile) {
      const form = new FormData();
      form.append('media', mediaFile);
      const res = await fetch('/api/whatsapp/media', { method: 'POST', body: form });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error || 'Falha ao enviar o criativo');
      mediaPath = r.path;
    }

    await api.post('/api/whatsapp/campaign', {
      sessionId,
      contactIds: ids,
      greeting,
      message,
      mediaPath,
      betweenMsgSec: Number($('#camp-between-delay').value) || 3,
      minDelaySec: Number($('#camp-min-delay').value) || 25,
      maxDelaySec: Number($('#camp-max-delay').value) || 60,
    });
    toast('Campanha iniciada!');
    refreshCampaignProgress();
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
  }
});

$('#camp-stop-btn').addEventListener('click', async () => {
  await api.post('/api/whatsapp/campaign/stop');
  toast('Parada solicitada — finalizando o envio atual…');
});

async function refreshCampaignProgress() {
  try {
    const p = await api.get('/api/whatsapp/campaign/status');
    const box = $('#camp-progress');
    const started = Boolean(p.startedAt);
    box.classList.toggle('hidden', !started);
    $('#camp-stop-btn').classList.toggle('hidden', !p.running);
    $('#camp-start-btn').classList.toggle('hidden', p.running);
    if (!started) return;

    const done = p.sent + p.failed + p.skipped;
    const pct = p.total ? Math.round((done / p.total) * 100) : 0;
    $('#camp-progress-fill').style.width = `${pct}%`;

    let text = `${done}/${p.total} processados — ✅ ${p.sent} enviados · ❌ ${p.failed} erros`;
    if (p.running && p.current) text += ` · enviando para: ${p.current}`;
    if (!p.running) text += ' · campanha finalizada';
    if (p.lastError) text += ` · último erro: ${p.lastError}`;
    $('#camp-progress-text').textContent = text;

    if (!p.running && refreshCampaignProgress._wasRunning) {
      loadCampaignContacts();
      loadStats();
    }
    refreshCampaignProgress._wasRunning = p.running;
  } catch {
    /* silencioso */
  }
}

/* ========== Maturação (warming) ========== */

let warmingPollTimer = null;
let warmingStatus = null;
let warmingFormFilled = false; // preenche os campos de config só uma vez ao abrir

function startWarmingPolling() {
  warmingFormFilled = false; // ao (re)abrir a aba, recarrega a config salva nos campos
  refreshWarming();
  if (!warmingPollTimer) warmingPollTimer = setInterval(refreshWarming, 4000);
}
function stopWarmingPolling() {
  clearInterval(warmingPollTimer);
  warmingPollTimer = null;
}

async function refreshWarming() {
  try {
    warmingStatus = await api.get('/api/warming/status');
  } catch {
    return;
  }
  renderWarmingStatus();
  renderWarmingMembers();
  renderWarmingAddSelect();
  refreshWarmingFeed();
}

function renderWarmingStatus() {
  const s = warmingStatus;
  const cfg = s.config;
  const toggle = $('#wm-toggle');
  toggle.textContent = cfg.enabled ? '⏸ Desligar maturação' : '▶ Ligar maturação';
  toggle.className = 'btn ' + (cfg.enabled ? 'danger' : 'primary');

  let line;
  if (!cfg.enabled) line = 'Desligada.';
  else if (!s.canRun) line = 'Ligada, mas aguardando 2 ou mais números conectados.';
  else if (!s.activeNow)
    line = `Ligada — em descanso (fora do horário ${cfg.activeStart}h–${cfg.activeEnd}h).`;
  else line = `Ativa 🟢 — ${s.activeConversations} conversa(s) em andamento.`;
  $('#wm-status-line').textContent = line;

  const warn = $('#wm-warning');
  if (cfg.enabled && !s.canRun) {
    warn.classList.remove('hidden');
    warn.textContent = '⚠ Adicione ao menos 2 números conectados para a maturação funcionar.';
  } else {
    warn.classList.add('hidden');
  }

  // Preenche os campos de config UMA vez (ao abrir a aba ou logo após salvar).
  // Não reescreve a cada poll — senão apaga o que o usuário está digitando
  // antes de clicar em "Salvar configurações".
  if (!warmingFormFilled) {
    $('#wm-start').value = cfg.activeStart;
    $('#wm-end').value = cfg.activeEnd;
    $('#wm-intensity').value = cfg.intensity;
    warmingFormFilled = true;
  }
}

function fmtWhen(ts) {
  if (!ts) return '—';
  return ts.replace('T', ' ').slice(0, 16);
}

function renderWarmingMembers() {
  const tbody = $('#wm-members-table tbody');
  const members = warmingStatus.members;
  if (!members.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="muted">Nenhum número no aquecimento ainda.</td></tr>';
    return;
  }
  tbody.innerHTML = members
    .map(
      (m) => `
      <tr>
        <td>${escapeHtml(m.name)}${m.phone ? '<br><small class="muted">+' + escapeHtml(m.phone) + '</small>' : ''}</td>
        <td>${m.connected ? '<span class="badge st-on">online</span>' : '<span class="badge st-off">offline</span>'}</td>
        <td>${m.ageDays}d</td>
        <td>${m.sentToday}/${m.target}</td>
        <td>${m.total}</td>
        <td>${fmtWhen(m.lastActivity)}</td>
        <td><button class="btn tiny danger" data-wm-remove="${m.sessionId}">✕</button></td>
      </tr>`,
    )
    .join('');
  tbody.querySelectorAll('[data-wm-remove]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      await api.del('/api/warming/members/' + btn.dataset.wmRemove);
      toast('Número removido do aquecimento.');
      refreshWarming();
    }),
  );
}

function renderWarmingAddSelect() {
  const sel = $('#wm-add-select');
  const current = sel.value;
  sel.length = 1;
  warmingStatus.availableToAdd.forEach((a) =>
    sel.add(new Option(`${a.name}${a.phone ? ' (+' + a.phone + ')' : ''}`, a.id)),
  );
  sel.value = current;
}

async function refreshWarmingFeed() {
  try {
    const rows = await api.get('/api/warming/activity?limit=25');
    const feed = $('#wm-feed');
    if (!rows.length) {
      feed.innerHTML = '<p class="muted">Sem conversas ainda. Ligue a maturação e aguarde alguns minutos.</p>';
      return;
    }
    feed.innerHTML = rows
      .map(
        (r) => `
        <div class="wm-msg">
          <span class="wm-msg-meta">${escapeHtml(r.fromName || '?')} → ${escapeHtml(r.toName || '?')} · ${fmtWhen(r.created_at)}</span>
          <span class="wm-msg-text">${escapeHtml(r.text)}</span>
        </div>`,
      )
      .join('');
  } catch {
    /* silencioso */
  }
}

$('#wm-toggle').addEventListener('click', async () => {
  const enabled = !(warmingStatus && warmingStatus.config.enabled);
  try {
    await api.post('/api/warming/toggle', { enabled });
    toast(enabled ? 'Maturação ligada.' : 'Maturação desligada.');
    refreshWarming();
  } catch (err) {
    toast(err.message, true);
  }
});

$('#wm-save-config').addEventListener('click', async () => {
  try {
    await api.post('/api/warming/config', {
      activeStart: Number($('#wm-start').value),
      activeEnd: Number($('#wm-end').value),
      intensity: $('#wm-intensity').value,
    });
    toast('Configurações salvas.');
    warmingFormFilled = false; // re-sincroniza os campos com o que foi salvo
    refreshWarming();
  } catch (err) {
    toast(err.message, true);
  }
});

$('#wm-clear-feed').addEventListener('click', async () => {
  if (!confirm('Limpar o histórico de conversas da maturação?\n\nIsso NÃO zera as cotas do dia — só apaga o feed para não sobrecarregar.')) {
    return;
  }
  try {
    const r = await api.post('/api/warming/activity/clear', {});
    toast(`${r.removed} mensagens de histórico apagadas.`);
    refreshWarming();
  } catch (err) {
    toast(err.message, true);
  }
});

$('#wm-add-btn').addEventListener('click', async () => {
  const id = Number($('#wm-add-select').value);
  if (!id) return toast('Selecione um número conectado.', true);
  try {
    await api.post('/api/warming/members', { sessionId: id });
    toast('Número adicionado ao aquecimento.');
    refreshWarming();
  } catch (err) {
    toast(err.message, true);
  }
});

/* ========== Remarketing ========== */

let rmkCurrentTag = ''; // '' = todas

async function loadRemarketing() {
  let counts = {};
  try {
    counts = await api.get('/api/remarketing/counts');
  } catch {
    /* segue */
  }
  renderRemarketingTabs(counts);

  const params = new URLSearchParams();
  if (rmkCurrentTag) params.set('tag', rmkCurrentTag);
  try {
    const rows = await api.get(`/api/remarketing?${params}`);
    $('#rmk-count').textContent = `${rows.length} contato(s)`;
    const tbody = $('#rmk-table tbody');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="muted">Nenhum contato nesta lista ainda. Etiquete leads na aba Contatos.</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(
        (r) => `
        <tr>
          <td>${escapeHtml(r.name)}</td>
          <td>${escapeHtml(r.phone_display)}</td>
          <td><span class="badge rmk-${r.tag}">${escapeHtml(tagLabel(r.tag))}</span></td>
          <td>${escapeHtml(r.niche || '')}</td>
          <td>${escapeHtml(r.updated_at)}</td>
          <td><button class="btn tiny danger" data-rmk-del="${r.id}">✕</button></td>
        </tr>`,
      )
      .join('');
    tbody.querySelectorAll('[data-rmk-del]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        if (!confirm('Remover este contato do remarketing?')) return;
        await api.del('/api/remarketing/' + btn.dataset.rmkDel);
        loadRemarketing();
      }),
    );
  } catch (err) {
    toast(err.message, true);
  }
}

function renderRemarketingTabs(counts) {
  const total = REMARKETING_TAGS.reduce((sum, t) => sum + (counts[t.value] || 0), 0);
  const tabs = [{ value: '', label: 'Todos', count: total }].concat(
    REMARKETING_TAGS.map((t) => ({ value: t.value, label: t.label, count: counts[t.value] || 0 })),
  );
  const box = $('#rmk-tabs');
  box.innerHTML = tabs
    .map(
      (t) =>
        `<button class="btn rmk-tab${rmkCurrentTag === t.value ? ' primary' : ''}" data-rmk-tab="${t.value}">${escapeHtml(t.label)} (${t.count})</button>`,
    )
    .join('');
  box.querySelectorAll('[data-rmk-tab]').forEach((btn) =>
    btn.addEventListener('click', () => {
      rmkCurrentTag = btn.dataset.rmkTab;
      loadRemarketing();
    }),
  );
}

$('#rmk-export-btn').addEventListener('click', () => {
  const params = new URLSearchParams();
  if (rmkCurrentTag) params.set('tag', rmkCurrentTag);
  window.location.href = `/api/export/remarketing.xlsx?${params}`;
});

/* ========== Inicialização ========== */

loadStats();
refreshSessions();
