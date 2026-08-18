/**
 * Normalização de telefones brasileiros para o formato E.164 sem '+'
 * (ex: "(51) 99999-8888" -> "5551999998888").
 * É essa chave normalizada que garante a deduplicação no banco.
 */
export function normalizeBrazilPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  // Remove zero de operadora à esquerda (ex: 051...)
  digits = digits.replace(/^0+/, '');

  // Já veio com DDI 55: valida o restante
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }

  // DDD + número (10 = fixo, 11 = celular)
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  return null;
}

/** Identificador de chat usado pelo WhatsApp Web ("5551999998888@c.us"). */
export function toWhatsAppId(normalizedPhone: string): string {
  return `${normalizedPhone}@c.us`;
}
