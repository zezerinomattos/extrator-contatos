import { env } from '../../config/env';
import { normalizeBrazilPhone } from '../../shared/phone';
import { contactsRepository } from '../contacts/contacts.repository';
import { searchPlacesByText } from './googlePlaces.client';

export interface ExtractionResult {
  query: string;
  found: number;        // lugares retornados pelo Google
  withPhone: number;    // quantos tinham telefone válido
  inserted: number;     // novos salvos no banco
  duplicates: number;   // ignorados por telefone repetido
}

export async function extractContacts(query: string): Promise<ExtractionResult> {
  if (!env.googleApiKey) {
    throw new Error(
      'GOOGLE_MAPS_API_KEY não configurada. Copie .env.example para .env e informe sua chave.',
    );
  }

  const places = await searchPlacesByText(query, env.googleApiKey);

  let withPhone = 0;
  let inserted = 0;

  for (const place of places) {
    if (!place.phone) continue;
    const normalized = normalizeBrazilPhone(place.phone);
    if (!normalized) continue;

    withPhone++;
    const isNew = contactsRepository.insert({
      name: place.name,
      phone: normalized,
      phone_display: place.phone,
      address: place.address,
      niche: query.trim(),
    });
    if (isNew) inserted++;
  }

  return {
    query: query.trim(),
    found: places.length,
    withPhone,
    inserted,
    duplicates: withPhone - inserted,
  };
}
