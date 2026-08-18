/**
 * Roteiros de conversa para a maturação dos números.
 *
 * Cada roteiro é um bate-papo casual em português, com turnos alternados
 * entre dois papéis (0 e 1). A engine sorteia um roteiro e distribui os
 * papéis entre dois números conectados — o resultado é um diálogo que
 * flui como conversa humana de verdade, muito mais natural (e mais seguro
 * contra bloqueio) do que mensagens soltas e repetidas.
 *
 * Para deixar ainda mais orgânico, quanto mais roteiros houver, menor a
 * repetição. Sinta-se livre para adicionar novos blocos abaixo.
 */

export interface Turn {
  role: 0 | 1;
  text: string;
}

export interface ConversationScript {
  id: string;
  turns: Turn[];
}

export const scripts: ConversationScript[] = [
  {
    id: 'fim-de-semana',
    turns: [
      { role: 0, text: 'oi, tudo bem?' },
      { role: 1, text: 'opa, tudo e vc?' },
      { role: 0, text: 'tudo certo! como foi o fim de semana?' },
      { role: 1, text: 'foi tranquilo, fiquei mais em casa descansando 😅' },
      { role: 0, text: 'kkk boa, precisava né' },
      { role: 1, text: 'demais. e vc, fez algo?' },
      { role: 0, text: 'saí um pouco sábado mas nada demais' },
      { role: 1, text: 'bora marcar um café qualquer dia desses' },
      { role: 0, text: 'bora sim! me avisa' },
    ],
  },
  {
    id: 'almoco',
    turns: [
      { role: 0, text: 'e aí, já almoçou?' },
      { role: 1, text: 'ainda não, tô morrendo de fome kkk' },
      { role: 0, text: 'vai comer o que hj?' },
      { role: 1, text: 'acho que vou fazer um macarrão rapidão' },
      { role: 0, text: 'boa pedida' },
      { role: 1, text: 'e vc?' },
      { role: 0, text: 'vou pedir um lanche, tô sem tempo de cozinhar' },
      { role: 1, text: 'kkkk clássico' },
    ],
  },
  {
    id: 'trabalho',
    turns: [
      { role: 0, text: 'dia corrido hj?' },
      { role: 1, text: 'bastante, mal parei' },
      { role: 0, text: 'aqui tbm tá puxado' },
      { role: 1, text: 'mas sexta já tá chegando né' },
      { role: 0, text: 'graças a deus kkk' },
      { role: 1, text: 'bora aguentar firme' },
      { role: 0, text: 'isso aí 💪' },
    ],
  },
  {
    id: 'clima',
    turns: [
      { role: 0, text: 'nossa que frio hj em' },
      { role: 1, text: 'muito! nem quis levantar da cama' },
      { role: 0, text: 'kkkk mesma coisa' },
      { role: 1, text: 'tá com cara de chuva ainda' },
      { role: 0, text: 'é, melhor levar guarda-chuva' },
      { role: 1, text: 'vou levar sim, valeu o toque' },
    ],
  },
  {
    id: 'futebol',
    turns: [
      { role: 0, text: 'viu o jogo ontem?' },
      { role: 1, text: 'vi! que jogão' },
      { role: 0, text: 'no fim quase perdemos hein kkk' },
      { role: 1, text: 'meu coração não aguenta mais 😂' },
      { role: 0, text: 'kkkk verdade' },
      { role: 1, text: 'próxima rodada é quando?' },
      { role: 0, text: 'quarta acho, vou confirmar' },
    ],
  },
  {
    id: 'planos',
    turns: [
      { role: 0, text: 'vai fazer algo no feriado?' },
      { role: 1, text: 'talvez viajar pra praia, e vc?' },
      { role: 0, text: 'boa! ainda tô decidindo' },
      { role: 1, text: 'se quiser cola com a gente' },
      { role: 0, text: 'ó, pode ser! me manda os detalhes depois' },
      { role: 1, text: 'mando sim 👍' },
    ],
  },
  {
    id: 'serie',
    turns: [
      { role: 0, text: 'tá vendo alguma série boa?' },
      { role: 1, text: 'comecei uma nova ontem, tô viciado' },
      { role: 0, text: 'qual?' },
      { role: 1, text: 'uma de suspense, super recomendo' },
      { role: 0, text: 'vou anotar aqui então' },
      { role: 1, text: 'depois me conta o que achou' },
      { role: 0, text: 'combinado' },
    ],
  },
  {
    id: 'academia',
    turns: [
      { role: 0, text: 'foi treinar hj?' },
      { role: 1, text: 'fui de manhã, tô todo dolorido kkk' },
      { role: 0, text: 'kkkk treino pesado então' },
      { role: 1, text: 'perna, o pior dia 😩' },
      { role: 0, text: 'coragem! amanhã melhora' },
      { role: 1, text: 'espero que sim kkk' },
    ],
  },
  {
    id: 'bom-dia',
    turns: [
      { role: 0, text: 'bom dia! tudo certo?' },
      { role: 1, text: 'bom dia, tudo sim! e por aí?' },
      { role: 0, text: 'tudo tranquilo, começando o dia agora' },
      { role: 1, text: 'mesma coisa, tomando um café' },
      { role: 0, text: 'nada melhor né kkk' },
      { role: 1, text: 'com certeza ☕' },
    ],
  },
  {
    id: 'ajuda',
    turns: [
      { role: 0, text: 'ei, você tem um tempinho depois?' },
      { role: 1, text: 'tenho sim, o que precisa?' },
      { role: 0, text: 'queria tua opinião numa coisa aqui' },
      { role: 1, text: 'claro, pode chamar' },
      { role: 0, text: 'valeu mesmo, te chamo mais tarde' },
      { role: 1, text: 'tranquilo, tô por aqui' },
    ],
  },
  {
    id: 'compras',
    turns: [
      { role: 0, text: 'preciso passar no mercado hj' },
      { role: 1, text: 'eu tbm, tá faltando tudo em casa kkk' },
      { role: 0, text: 'kkkk clássico fim de mês' },
      { role: 1, text: 'vou aproveitar as promoções' },
      { role: 0, text: 'boa ideia, me avisa se achar algo bom' },
      { role: 1, text: 'aviso sim' },
    ],
  },
  {
    id: 'musica',
    turns: [
      { role: 0, text: 'tá ouvindo o que ultimamente?' },
      { role: 1, text: 'descobri uma playlist nova, muito boa' },
      { role: 0, text: 'me manda depois' },
      { role: 1, text: 'mando! acho que vc vai curtir' },
      { role: 0, text: 'show, valeu 🎧' },
    ],
  },
  {
    id: 'reencontro',
    turns: [
      { role: 0, text: 'quanto tempo hein! sumiu' },
      { role: 1, text: 'pois é, correria total esses dias' },
      { role: 0, text: 'imagino, tá tudo bem aí?' },
      { role: 1, text: 'tá sim, só cheio de coisa. e vc?' },
      { role: 0, text: 'na mesma, mas levando 😄' },
      { role: 1, text: 'precisamos marcar de sair' },
      { role: 0, text: 'com certeza, bora ver uma data' },
    ],
  },
  {
    id: 'cafe-tarde',
    turns: [
      { role: 0, text: 'hora do cafezinho da tarde 😄' },
      { role: 1, text: 'kkkk sagrado isso' },
      { role: 0, text: 'sem ele não rendo nada' },
      { role: 1, text: 'concordo demais' },
      { role: 0, text: 'bom, vou voltar pro trampo' },
      { role: 1, text: 'vai lá, depois a gente conversa' },
    ],
  },
];

export function pickScript(): ConversationScript {
  return scripts[Math.floor(Math.random() * scripts.length)];
}
