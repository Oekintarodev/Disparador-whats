import * as fs from 'fs';
import * as path from 'path';
import csvParser from 'csv-parser';
import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';
import { ContactService } from './contactService';
import { ContactInput, ImportResult } from '../types';

const prisma = new PrismaClient();

type RawImportRow = Record<string, unknown>;

interface NormalizedImportRow {
  nome?: string;
  telefone?: string;
  email?: string;
  categoria?: string;
  categoriaId?: string;
  observacoes?: string;
}

interface ParsedImportRow {
  rowNumber: number;
  data: NormalizedImportRow;
}

const DEFAULT_CATEGORY_COLOR = '#3B82F6';
const EXCEL_EXTENSIONS = new Set(['.xlsx', '.xls']);

export class CSVImportService {
  private static readonly FIELD_ALIASES: Record<keyof NormalizedImportRow, string[]> = {
    nome: ['nome', 'nome completo', 'name', 'contato'],
    telefone: ['telefone', 'celular', 'whatsapp', 'fone', 'phone', 'numero', 'numero telefone'],
    email: ['email', 'e-mail', 'mail'],
    categoria: ['categoria', 'category', 'grupo', 'segmento', 'tag'],
    categoriaId: ['categoriaid', 'categoria_id', 'idcategoria', 'id da categoria'],
    observacoes: ['observacoes', 'observacao', 'obs', 'anotacoes', 'notes']
  };

