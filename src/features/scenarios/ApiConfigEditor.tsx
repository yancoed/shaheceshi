import { useMemo, useState } from 'react';
import type { ApiConfig, DataTemplate, ScenarioNode, StageDevice } from '@/lib/types';
import { DEVICE_FIELDS_SCHEMA, buildDefaultFields } from '@/lib/types';
import { useStore } from '@/stores/sandbox';
import { Plus, Trash2, X, Braces, Wand2, Eye, Cpu } from 'lucide-react';
import { generateRows, interpolate } from '@/lib/template';

export default function ApiConfigEditor({ api, onChange, boundTpl, scenarioId, node }: { api: ApiConfig; onChange: (a: ApiConfig) => void; boundTpl?: DataTemplate; scenarioId?: string; node?: ScenarioNode }) {
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const scenario = useStore((s) => scenarioId ? s.scenarios.find((sc) => sc.id === scenarioId) : undefined);
  const stageDevices: StageDevice[] = scenario?.stage?.devices ?? [];
  // 当前节点绑定的设备
  const boundDeviceIds = [
    ...(node?.sourceDeviceIds ?? []),
    ...(node?.targetDeviceIds ?? []),
  ];
  const boundDevices = boundDeviceIds
    .map((id) => stageDevices.find((d) => d.id === id))
    .filter(Boolean) as StageDevice[];

  const validateJson = (s: string): boolean => {
    // 含 {{}} 占位符的模板不参与 JSON 解析校验（占位符尚未替换，不构成合法 JSON）
    if (/\{\{[\s\S]*?\}\}/.test(s)) { setJsonError(null); return true; }
    if (!s.trim()) { setJsonError(null); return true; }
    try { JSON.parse(s); setJsonError(null); return true; }
    catch (e) { setJsonError(String(e)); return false; }
  };

  /** 一键从模板生成 body：把每个字段按类型输出成 JSON 字符串（数值无引号，字符串带引号） */
  const generateBodyFromTpl = () => {
    if (!boundTpl || boundTpl.fields.length === 0) return;
    const lines = boundTpl.fields.map((f) => {
      const isNumeric = f.type === 'int' || f.type === 'float';
      return `  "${f.name}": ${isNumeric ? '' : '"'}{{${f.name}}}${isNumeric ? '' : '"'}`;
    });
    const json = `{\n${lines.join(',\n')}\n}`;
    onChange({ ...api, body: json });
    validateJson(json);
  };

  /** 用模板第一行渲染当前 body，做实时预览 */
  const previewBody = useMemo(() => {
    if (!boundTpl || !api.body.trim()) return null;
    try {
      const rows = generateRows(boundTpl);
      const ctx: Record<string, unknown> = { ...(rows[0] || {}) };
      return interpolate(api.body, ctx);
    } catch {
      return null;
    }
  }, [boundTpl, api.body]);

  return (
    <div className="space-y-3 text-xs font-mono">
      {/* Method + URL */}
      <div className="grid grid-cols-[100px_1fr] gap-2">
        <select
          value={api.method}
          onChange={(e) => onChange({ ...api, method: e.target.value as ApiConfig['method'] })}
          className="bg-bg-base border border-bg-border px-2 py-1.5 text-ink-primary focus:outline-none focus:border-accent-amber/60"
        >
          {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <input
          value={api.url}
          onChange={(e) => onChange({ ...api, url: e.target.value })}
          placeholder="https://api.example.com/path/{{nodeId.field}}"
          className="bg-bg-base border border-bg-border px-2 py-1.5 text-ink-primary focus:outline-none focus:border-accent-amber/60"
        />
      </div>

      {/* Headers */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="label">请求头 / HEADERS</span>
          <button
            onClick={() => onChange({ ...api, headers: { ...api.headers, 'X-New': 'value' } })}
            className="text-accent-amber hover:underline text-[10px] flex items-center gap-1"
          >
            <Plus size={10} /> 添加
          </button>
        </div>
        <div className="space-y-1">
          {Object.entries(api.headers).map(([k, v]) => (
            <div key={k} className="grid grid-cols-[1fr_2fr_24px] gap-1">
              <input
                value={k}
                onChange={(e) => {
                  const nh = { ...api.headers };
                  delete nh[k];
                  nh[e.target.value] = v;
                  onChange({ ...api, headers: nh });
                }}
                className="bg-bg-base border border-bg-border px-2 py-1 text-[11px] text-accent-blue focus:outline-none"
              />
              <input
                value={v}
                onChange={(e) => onChange({ ...api, headers: { ...api.headers, [k]: e.target.value } })}
                className="bg-bg-base border border-bg-border px-2 py-1 text-[11px] text-ink-primary focus:outline-none"
              />
              <button
                onClick={() => { const nh = { ...api.headers }; delete nh[k]; onChange({ ...api, headers: nh }); }}
                className="text-ink-muted hover:text-accent-red"
              >
                <X size={12} className="mx-auto" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="label flex items-center gap-1"><Braces size={10} /> 请求体 / BODY · 支持 {`{{字段名}}`}</span>
          <div className="flex items-center gap-2">
            {boundTpl && boundTpl.fields.length > 0 && (
              <button
                onClick={generateBodyFromTpl}
                className="text-accent-amber hover:underline text-[10px] flex items-center gap-0.5"
                title={`按模板「${boundTpl.name}」的 ${boundTpl.fields.length} 个字段生成 body 骨架`}
              >
                <Wand2 size={10} /> 从模板生成
              </button>
            )}
            {boundTpl && api.body.trim() && (
              <button
                onClick={() => setShowPreview((v) => !v)}
                className={`text-[10px] flex items-center gap-0.5 ${showPreview ? 'text-accent-green' : 'text-ink-muted hover:text-accent-green'}`}
                title="用模板第一行渲染当前 body 预览"
              >
                <Eye size={10} /> 预览
              </button>
            )}
            <span className="text-[10px] text-ink-muted">JSON</span>
          </div>
        </div>
        <textarea
          value={api.body}
          onChange={(e) => { onChange({ ...api, body: e.target.value }); validateJson(e.target.value); }}
          rows={5}
          spellCheck={false}
          className="w-full bg-bg-base border border-bg-border px-2 py-1.5 text-[11px] text-ink-primary font-mono resize-y focus:outline-none focus:border-accent-amber/60"
        />
        {showPreview && previewBody !== null && (
          <div className="mt-1 border border-accent-green/40 bg-accent-green/5 p-2">
            <div className="text-[9px] font-mono uppercase tracking-widest text-accent-green mb-1">
              · 模板第 1 行渲染预览 / ROW 1 PREVIEW
            </div>
            <pre className="text-[10px] text-ink-primary font-mono whitespace-pre-wrap break-all">{previewBody}</pre>
          </div>
        )}
        {jsonError && <div className="text-[10px] text-accent-red mt-1">⚠ JSON 解析失败：{jsonError}</div>}

        {/* 设备字段提示：本节点绑定的设备 → 可用 {{device.xxx}} 变量 */}
        {boundDevices.length > 0 && (
          <div className="mt-1 border border-bg-border bg-bg-raised/30 p-1.5">
            <div className="text-[9px] font-mono uppercase tracking-widest text-accent-amber mb-1 flex items-center gap-1">
              <Cpu size={9} /> 设备字段映射 / DEVICE FIELDS
            </div>
            <div className="flex flex-wrap gap-1">
              {boundDevices.map((d) => {
                const defs = DEVICE_FIELDS_SCHEMA[d.kind] ?? [];
                return (
                  <div key={d.id} className="border border-bg-border bg-bg-base px-1.5 py-1 text-[9px] font-mono">
                    <div className="text-ink-primary">{d.name} <span className="text-ink-muted">· {d.kind}</span></div>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {defs.filter((x) => x.apiField).map((x) => {
                        const val = d.fields?.[x.key] ?? x.defaultValue;
                        return (
                          <span key={x.key} className="px-1 py-0.5 bg-bg-raised/40 border border-bg-border text-ink-secondary" title={`apiField: ${x.apiField} · 当前值: ${String(val ?? '—')}`}>
                            <span className="text-accent-amber">{`{{device.${x.apiField}}}`}</span>
                            <span className="text-ink-muted ml-1">→ {String(val ?? '—')}</span>
                          </span>
                        );
                      })}
                      {defs.filter((x) => x.apiField).length === 0 && (
                        <span className="text-ink-muted">无映射字段</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Response mapping */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="label">响应取值路径 / MAPPING</span>
          <input
            value={api.responseMapping}
            onChange={(e) => onChange({ ...api, responseMapping: e.target.value })}
            placeholder="data.items"
            className="w-full bg-bg-base border border-bg-border px-2 py-1.5 text-[11px] text-accent-green focus:outline-none focus:border-accent-amber/60 mt-1"
          />
          <p className="text-[9px] text-ink-muted mt-0.5">点路径，如 data.items · 留空返回全量</p>
        </div>
        <div>
          <span className="label">超时 / TIMEOUT (ms)</span>
          <div className="flex items-center border border-bg-border bg-bg-base mt-1">
            <input
              type="number"
              value={api.timeoutMs}
              onChange={(e) => onChange({ ...api, timeoutMs: Number(e.target.value) || 1000 })}
              className="flex-1 h-7 bg-transparent px-2 text-[11px] text-ink-primary focus:outline-none"
            />
            <span className="px-2 text-[10px] text-ink-muted">ms</span>
          </div>
        </div>
      </div>

      {/* Mock response */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="label flex items-center gap-1"><Braces size={10} /> 沙盒 Mock 响应 / MOCK · URL 含 example/mock 时使用</span>
          <span className="text-[10px] text-ink-muted">JSON</span>
        </div>
        <textarea
          value={api.mockResponse}
          onChange={(e) => { onChange({ ...api, mockResponse: e.target.value }); validateJson(e.target.value); }}
          rows={4}
          spellCheck={false}
          className="w-full bg-bg-base border border-bg-border px-2 py-1.5 text-[11px] text-ink-primary font-mono resize-y focus:outline-none focus:border-accent-amber/60"
        />
      </div>

      {/* Retry + Concurrency */}
      <div className="grid grid-cols-2 gap-3 text-[11px]">
        <div>
          <span className="label">失败重试 / RETRY</span>
          <div className="flex items-center border border-bg-border bg-bg-base mt-1">
            <input
              type="number"
              min={0}
              max={5}
              value={api.retry}
              onChange={(e) => onChange({ ...api, retry: Number(e.target.value) || 0 })}
              className="flex-1 h-7 bg-transparent px-2 text-center text-ink-primary focus:outline-none"
            />
            <span className="px-2 text-[10px] text-ink-muted">次</span>
          </div>
        </div>
        <div>
          <span className="label">批量并发 / BATCH CONCURRENCY</span>
          <div className="flex items-center border border-bg-border bg-bg-base mt-1">
            <input
              type="number"
              min={1}
              max={20}
              value={api.batchConcurrency ?? 5}
              onChange={(e) => onChange({ ...api, batchConcurrency: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })}
              className="flex-1 h-7 bg-transparent px-2 text-center text-ink-primary focus:outline-none"
            />
            <span className="px-2 text-[10px] text-ink-muted">并发</span>
          </div>
          <p className="text-[9px] text-ink-muted mt-0.5">仅当绑定模板时生效</p>
        </div>
      </div>
    </div>
  );
}
