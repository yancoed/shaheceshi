import type { TemplateField, DataTemplate } from './types';
import { makeRng, pickOne, randInt } from './utils';

/** 生成一行数据 */
export function generateRow(fields: TemplateField[], rng: () => number, index: number, refs: Record<string, string> = {}): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const f of fields) {
    row[f.name] = generateValue(f, rng, index, refs);
    if (typeof row[f.name] === 'string') refs[f.name] = row[f.name] as string;
  }
  return row;
}

function generateValue(f: TemplateField, rng: () => number, index: number, refs: Record<string, string>): unknown {
  switch (f.type) {
    case 'string': {
      const v = `${f.prefix || ''}${randStr(rng, 6)}${f.suffix || ''}`;
      return v;
    }
    case 'int': {
      const min = f.min ?? 0;
      const max = f.max ?? 100;
      return randInt(rng, min, max);
    }
    case 'float': {
      const min = f.min ?? 0;
      const max = f.max ?? 10;
      return +(rng() * (max - min) + min).toFixed(2);
    }
    case 'enum': {
      if (!f.enumValues || f.enumValues.length === 0) return null;
      return pickOne(rng, f.enumValues);
    }
    case 'date': {
      const dayOffset = randInt(rng, 0, 30);
      const d = new Date(Date.now() - dayOffset * 86400_000);
      return d.toISOString().slice(0, 10);
    }
    case 'sku': {
      return `${f.prefix || 'SKU'}-${String(index + 1).padStart(4, '0')}`;
    }
    case 'barcode': {
      return `${f.prefix || ''}${randInt(rng, 1000000000, 9999999999)}`;
    }
    case 'bool':
      return rng() > 0.5;
  }
}

function randStr(rng: () => number, len: number) {
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: len }, () => pickOne(rng, CHARS.split(''))).join('');
}

/** 按模板生成 N 行数据 */
export function generateRows(template: DataTemplate): Record<string, unknown>[] {
  // 优先使用模板内置的 customRows（用于演示/测试场景，需要显式控制同品/同批/异品组合）
  if (template.customRows && template.customRows.length > 0) {
    return template.customRows.map((r) => ({ ...r }));
  }
  const rng = makeRng(template.seed ?? 42);
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < template.rowCount; i++) {
    const refs: Record<string, string> = {};
    rows.push(generateRow(template.fields, rng, i, refs));
  }
  return rows;
}

// ===== CSV 解析 / 序列化 =====

/** 解析 CSV 文本 → { headers, rows }，支持带引号转义 */
export function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = splitCSVLine(lines[0]);
  const rows = lines.slice(1).map(splitCSVLine);
  return { headers, rows };
}

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

/** 将表格数据序列化为 CSV */
export function toCSV(headers: string[], rows: Record<string, unknown>[]): string {
  const esc = (v: unknown) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
}

/** 根据样本行推断字段类型 */
export function inferFields(headers: string[], sample: string[][]): TemplateField[] {
  return headers.map((h, i) => {
    const vals = sample.map((r) => r[i]).filter((v) => v !== undefined && v !== '');
    let type: TemplateField['type'] = 'string';
    if (vals.every((v) => /^-?\d+$/.test(v))) type = 'int';
    else if (vals.every((v) => /^-?\d+\.\d+$/.test(v))) type = 'float';
    else if (vals.every((v) => /^\d{4}-\d{2}-\d{2}$/.test(v))) type = 'date';
    else if (h.toLowerCase().includes('sku')) type = 'sku';
    else if (h.toLowerCase().includes('barcode') || h.toLowerCase().includes('条码')) type = 'barcode';
    return {
      name: h,
      type,
      required: false,
      min: type === 'int' || type === 'float' ? 0 : undefined,
      max: type === 'int' ? 100 : type === 'float' ? 1000 : undefined,
    };
  });
}

// ===== 模板变量插值 =====

/** 解析 {{var}} 模板，从上下文取变量；保留未找到的为原样 */
export function interpolate(template: string, ctx: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const v = getPath(ctx, key);
    if (v === undefined || v === null) return `{{${key}}}`;
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  });
}

export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}