  private static normalizeText(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private static normalizeHeaderKey(value: string): string {
    return this.normalizeText(value).replace(/[^a-z0-9]/g, '');
  }

  private static normalizeCategoryName(value?: string): string | null {
    const trimmed = (value || '').trim();
    if (!trimmed) return null;
    return trimmed.replace(/\s+/g, ' ');
  }

  private static normalizePhoneForImport(phoneRaw: string): string {
    const trimmed = phoneRaw.trim();
    const digits = trimmed.replace(/\D/g, '');

    if (!digits) return trimmed;
    if (trimmed.startsWith('+')) return `+${digits}`;
    if (digits.startsWith('00') && digits.length > 2) return `+${digits.slice(2)}`;
    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return `+${digits}`;
    if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
    return `+${digits}`;
  }

  private static normalizeRowKeys(row: RawImportRow): Record<string, string> {
    const normalized: Record<string, string> = {};

    for (const [key, value] of Object.entries(row)) {
      const normalizedKey = this.normalizeHeaderKey(String(key));
      if (!normalizedKey) continue;

      const cellValue = value == null ? '' : String(value).trim();
      if (!cellValue) continue;

      if (!normalized[normalizedKey]) {
        normalized[normalizedKey] = cellValue;
      }
    }

    return normalized;
  }

  private static resolveFieldValue(normalizedRow: Record<string, string>, aliases: string[]): string | undefined {
    for (const alias of aliases) {
      const aliasKey = this.normalizeHeaderKey(alias);
      const value = normalizedRow[aliasKey];
      if (value) return value;
    }
    return undefined;
  }

  private static mapRawRows(rawRows: RawImportRow[]): ParsedImportRow[] {
    const parsedRows: ParsedImportRow[] = [];

    rawRows.forEach((rawRow, index) => {
      const normalizedRow = this.normalizeRowKeys(rawRow);
      const mapped: NormalizedImportRow = {
        nome: this.resolveFieldValue(normalizedRow, this.FIELD_ALIASES.nome),
        telefone: this.resolveFieldValue(normalizedRow, this.FIELD_ALIASES.telefone),
        email: this.resolveFieldValue(normalizedRow, this.FIELD_ALIASES.email),
        categoria: this.resolveFieldValue(normalizedRow, this.FIELD_ALIASES.categoria),
        categoriaId: this.resolveFieldValue(normalizedRow, this.FIELD_ALIASES.categoriaId),
        observacoes: this.resolveFieldValue(normalizedRow, this.FIELD_ALIASES.observacoes)
      };

      const hasAnyField = Object.values(mapped).some((value) => Boolean(value && value.trim()));
      if (!hasAnyField) return;

      parsedRows.push({
        rowNumber: index + 2,
        data: mapped
      });
    });

    return parsedRows;
  }

  private static async parseCsvFile(filePath: string): Promise<RawImportRow[]> {
    return new Promise((resolve, reject) => {
      const rows: RawImportRow[] = [];

      fs.createReadStream(filePath)
        .pipe(csvParser())
        .on('data', (row: RawImportRow) => rows.push(row))
        .on('end', () => resolve(rows))
        .on('error', (error) => reject(error));
    });
  }

  private static parseExcelFile(filePath: string): RawImportRow[] {
    const workbook = XLSX.readFile(filePath, {
      cellDates: false,
      raw: false
    });

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return [];

    const worksheet = workbook.Sheets[firstSheetName];
    return XLSX.utils.sheet_to_json<RawImportRow>(worksheet, {
      defval: '',
      raw: false
    });
  }

  private static async parseImportFile(filePath: string): Promise<ParsedImportRow[]> {
    const extension = path.extname(filePath).toLowerCase();
    const rawRows = EXCEL_EXTENSIONS.has(extension)
      ? this.parseExcelFile(filePath)
      : await this.parseCsvFile(filePath);

    return this.mapRawRows(rawRows);
  }

  private static async resolveOrCreateCategoryId(
    categoryNameRaw: string | undefined,
    tenantId: string
  ): Promise<string | undefined> {
    const normalizedName = this.normalizeCategoryName(categoryNameRaw);
    if (!normalizedName) return undefined;

    const existingCategory = await prisma.category.findFirst({
      where: {
        tenantId,
        nome: {
          equals: normalizedName,
          mode: 'insensitive'
        }
      }
    });

    if (existingCategory) {
      return existingCategory.id;
    }

    const createdCategory = await prisma.category.create({
      data: {
        tenantId,
        nome: normalizedName,
        cor: DEFAULT_CATEGORY_COLOR,
        descricao: 'Criada automaticamente durante importacao de contatos'
      }
    });

    return createdCategory.id;
  }

  private static async resolveLegacyCategoryId(
    rawCategoryId: string | undefined,
    tenantId: string
  ): Promise<string | undefined> {
    const categoryId = (rawCategoryId || '').trim();
    if (!categoryId) return undefined;

    const existingCategory = await prisma.category.findFirst({
      where: {
        id: categoryId,
        tenantId
      }
    });

    if (!existingCategory) {
      throw new Error(`CategoriaId "${categoryId}" nao pertence ao tenant`);
    }

    return existingCategory.id;
  }

  static async checkQuotaForImport(
    tenantId: string,
    contactsToImport: number
  ): Promise<{ allowed: boolean; message?: string; remaining?: number }> {
    const tenantQuota = await prisma.tenantQuota.findUnique({
      where: { tenantId },
      include: {
        tenant: {
          include: {
            _count: {
              select: { contacts: true }
            }
          }
        }
      }
    });

    if (!tenantQuota) {
      return { allowed: false, message: 'Configuracao de quotas nao encontrada para este tenant.' };
    }

    const currentContacts = tenantQuota.tenant._count.contacts;
    const maxContacts = tenantQuota.maxContacts;
    const remaining = maxContacts - currentContacts;

    if (contactsToImport > remaining) {
      return {
        allowed: false,
        message: `Limite de contatos seria excedido. Atual: ${currentContacts}/${maxContacts}. Tentando importar: ${contactsToImport}. Disponivel: ${remaining}.`,
        remaining
      };
    }

    return { allowed: true, remaining };
  }

  static async importContacts(filePath: string, tenantId: string): Promise<ImportResult> {
    const errors: string[] = [];
    let successfulImports = 0;
    let failedImports = 0;
    let rows: ParsedImportRow[] = [];

    try {
      rows = await this.parseImportFile(filePath);

      const quotaCheck = await CSVImportService.checkQuotaForImport(tenantId, rows.length);
      if (!quotaCheck.allowed) {
        return {
          success: false,
          totalRows: rows.length,
          successfulImports: 0,
          failedImports: rows.length,
          errors: [quotaCheck.message || 'Limite de contatos excedido']
        };
      }

      for (const rowEntry of rows) {
        const { rowNumber, data } = rowEntry;

        try {
          if (!data.nome || !data.telefone) {
            errors.push(`Linha ${rowNumber}: Nome e telefone sao obrigatorios`);
            failedImports++;
            continue;
          }

          const categoriaId = data.categoria
            ? await this.resolveOrCreateCategoryId(data.categoria, tenantId)
            : await this.resolveLegacyCategoryId(data.categoriaId, tenantId);

          const contactData: ContactInput = {
            nome: data.nome.trim(),
            telefone: this.normalizePhoneForImport(data.telefone),
            email: data.email?.trim() || undefined,
            observacoes: data.observacoes?.trim() || undefined,
            categoriaId,
            tenantId
          };

          await ContactService.createContact(contactData);
          successfulImports++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
          errors.push(`Linha ${rowNumber}: ${errorMessage}`);
          failedImports++;
        }
      }

      return {
        success: errors.length === 0,
        totalRows: rows.length,
        successfulImports,
        failedImports,
        errors
      };
    } finally {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (error) {
        console.warn('Erro ao limpar arquivo temporario:', error);
      }
    }
  }
}
