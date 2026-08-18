# 📇 Extrator de Contatos

Dashboard local de prospecção para pequenos negócios:

1. **Extrator de telefone Google** — pesquisa um nicho (ex: *"Cabeleireiros em Sapiranga"*) na Google Places API e salva nome, telefone e endereço das empresas **sem nunca repetir telefone**. Obs.: o próprio Google limita cada pesquisa a ~60 resultados — para cidades grandes, pesquise por bairro/região que a base vai somando sem duplicar.
2. **Conexões WhatsApp** — conecte **um ou vários números** via QR Code. As conexões ficam salvas no banco e **reconectam sozinhas** quando o sistema sobe; só saem quando você clica em Excluir.
3. **Enviar no WhatsApp** — escolha o número de envio e dispare a campanha em duas etapas por contato: saudação → pausa de ~3s → mensagem principal com criativo (imagem/vídeo) opcional → intervalo aleatório (25–60s) → próximo contato.
4. **Maturação de Números** — "aquece" chips novos fazendo seus próprios números conversarem entre si de forma natural (com digitação, leitura e horários humanos), subindo o volume aos poucos. Reduz muito o risco de bloqueio antes de usar o número em campanha.
5. **Contatos** — exporte para Excel, limpe a base pelos filtros e reimporte planilhas (.xlsx/.csv) quando quiser reutilizar uma lista.

## 🌱 Como funciona a maturação (anti-bloqueio)

O que faz o WhatsApp bloquear um chip novo não é só volume — é o *padrão*: um número que só dispara, nunca recebe, nunca "lê" mensagens e manda tudo igual denuncia que é robô. A maturação simula uso humano real:

- **Conversas em pares** entre os seus próprios números conectados, usando roteiros de bate-papo natural (ver `src/modules/warming/conversation.scripts.ts` — adicione mais para reduzir repetição).
- **Conversas em grupos**: o sistema cria grupos entre os seus próprios números (automaticamente ou pelo botão "Criar grupo agora") e eles conversam em grupo com roteiros multipessoa (`conversation.groupScripts.ts`). Grupos ativos são um sinal forte de número humano. Ative/desative pela opção "Incluir aquecimento em grupos".
- **Sinais humanos**: indicador de "digitando…", marcação de lida (visto), pausa para "ler" antes de responder, tempo de digitação proporcional ao texto.
- **Ramp-up por idade**: chip novo troca poucas mensagens/dia; o volume sobe conforme o número envelhece no aquecimento.
- **Horário ativo**: fora da janela configurada (padrão 8h–21h), os números descansam.
- **Aleatoriedade**: intervalos, pares e roteiros sorteados — nada mecânico.

**Requisitos e cuidados:**
- Precisa de **pelo menos 2 números conectados** na página Conexões para que consigam conversar.
- Deixe o número "amadurecer" alguns dias antes de usar em campanha de marketing — quanto mais tempo, mais seguro.
- Maturação **reduz** o risco de bloqueio, mas não elimina. Continue usando chips dedicados e evite disparos agressivos.

## Como rodar

```bash
npm install
```

Copie `.env.example` para `.env` e preencha sua chave do Google:

```
GOOGLE_MAPS_API_KEY=sua-chave-aqui
```

Inicie o sistema:

```bash
npm run serve
```

Abra **http://localhost:3000** no navegador.

> **Use `npm run serve` no dia a dia** (processo estável). O `npm run dev` usa `tsx watch`, que reinicia o servidor a cada arquivo salvo — útil só para desenvolvimento. Reinícios frequentes derrubam as sessões do WhatsApp. Para manter os números sempre online, deixe o `npm run serve` rodando numa janela de terminal. As conexões reconectam sozinhas se o servidor reiniciar, e só terminam quando você clica em "Excluir".

## Como criar a chave do Google (passo a passo)

