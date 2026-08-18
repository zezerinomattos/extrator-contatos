import { Router } from 'express';
import ExcelJS from 'exceljs';
import { contactsRepository } from '../contacts/contacts.repository';
import { remarketingRepository } from '../remarketing/remarketing.repository';

export const exportRouter = Router();

const TAG_LABELS: Record<string, string> = {
  morno: 'Morno',
  quente: 'Quente',
  muito_quente: 'Muito quente',
  placas: 'Já tem placas solares',
};

exportRouter.get('/contacts.xlsx', async (req, res) => {
  const { niche, status } = req.query as { niche?: string; status?: string };
  const contacts = contactsRepository.list({ niche, status });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Contatos');

  sheet.columns = [
    { header: 'Empresa', key: 'name', width: 40 },
    { header: 'Telefone', key: 'phone_display', width: 20 },
    { header: 'Endereço', key: 'address', width: 50 },
    { header: 'Nicho', key: 'niche', width: 30 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Extraído em', key: 'created_at', width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };
  contacts.forEach((c) => sheet.addRow(c));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="contatos.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});

exportRouter.get('/remarketing.xlsx', async (req, res) => {
  const { tag } = req.query as { tag?: string };
  const rows = remarketingRepository.list(tag).map((r) => ({
    ...r,
    tagLabel: TAG_LABELS[r.tag] ?? r.tag,
  }));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Remarketing');
  sheet.columns = [
    { header: 'Empresa', key: 'name', width: 40 },
    { header: 'Telefone', key: 'phone_display', width: 20 },
    { header: 'Etiqueta', key: 'tagLabel', width: 22 },
    { header: 'Endereço', key: 'address', width: 50 },
    { header: 'Nicho', key: 'niche', width: 30 },
    { header: 'Atualizado em', key: 'updated_at', width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };
  rows.forEach((r) => sheet.addRow(r));

  const suffix = tag ? `-${tag}` : '';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="remarketing${suffix}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});
