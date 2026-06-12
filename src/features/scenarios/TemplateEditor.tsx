import { useRef, useState } from 'react';
import { useStore } from '@/stores/sandbox';
import { parseCSV, inferFields, generateRows, toCSV } from '@/lib/template';
import { Upload, FileText, Trash2, Download, Plus, X, Play } from 'lucide-react';
import type { DataTemplate, FieldType, TemplateField } from '@/lib/types';

const FIELD_TYPES: { id: FieldType; name: string }[] = [
  { id: 'string',  name: '字符串' },
  { id: 'int',     name: '整数' },
  { id: 'float',   name: '小数' },
  { id: 'enum',    name: '枚举' },
  { id: 'date',    name: '日期' },
  { id: 'sku',     name: 'SKU' },
  { id: 'barcode', name: '条码' },
  { id: 'bool',    name: '布尔' },
];

export default function TemplateEditor({ template }: { template: DataTemplate }) {
  const updateTemplate = useStore((s) => s.updateTemplate);
  const fileInput = useRef<HTMLInputElement>(null);
  const [parseInfo, setParseInfo] = useState<{ rows: number; cols: number } | null>(null);

  const handleUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result || '');
      const isJson = file.name.toLowerCase().endsWith('.json');
      if (isJson) {
        try {
          const data = JSON.parse(text);
          const arr = Array.isArray(data) ? data : data.rows || [];
          if (arr.length === 0) return;
          const headers = Object.keys(arr[0]);
          const inferred = inferFields(headers, arr.slice(0, 20).map((r: Record<string, unknown>) => headers.map((h) => String(r[h] ?? ''))));
          updateTemplate(template.id, {
            name: template.name || file.name.replace(/\.[^.]+$/, ''),
            source: 'json',
            rowCount: arr.length,
            fields: inferred,
          });
          setParseInfo({ rows: arr.length, cols: headers.length });
        } catch (err) {
          alert('JSON 解析失败：' + err);
        }
      } else {
        const { headers, rows } = parseCSV(text);
        if (headers.length === 0) return;
        const inferred = inferFields(headers, rows.slice(0, 20));
        updateTemplate(template.id, {
          name: template.name || file.name.replace(/\.[^.]+$/, ''),
          source: 'csv',
          rowCount: rows.length,
          fields: inferred,
        });
        setParseInfo({ rows: rows.length, cols: headers.length });
      }
    };
    reader.readAsText(file);
  };

  const updateField = (i: number, patch: Partial<TemplateField>) => {
    const newFields = template.fields.map((f, idx) => idx === i ? { ...f, ...patch } : f);
    updateTemplate(template.id, { fields: newFields });
  };

  const addField = () => {
    const name = `field${template.fields.length + 1}`;
    updateTemplate(template.id, { fields: [...template.fields, { name, type: 'string', required: false }] });
  };

  const removeField = (i: number) => {
    updateTemplate(template.id, { fields: template.fields.filter((_, idx) => idx !== i) });
  };

  const downloadSampleCsv = () => {
    const headers = ['orderId', 'sku', 'qty', 'container', 'batch', 'category'];
    const rows = generateRows({
      ...template,
      fields: [
        { name: 'orderId',   type: 'string',  required: true,  prefix: 'IB' },
        { name: 'sku',       type: 'sku',     required: true,  prefix: 'SKU' },
        { name: 'qty',       type: 'int',     required: true,  min: 5,  max: 60 },
        { name: 'container', type: 'barcode', required: false, prefix: 'CTN' },
        { name: 'batch',     type: 'string',  required: false, prefix: 'B' },
        { name: 'category',  type: 'enum',    required: false, enumValues: ['饮料', '零食', '日化'] },
      ],
      rowCount: 10,
      seed: 7,
    });
    const csv = toCSV(headers, rows);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'sample-template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  // 预览
  const previewRows = generateRows({ ...template, rowCount: Math.min(5, template.rowCount) });

  return (
    <div className="space-y-4 text-xs font-mono">
      {/* 模板基本信息 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="label">模板名 / NAME</span>
          <input
            value={template.name}
            onChange={(e) => updateTemplate(template.id, { name: e.target.value })}
            className="w-full bg-bg-base border border-bg-border px-2 py-1.5 text-[11px] text-ink-primary focus:outline-none mt-1"
          />
        </div>
        <div>
          <span className="label">数据行数 / ROWS</span>
          <div className="flex items-center border border-bg-border bg-bg-base mt-1">
            <input
              type="number"
              value={template.rowCount}
              min={1}
              max={10000}
              onChange={(e) => updateTemplate(template.id, { rowCount: Math.max(1, Math.min(10000, Number(e.target.value) || 1)) })}
              className="flex-1 h-7 bg-transparent px-2 text-center text-[11px] text-ink-primary focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div>
        <span className="label">描述 / DESCRIPTION</span>
        <input
          value={template.description}
          onChange={(e) => updateTemplate(template.id, { description: e.target.value })}
          className="w-full bg-bg-base border border-bg-border px-2 py-1.5 text-[11px] text-ink-primary focus:outline-none mt-1"
        />
      </div>

      {/* 上传 + 样例下载 */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => fileInput.current?.click()}
          className="border border-dashed border-bg-border bg-bg-raised/40 hover:border-accent-amber/60 hover:bg-accent-amber/5 p-3 text-center transition-colors"
        >
          <Upload size={16} className="mx-auto text-accent-amber" />
          <div className="text-[11px] text-ink-primary mt-1">上传 CSV / JSON</div>
          <div className="text-[9px] text-ink-muted mt-0.5">首行表头 · 自动推断类型</div>
        </button>
        <input ref={fileInput} type="file" accept=".csv,.json" className="hidden" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />

        <button
          onClick={downloadSampleCsv}
          className="border border-bg-border bg-bg-raised hover:border-accent-amber/60 p-3 text-center transition-colors"
        >
          <FileText size={16} className="mx-auto text-accent-green" />
          <div className="text-[11px] text-ink-primary mt-1">下载样例 CSV</div>
          <div className="text-[9px] text-ink-muted mt-0.5">含 6 字段 · 10 行</div>
        </button>
      </div>
      {parseInfo && (
        <div className="text-[10px] text-accent-green font-mono">
          ✓ 已解析：{parseInfo.cols} 列 · {parseInfo.rows} 行
        </div>
      )}

      {/* 字段列表 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="label">字段 / FIELDS · {template.fields.length} 列</span>
          <button onClick={addField} className="text-accent-amber hover:underline text-[10px] flex items-center gap-1">
            <Plus size={10} /> 添加字段
          </button>
        </div>
        {template.fields.length === 0 && (
          <div className="text-center text-ink-muted py-6 border border-dashed border-bg-border">
            尚无字段 · 上传 CSV/JSON 或点击「添加字段」
          </div>
        )}
        <div className="space-y-1.5">
          {template.fields.map((f, i) => (
            <div key={i} className="border border-bg-border bg-bg-raised/40 p-2">
              <div className="grid grid-cols-[1fr_120px_28px] gap-2">
                <input
                  value={f.name}
                  onChange={(e) => updateField(i, { name: e.target.value })}
                  className="bg-bg-base border border-bg-border px-2 py-1 text-[11px] text-ink-primary focus:outline-none"
                />
                <select
                  value={f.type}
                  onChange={(e) => updateField(i, { type: e.target.value as FieldType })}
                  className="bg-bg-base border border-bg-border px-2 py-1 text-[11px] text-accent-amber focus:outline-none"
                >
                  {FIELD_TYPES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <button onClick={() => removeField(i)} className="text-ink-muted hover:text-accent-red">
                  <X size={12} className="mx-auto" />
                </button>
              </div>
              <FieldExtras field={f} onChange={(p) => updateField(i, p)} />
            </div>
          ))}
        </div>
      </div>

      {/* 预览 */}
      {template.fields.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="label">数据预览 / PREVIEW · 前 5 行</span>
            <span className="text-[10px] text-ink-muted">由当前规则生成</span>
          </div>
          <div className="overflow-x-auto border border-bg-border">
            <table className="w-full text-[10px] font-mono">
              <thead className="bg-bg-raised text-ink-secondary">
                <tr>
                  {template.fields.map((f) => (
                    <th key={f.name} className="text-left px-2 py-1 border-b border-bg-border whitespace-nowrap">{f.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, i) => (
                  <tr key={i} className="border-b border-bg-border/40 hover:bg-bg-raised/40">
                    {template.fields.map((f) => (
                      <td key={f.name} className="px-2 py-1 text-ink-primary whitespace-nowrap">{String(r[f.name] ?? '')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldExtras({ field, onChange }: { field: TemplateField; onChange: (p: Partial<TemplateField>) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 mt-1.5">
      {(field.type === 'int' || field.type === 'float') && (
        <>
          <SmallNum label="最小" value={field.min ?? 0} onChange={(n) => onChange({ min: n })} />
          <SmallNum label="最大" value={field.max ?? 100} onChange={(n) => onChange({ max: n })} />
        </>
      )}
      {(field.type === 'string' || field.type === 'sku' || field.type === 'barcode') && (
        <>
          <SmallText label="前缀" value={field.prefix ?? ''} onChange={(s) => onChange({ prefix: s })} />
          <SmallText label="后缀" value={field.suffix ?? ''} onChange={(s) => onChange({ suffix: s })} />
        </>
      )}
      {field.type === 'enum' && (
        <div className="col-span-2">
          <span className="text-[9px] text-ink-muted">枚举值（逗号分隔）</span>
          <input
            value={(field.enumValues ?? []).join(',')}
            onChange={(e) => onChange({ enumValues: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
            className="w-full bg-bg-base border border-bg-border px-2 py-1 text-[10px] text-ink-primary focus:outline-none mt-0.5"
            placeholder="饮料,零食,日化"
          />
        </div>
      )}
    </div>
  );
}

function SmallNum({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div>
      <span className="text-[9px] text-ink-muted">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full bg-bg-base border border-bg-border px-2 py-1 text-[10px] text-ink-primary focus:outline-none mt-0.5"
      />
    </div>
  );
}
function SmallText({ label, value, onChange }: { label: string; value: string; onChange: (s: string) => void }) {
  return (
    <div>
      <span className="text-[9px] text-ink-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-bg-base border border-bg-border px-2 py-1 text-[10px] text-ink-primary focus:outline-none mt-0.5"
      />
    </div>
  );
}
