import ExcelJS from 'exceljs';
import path from 'node:path';
import { normalizeBrazilPhone } from '../../shared/phone';
import { contactsRepository } from './contacts.repository';

export interface ImportResult {
  totalRows: number;
  inserted: number;
  duplicates: number;
  invalid: number; // linhas sem telefone válido
}

const PHONE_HEADERS = ['telefone', 'fone', 'phone', 'celular', 'whatsapp'];
const NAME_HEADERS = ['empresa', 'nome', 'name'];
const NICHE_HEADERS = ['nicho', 'lista'];
const ADDRESS_HEADERS = ['endere', 'address'];

function findColumn(headers: string[], candidates: string[]): number {
  const idx = headers.findIndex((h) => candidates.some((c) => h.includes(c)));
  return idx >= 0 ? idx + 1 : 0; // exceljs usa colunas a partir de 1; 0 = não achou
}

/**
 * Importa uma planilha (.xlsx ou .csv) de volta para a base.
 * Reconhece os cabeçalhos do nosso próprio export ("Empresa", "Telefone"...),
 * mas aceita qualquer planilha que tenha uma coluna de telefone.
 * A deduplicação continua valendo: telefone repetido é ignorado.
 */
export async function importContactsFile(
  filePath: string,
  fallbackNiche: string,
): Promise<ImportResult> {
  const workbook = new ExcelJS.Workbook();
  if (path.extname(filePath).toLowerCase() === '.csv') {
    await workbook.csv.readFile(filePath);
  } else {
    await workbook.xlsx.readFile(filePath);
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error('A planilha está vazia.');
  }

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = cell.text.trim().toLowerCase();
  });

  let phoneCol = findColumn(headers, PHONE_HEADERS);
  let nameCol = findColumn(headers, NAME_HEADERS);
  let nicheCol = findColumn(headers, NICHE_HEADERS);
  let addressCol = findColumn(headers, ADDRESS_HEADERS);
  let firstDataRow = 2;

  // sem cabeçalho reconhecível: assume coluna 1 = nome, coluna 2 = telefone
  if (!phoneCol) {
    nameCol = 1;
    phoneCol = 2;
    nicheCol = 0;
    addressCol = 0;
    firstDataRow = 1;
  }

  const result: ImportResult = { totalRows: 0, inserted: 0, duplicates: 0, invalid: 0 };

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber < firstDataRow) return;
    const phoneRaw = row.getCell(phoneCol).text.trim();
    const name = nameCol ? row.getCell(nameCol).text.trim() : '';
    if (!phoneRaw && !name) return; // linha em branco

    result.totalRows++;
    const phone = normalizeBrazilPhone(phoneRaw);
    if (!phone) {
      result.invalid++;
      return;
    }

    const inserted = contactsRepository.insert({
      name: name || 'Sem nome',
      phone,
      phone_display: phoneRaw,
      address: addressCol ? row.getCell(addressCol).text.trim() || null : null,
      niche: (nicheCol ? row.getCell(nicheCol).text.trim() : '') || fallbackNiche,
      source: 'importado',
    });
    if (inserted) {
      result.inserted++;
    } else {
      result.duplicates++;
    }
  });

  return result;
}