1. Acesse https://console.cloud.google.com e crie um projeto (ex: "extrator-contatos").
2. Ative o faturamento (exige cartão, mas veja a seção de custos abaixo).
3. Em **APIs e serviços → Biblioteca**, procure **Places API (New)** e clique em **Ativar**. (Tem que ser a "New" — a antiga não funciona com este sistema.)
4. Em **APIs e serviços → Credenciais → Criar credenciais → Chave de API**.
5. Recomendado: edite a chave e em "Restrições de API" permita só a **Places API (New)**.
6. Cole a chave no arquivo `.env`.

## 💰 Custos do Google

- O sistema usa o **Text Search** da Places API (New), pedindo apenas os campos necessários (nome, telefone, endereço) via FieldMask — pedir menos campos = pagar menos.
- A cobrança é **por pesquisa** (cada pesquisa aqui faz até 3 requisições e traz até 60 empresas), não por empresa retornada.
- O Google dá uma **cota gratuita mensal por SKU** (na faixa de milhares de chamadas/mês para este tipo de busca). Para o uso diário de um negócio pequeno, é bem provável que você **não pague nada**.
- Confira os valores atuais em https://mapsplatform.google.com/pricing/ e configure **alertas de orçamento** no Console do Google (Faturamento → Orçamentos e alertas) para dormir tranquilo.

## ⚠️ Avisos importantes sobre o WhatsApp

O envio usa a biblioteca `whatsapp-web.js`, que automatiza o WhatsApp Web. É gratuito, mas:

- **Não é oficial** — o WhatsApp pode **banir o número** se detectar comportamento de spam. Use um **chip/número dedicado**, não o seu número pessoal principal.
- Comece devagar: poucas mensagens por dia com número novo, aumentando aos poucos ("aquecimento").
- Mantenha o intervalo entre envios alto (padrão: 25 a 60 segundos, aleatório).
- Personalize a mensagem (`{nome}` vira o nome da empresa) — mensagens idênticas em massa são detectadas mais fácil.
- Ofereça opção de descadastro ("responda SAIR") e respeite quem pedir — além de boa prática, a LGPD se aplica a prospecção ativa.
- Na primeira conexão, escaneie o QR Code no dashboard. A sessão fica salva em `.wwebjs_auth/` e não pede QR de novo.

## Estrutura do projeto

```
src/
├── server.ts                  # ponto de entrada
├── app.ts                     # configuração do Express e rotas
├── config/env.ts              # variáveis de ambiente
├── database/                  # conexão SQLite + migrações
├── shared/phone.ts            # normalização de telefone BR (chave da deduplicação)
└── modules/                   # um diretório por domínio — novos módulos entram aqui
    ├── contacts/              # repositório e rotas de contatos
    ├── extractor/             # cliente Google Places + serviço de extração
    ├── whatsapp/              # sessão WhatsApp Web + campanhas
    └── export/                # exportação para Excel
public/                        # dashboard (HTML/CSS/JS)
data/app.db                    # banco SQLite (criado automaticamente)
```

### Decisões de arquitetura

- **SQLite com `UNIQUE` no telefone normalizado**: a deduplicação é garantida pelo banco, não por lógica de aplicação — impossível salvar telefone repetido, mesmo entre nichos diferentes.
- **Telefones normalizados para E.164** (`5551999998888`): "(51) 3599-1234" e "51 35991234" viram a mesma chave.
- **Módulos por domínio**: cada funcionalidade futura (grupos, Telegram) entra como um novo diretório em `src/modules/` com suas próprias rotas, sem mexer no resto.
- **Migrações versionadas**: para evoluir o banco, adicione um bloco em `src/database/migrations.ts`.

## Roadmap

- [x] Extração Google Places com deduplicação
- [x] Envio WhatsApp com campanha, intervalo e acompanhamento
- [x] Exportação para Excel
- [ ] Pesquisa em grupos
- [ ] Extração de dados do Telegram
- [ ] Modelos de mensagem salvos
- [ ] Agendamento de campanhas
