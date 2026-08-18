/**
 * Cliente da Places API (New) — Text Search.
 * Docs: https://developers.google.com/maps/documentation/places/web-service/text-search
 *
 * O custo é por REQUISIÇÃO (cada uma retorna até 20 lugares), não por lugar.
 * Percorremos TODAS as páginas que o Google devolver. Atenção: o próprio
 * Google limita o Text Search a ~60 resultados por pesquisa — para cidades
 * grandes, pesquise por bairro/região que os resultados se somam na base
 * (duplicados são descartados automaticamente).
 * O FieldMask abaixo pede só os campos necessários — pedir campos a mais
 * sobe o SKU de cobrança e encarece a chamada.
 */
const SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const MAX_PAGES = 20; // trava de segurança contra loop infinito, não um limite prático

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.nationalPhoneNumber',
  'places.formattedAddress',
  'nextPageToken',
].join(',');

interface ApiPlace {
  id: string;
  displayName?: { text?: string };
  nationalPhoneNumber?: string;
  formattedAddress?: string;
}

interface ApiResponse {
  places?: ApiPlace[];
  nextPageToken?: string;
  error?: { message?: string; status?: string };
}

export interface PlaceResult {
  name: string;
  phone: string | null;
  address: string | null;
}

export async function searchPlacesByText(query: string, apiKey: string): Promise<PlaceResult[]> {
  const results: PlaceResult[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: 'pt-BR',
        regionCode: 'BR',
        ...(pageToken ? { pageToken } : {}),
      }),
    });

    const body = (await response.json()) as ApiResponse;

    if (!response.ok) {
      const detail = body.error?.message ?? `HTTP ${response.status}`;
      throw new Error(`Erro na Places API: ${detail}`);
    }

    for (const place of body.places ?? []) {
      results.push({
        name: place.displayName?.text ?? 'Sem nome',
        phone: place.nationalPhoneNumber ?? null,
        address: place.formattedAddress ?? null,
      });
    }

    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }

  return results;
}
