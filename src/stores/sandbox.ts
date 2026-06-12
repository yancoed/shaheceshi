import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SimulationResult, HistoricalSnapshot, Scenario, DataTemplate, ScenarioNode, ApiConfig, SimulateConfig, TemplateField, PutawayStrategyId, PickStrategyId, Dashboard, Widget, Stage, StageDevice, StageShelfRow, DeviceBusiness } from '@/lib/types';
import { buildHistoricalSnapshots, buildLocations, buildSKUs, buildInitialInventory, WAREHOUSE } from '@/lib/mock';
import { buildDefaultFields } from '@/lib/types';

// 兼容旧的「配置」结构（保留 UI 上 dataSource / historicalId 选择 + 全局策略默认值）
export interface SimulationConfig {
  scope: string[];
  scale: { orders: number; skus: number; locations: number };
  strategy: { putaway: PutawayStrategyId; pick: PickStrategyId; replenishThreshold: number };
  dataSource: 'random' | 'historical';
  historicalId?: string;
  seed?: number;
}

interface SandboxState {
  // === 场景（可配置） ===
  scenarios: Scenario[];
  currentScenarioId: string;
  // === 数据模板 ===
  templates: DataTemplate[];
  // === 看板 ===
  dashboards: Dashboard[];
  currentDashboardId: string;
  // === 历史快照 ===
  snapshots: HistoricalSnapshot[];
  // === 当前运行结果 ===
  result: SimulationResult | null;
  isRunning: boolean;
  progress: number;
  // === 旧 config 字段（保留兼容） ===
  config: SimulationConfig;
  prodConfig: { putaway: string; pick: string; replenishThreshold: number; version: string };
  syncDiff: { putaway?: [string, string]; pick?: [string, string]; replenishThreshold?: [number, number] } | null;

  // === 场景操作 ===
  setCurrentScenario: (id: string) => void;
  addScenario: (s: Scenario) => void;
  updateScenario: (id: string, patch: Partial<Scenario>) => void;
  deleteScenario: (id: string) => void;
  duplicateScenario: (id: string) => void;

  // === 节点操作 ===
  addNode: (scenarioId: string, node: ScenarioNode) => void;
  updateNode: (scenarioId: string, nodeId: string, patch: Partial<ScenarioNode>) => void;
  deleteNode: (scenarioId: string, nodeId: string) => void;
  moveNode: (scenarioId: string, nodeId: string, dir: 'up' | 'down') => void;
  toggleNode: (scenarioId: string, nodeId: string) => void;

  // === 模板操作 ===
  addTemplate: (t: DataTemplate) => void;
  updateTemplate: (id: string, patch: Partial<DataTemplate>) => void;
  deleteTemplate: (id: string) => void;

  // === 看板操作 ===
  setCurrentDashboard: (id: string) => void;
  addDashboard: (d: Dashboard) => void;
  updateDashboard: (id: string, patch: Partial<Dashboard>) => void;
  deleteDashboard: (id: string) => void;
  duplicateDashboard: (id: string) => void;
  addWidget: (dashboardId: string, widget: Widget) => void;
  updateWidget: (dashboardId: string, widgetId: string, patch: Partial<Widget>) => void;
  deleteWidget: (dashboardId: string, widgetId: string) => void;
  moveWidget: (dashboardId: string, widgetId: string, dir: 'left' | 'right') => void;

  // === 舞台操作（操作当前场景自带的 stage） ===
  updateCurrentScenarioStage: (patch: Partial<Stage>) => void;
  ensureCurrentScenarioStage: () => void;
  removeCurrentScenarioStage: () => void;
  addDevice: (device: StageDevice) => void;
  updateDevice: (deviceId: string, patch: Partial<StageDevice>) => void;
  updateDeviceSize: (deviceId: string, size: { w: number; h: number }) => void;
  deleteDevice: (deviceId: string) => void;
  setDevicePosition: (deviceId: string, position: { x: number; y: number }) => void;
  addShelfRow: (row: StageShelfRow) => void;
  removeShelfRow: (rowNumber: number) => void;
  updateShelfRow: (rowNumber: number, patch: Partial<StageShelfRow>) => void;

  // === 配置操作（兼容旧 UI） ===
  setScale: (s: SimulationConfig['scale']) => void;
  setStrategy: (s: Partial<SimulationConfig['strategy']>) => void;
  setDataSource: (d: 'random' | 'historical') => void;
  setHistoricalId: (id?: string) => void;

  // === 运行 ===
  setRunning: (running: boolean) => void;
  setProgress: (p: number) => void;
  setResult: (r: SimulationResult | null) => void;
  setSeed: (seed: number) => void;
  syncToProd: () => void;
  reset: () => void;
}

const defaultConfig: SimulationConfig = {
  scope: ['inbound', 'allocate', 'putaway'],
  scale: { orders: 12, skus: 30, locations: 60 },
  strategy: { putaway: 'nearest', pick: 's_shape', replenishThreshold: 30 },
  dataSource: 'random',
};

const sampleSimulate = (subKind: SimulateConfig['subKind'], overrides: Partial<SimulateConfig> = {}): SimulateConfig => ({
  subKind,
  count: 12,
  ...overrides,
});

const sampleApi = (overrides: Partial<ApiConfig> = {}): ApiConfig => ({
  method: 'POST',
  url: 'https://api.example.com/{{path}}',
  headers: { 'Content-Type': 'application/json', 'X-Token': 'sandbox-mock' },
  body: '{\n  "orderId": "{{inbound.orderId}}",\n  "lines": {{inbound.lines}}\n}',
  responseMapping: 'data',
  mockResponse: '{\n  "code": 200,\n  "data": {\n    "ok": true,\n    "items": []\n  }\n}',
  timeoutMs: 3000,
  retry: 0,
  batchConcurrency: 5,
  ...overrides,
});

// 内置示例场景
function makeBuiltinScenario(): Scenario {
  const t0 = Date.now();
  return {
    id: 'scn-default',
    name: '默认：入库→分配→上架→拣选→补货',
    description: '内置的端到端示例，覆盖五大标准环节。',
    builtin: true,
    createdAt: t0,
    updatedAt: t0,
    templateId: undefined,
    nodes: [
      { id: 'n-inbound',   name: '入库申请',   kind: 'simulate', enabled: true, dependsOn: [],                       simulate: sampleSimulate('inbound', { count: 12 }), templateId: 'tpl-inbound-default' },
      { id: 'n-api-sync',  name: '下发 WMS 主数据', kind: 'api',   enabled: true, dependsOn: ['n-inbound'],           api: sampleApi({ url: 'https://wms.example.com/api/v1/inbound/{{orderId}}', responseMapping: 'data', body: '{\n  "orderId": "{{orderId}}",\n  "sku": "{{sku}}",\n  "qty": {{qty}},\n  "container": "{{container}}",\n  "batch": "{{batch}}",\n  "category": "{{category}}"\n}' }), templateId: 'tpl-inbound-default' },
      { id: 'n-allocate',  name: '库存分配',   kind: 'simulate', enabled: true, dependsOn: ['n-inbound'],            simulate: sampleSimulate('allocate', { putawayStrategy: 'nearest' }) },
      { id: 'n-putaway',   name: '上架策略',   kind: 'simulate', enabled: true, dependsOn: ['n-allocate'],           simulate: sampleSimulate('putaway') },
      { id: 'n-pick',      name: '拣选路径',   kind: 'simulate', enabled: false, dependsOn: ['n-allocate'],           simulate: sampleSimulate('pick', { pickStrategy: 's_shape' }) },
      { id: 'n-replenish', name: '补货扫描',   kind: 'simulate', enabled: false, dependsOn: ['n-allocate'],           simulate: sampleSimulate('replenish', { replenishThreshold: 30 }) },
      { id: 'n-outbound',  name: '出库单',     kind: 'simulate', enabled: false, dependsOn: ['n-allocate'],           simulate: sampleSimulate('outbound', { count: 8 }), templateId: 'tpl-outbound-default' },
    ],
  };
}

// 入库申请 → 库存分配（精简演示场景）
function makeInboundAllocateScenario(scenarioId: string): Scenario {
  const t0 = Date.now();
  const dockId = `d-${scenarioId}-dock-1`;
  const stationId = `d-${scenarioId}-station-1`;
  return {
    id: scenarioId,
    name: '入库申请 → 库存分配',
    description: '精简流程：月台 A1 触发入库申请 → 调用 WMS API（工位 1 标记 API 结果）→ 库存分配到 A 排库位',
    builtin: true,
    createdAt: t0,
    updatedAt: t0,
    templateId: undefined,
    nodes: [
      {
        id: 'n-ia-inbound',
        name: '入库申请',
        kind: 'simulate',
        enabled: true,
        dependsOn: [],
        sourceDeviceIds: [dockId],                          // 绑定月台 A1 → DOCK-A1 的 inboundEvent 触发
        simulate: sampleSimulate('inbound'),
        templateId: 'tpl-inbound-default',
      },
      {
        id: 'n-ia-api',
        name: '下发 WMS 主数据',
        kind: 'api',
        enabled: true,
        dependsOn: ['n-ia-inbound'],
        sourceDeviceIds: [stationId],                       // 绑工位 1 → 仿真后工位 1 会有 API 结果角标
        api: sampleApi({
          url: 'https://wms.example.com/api/v1/inbound/batch',
          method: 'POST',
          responseMapping: 'data',
          mockResponse: '{\n  "code": 200,\n  "data": { "ok": true, "receivedLines": {{n-ia-inbound.linesCount}}, "warehouseId": "WH-001" }\n}',
          body: '{\n  "dockNo": "{{device.dockNo}}",\n  "vendor": "{{device.vendor}}",\n  "enabled": {{device.enabled}},\n  "orderCount": {{n-ia-inbound.orderCount}},\n  "linesCount": {{n-ia-inbound.linesCount}}\n}',
        }),
        // 不绑模板 → 单次调用（演示用，避免与入库行数脱钩）
      },
      {
        id: 'n-ia-allocate',
        name: '库存分配',
        kind: 'simulate',
        enabled: true,
        dependsOn: ['n-ia-api'],
        // 不绑 targetDeviceIds：让分配散到所有空闲 STORAGE 库位（A/B 排都能看到效果）
        simulate: sampleSimulate('allocate', { putawayStrategy: 'nearest' }),
      },
    ],
  };
}

/**
 * 双深库位 → 库存分配 演示场景（场景 2）
 * 12 排 + 3 巷道 + 2 入库申请工位
 * 配对：(1↔2), (3↔4), (5↔6), (7↔8), (9↔10), (11↔12) —— 同品同批
 * 工位 1 → 巷道 1（1-4 排）
 * 工位 2 → 巷道 2（5-8 排）+ 巷道 3（9-12 排）
 */
function makeDoubleDeepStage(scenarioId: string): Stage {
  const t0 = Date.now();
  const sid = scenarioId;
  const st1 = `d-${sid}-station-1`;
  const st2 = `d-${sid}-station-2`;
  const a1 = `d-${sid}-aisle-1`;
  const a2 = `d-${sid}-aisle-2`;
  const a3 = `d-${sid}-aisle-3`;
  // 12 排
  const rowIds = Array.from({ length: 12 }, (_, i) => `d-${sid}-row-${i + 1}`);
  // 双深对：1-2, 3-4, 5-6, 7-8, 9-10, 11-12
  const ddp: Record<number, number> = {};
  for (let i = 0; i < 12; i += 2) {
    ddp[i + 1] = i + 2;
    ddp[i + 2] = i + 1;
  }
  return {
    id: `stg-${sid}`,
    name: '双深库位 · 入库申请 → 库存分配 演示舞台',
    description: '12 排 + 3 巷道 + 2 入库申请工位 · 排 1↔2、3↔4、5↔6、7↔8、9↔10、11↔12 为双深对（同品同批）',
    createdAt: t0,
    updatedAt: t0,
    shelves: [],
    doubleDeepPairs: ddp,
    devices: [
      // 12 个货架排：右侧堆叠，从上到下 1→12
      // 每排 8 个库位（cellCount 较小便于观察）
      { id: rowIds[0],  kind: 'shelfRow', name: '1 排', position: { x: 45, y: 4  }, size: { w: 50, h: 4 }, status: 'normal', cellCount: 8,  shelfRow: 1,  fields: { ...buildDefaultFields('shelfRow'), rowLabel: '1 排' } },
      { id: rowIds[1],  kind: 'shelfRow', name: '2 排', position: { x: 45, y: 8  }, size: { w: 50, h: 4 }, status: 'normal', cellCount: 8,  shelfRow: 2,  fields: { ...buildDefaultFields('shelfRow'), rowLabel: '2 排' } },
      { id: rowIds[2],  kind: 'shelfRow', name: '3 排', position: { x: 45, y: 14 }, size: { w: 50, h: 4 }, status: 'normal', cellCount: 8,  shelfRow: 3,  fields: { ...buildDefaultFields('shelfRow'), rowLabel: '3 排' } },
      { id: rowIds[3],  kind: 'shelfRow', name: '4 排', position: { x: 45, y: 18 }, size: { w: 50, h: 4 }, status: 'normal', cellCount: 8,  shelfRow: 4,  fields: { ...buildDefaultFields('shelfRow'), rowLabel: '4 排' } },
      { id: rowIds[4],  kind: 'shelfRow', name: '5 排', position: { x: 45, y: 32 }, size: { w: 50, h: 4 }, status: 'normal', cellCount: 8,  shelfRow: 5,  fields: { ...buildDefaultFields('shelfRow'), rowLabel: '5 排' } },
      { id: rowIds[5],  kind: 'shelfRow', name: '6 排', position: { x: 45, y: 36 }, size: { w: 50, h: 4 }, status: 'normal', cellCount: 8,  shelfRow: 6,  fields: { ...buildDefaultFields('shelfRow'), rowLabel: '6 排' } },
      { id: rowIds[6],  kind: 'shelfRow', name: '7 排', position: { x: 45, y: 42 }, size: { w: 50, h: 4 }, status: 'normal', cellCount: 8,  shelfRow: 7,  fields: { ...buildDefaultFields('shelfRow'), rowLabel: '7 排' } },
      { id: rowIds[7],  kind: 'shelfRow', name: '8 排', position: { x: 45, y: 46 }, size: { w: 50, h: 4 }, status: 'normal', cellCount: 8,  shelfRow: 8,  fields: { ...buildDefaultFields('shelfRow'), rowLabel: '8 排' } },
      { id: rowIds[8],  kind: 'shelfRow', name: '9 排',  position: { x: 45, y: 60 }, size: { w: 50, h: 4 }, status: 'normal', cellCount: 8,  shelfRow: 9,  fields: { ...buildDefaultFields('shelfRow'), rowLabel: '9 排' } },
      { id: rowIds[9],  kind: 'shelfRow', name: '10 排', position: { x: 45, y: 64 }, size: { w: 50, h: 4 }, status: 'normal', cellCount: 8,  shelfRow: 10, fields: { ...buildDefaultFields('shelfRow'), rowLabel: '10 排' } },
      { id: rowIds[10], kind: 'shelfRow', name: '11 排', position: { x: 45, y: 70 }, size: { w: 50, h: 4 }, status: 'normal', cellCount: 8,  shelfRow: 11, fields: { ...buildDefaultFields('shelfRow'), rowLabel: '11 排' } },
      { id: rowIds[11], kind: 'shelfRow', name: '12 排', position: { x: 45, y: 74 }, size: { w: 50, h: 4 }, status: 'normal', cellCount: 8,  shelfRow: 12, fields: { ...buildDefaultFields('shelfRow'), rowLabel: '12 排' } },
      // 3 个巷道（垂直布置，每巷道服务 4 个排）
      { id: a1, kind: 'aisle', name: '巷道 1', position: { x: 27, y: 9 },  size: { w: 14, h: 8 }, status: 'normal', fields: { ...buildDefaultFields('aisle'), aisleCode: 'A01', aisleName: '入库巷道 1' } },
      { id: a2, kind: 'aisle', name: '巷道 2', position: { x: 27, y: 37 }, size: { w: 14, h: 8 }, status: 'normal', fields: { ...buildDefaultFields('aisle'), aisleCode: 'A02', aisleName: '入库巷道 2' } },
      { id: a3, kind: 'aisle', name: '巷道 3', position: { x: 27, y: 65 }, size: { w: 14, h: 8 }, status: 'normal', fields: { ...buildDefaultFields('aisle'), aisleCode: 'A03', aisleName: '入库巷道 3' } },
      // 2 个入库申请工位
      { id: st1, kind: 'station', name: '入库工位 1', position: { x: 5, y: 9 },  size: { w: 12, h: 7 }, status: 'normal', fields: { ...buildDefaultFields('station'), stationCode: 'IN-ST01', stationName: '入库申请工位 1' }, business: { stationRole: 'putaway' } },
      { id: st2, kind: 'station', name: '入库工位 2', position: { x: 5, y: 65 }, size: { w: 12, h: 7 }, status: 'normal', fields: { ...buildDefaultFields('station'), stationCode: 'IN-ST02', stationName: '入库申请工位 2' }, business: { stationRole: 'putaway' } },
      // 入库月台
      { id: `d-${sid}-dock-1`, kind: 'dock', name: '入库月台', position: { x: 5, y: 88 }, size: { w: 12, h: 7 }, status: 'normal', fields: { ...buildDefaultFields('dock'), dockNo: 'DOCK-IN', dockName: '入库月台', vendor: '华东供应商' }, business: { inboundEvent: { enabled: true, ordersPerRun: 16, skuPool: [], avgLinesPerOrder: 2, avgQtyPerLine: 8, putawayStrategy: 'abc' } } },
      // 路线：入库工位 1 → 巷道 1 → 1-4 排
      { id: `d-${sid}-r-st1-a1`, kind: 'route', name: 'ST-1 → 巷道 1', position: { x: 50, y: 50 }, size: { w: 4, h: 4 }, status: 'normal', fields: buildDefaultFields('route'), routeFrom: st1, routeTo: a1, routeType: 'inbound' },
      { id: `d-${sid}-r-a1-1`,  kind: 'route', name: '巷道 1 → 1 排', position: { x: 50, y: 50 }, size: { w: 4, h: 4 }, status: 'normal', fields: buildDefaultFields('route'), routeFrom: a1, routeTo: rowIds[0],  routeType: 'inbound' },
      { id: `d-${sid}-r-a1-2`,  kind: 'route', name: '巷道 1 → 2 排', position: { x: 50, y: 50 }, size: { w: 4, h: 4 }, status: 'normal', fields: buildDefaultFields('route'), routeFrom: a1, routeTo: rowIds[1],  routeType: 'inbound' },
      { id: `d-${sid}-r-a1-3`,  kind: 'route', name: '巷道 1 → 3 排', position: { x: 50, y: 50 }, size: { w: 4, h: 4 }, status: 'normal', fields: buildDefaultFields('route'), routeFrom: a1, routeTo: rowIds[2],  routeType: 'inbound' },
      { id: `d-${sid}-r-a1-4`,  kind: 'route', name: '巷道 1 → 4 排', position: { x: 50, y: 50 }, size: { w: 4, h: 4 }, status: 'normal', fields: buildDefaultFields('route'), routeFrom: a1, routeTo: rowIds[3],  routeType: 'inbound' },
      // 路线：入库工位 2 → 巷道 2 → 5-8 排
      { id: `d-${sid}-r-st2-a2`, kind: 'route', name: 'ST-2 → 巷道 2', position: { x: 50, y: 50 }, size: { w: 4, h: 4 }, status: 'normal', fields: buildDefaultFields('route'), routeFrom: st2, routeTo: a2, routeType: 'inbound' },
      { id: `d-${sid}-r-a2-5`,  kind: 'route', name: '巷道 2 → 5 排', position: { x: 50, y: 50 }, size: { w: 4, h: 4 }, status: 'normal', fields: buildDefaultFields('route'), routeFrom: a2, routeTo: rowIds[4],  routeType: 'inbound' },
      { id: `d-${sid}-r-a2-6`,  kind: 'route', name: '巷道 2 → 6 排', position: { x: 50, y: 50 }, size: { w: 4, h: 4 }, status: 'normal', fields: buildDefaultFields('route'), routeFrom: a2, routeTo: rowIds[5],  routeType: 'inbound' },
      { id: `d-${sid}-r-a2-7`,  kind: 'route', name: '巷道 2 → 7 排', position: { x: 50, y: 50 }, size: { w: 4, h: 4 }, status: 'normal', fields: buildDefaultFields('route'), routeFrom: a2, routeTo: rowIds[6],  routeType: 'inbound' },
      { id: `d-${sid}-r-a2-8`,  kind: 'route', name: '巷道 2 → 8 排', position: { x: 50, y: 50 }, size: { w: 4, h: 4 }, status: 'normal', fields: buildDefaultFields('route'), routeFrom: a2, routeTo: rowIds[7],  routeType: 'inbound' },
      // 路线：入库工位 2 → 巷道 3 → 9-12 排
      { id: `d-${sid}-r-st2-a3`, kind: 'route', name: 'ST-2 → 巷道 3', position: { x: 50, y: 50 }, size: { w: 4, h: 4 }, status: 'normal', fields: buildDefaultFields('route'), routeFrom: st2, routeTo: a3, routeType: 'inbound' },
      { id: `d-${sid}-r-a3-9`,  kind: 'route', name: '巷道 3 → 9 排',  position: { x: 50, y: 50 }, size: { w: 4, h: 4 }, status: 'normal', fields: buildDefaultFields('route'), routeFrom: a3, routeTo: rowIds[8],  routeType: 'inbound' },
      { id: `d-${sid}-r-a3-10`, kind: 'route', name: '巷道 3 → 10 排', position: { x: 50, y: 50 }, size: { w: 4, h: 4 }, status: 'normal', fields: buildDefaultFields('route'), routeFrom: a3, routeTo: rowIds[9],  routeType: 'inbound' },
      { id: `d-${sid}-r-a3-11`, kind: 'route', name: '巷道 3 → 11 排', position: { x: 50, y: 50 }, size: { w: 4, h: 4 }, status: 'normal', fields: buildDefaultFields('route'), routeFrom: a3, routeTo: rowIds[10], routeType: 'inbound' },
      { id: `d-${sid}-r-a3-12`, kind: 'route', name: '巷道 3 → 12 排', position: { x: 50, y: 50 }, size: { w: 4, h: 4 }, status: 'normal', fields: buildDefaultFields('route'), routeFrom: a3, routeTo: rowIds[11], routeType: 'inbound' },
    ],
  };
}

/** 双深场景的 scenario 节点 */
function makeDoubleDeepScenario(scenarioId: string): Scenario {
  const t0 = Date.now();
  const sid = scenarioId;
  const dockId = `d-${sid}-dock-1`;
  const st1 = `d-${sid}-station-1`;
  const st2 = `d-${sid}-station-2`;
  // 12 排 + 2 工位都作为分配目标
  const allRows = Array.from({ length: 12 }, (_, i) => `d-${sid}-row-${i + 1}`);
  return {
    id: sid,
    name: '场景 2 · 双深库位 · 入库申请-库存分配',
    description: '12 排 + 3 巷道 + 2 入库申请工位 · 排 1↔2、3↔4、5↔6、7↔8、9↔10、11↔12 为双深对（入库同品同批）',
    builtin: true,
    createdAt: t0,
    updatedAt: t0,
    templateId: undefined,
    nodes: [
      {
        id: 'n-dd-inbound',
        name: '入库申请',
        kind: 'simulate',
        enabled: true,
        dependsOn: [],
        sourceDeviceIds: [dockId],
        simulate: sampleSimulate('inbound', { putawayStrategy: 'category' }),
        templateId: 'tpl-double-deep',
      },
      {
        id: 'n-dd-api',
        name: '下发 WMS 主数据',
        kind: 'api',
        enabled: true,
        dependsOn: ['n-dd-inbound'],
        sourceDeviceIds: [st1, st2],
        api: sampleApi({
          url: 'https://wms.example.com/api/v1/inbound/double-deep',
          method: 'POST',
          responseMapping: 'data',
          mockResponse: '{\n  "code": 200,\n  "data": { "ok": true, "doubleDeepEnforced": true, "linesCount": {{n-dd-inbound.linesCount}} }\n}',
          body: '{\n  "dockNo": "{{device.dockNo}}",\n  "vendor": "{{device.vendor}}",\n  "orderCount": {{n-dd-inbound.orderCount}}\n}',
        }),
      },
      {
        id: 'n-dd-allocate',
        name: '库存分配（双深约束）',
        kind: 'simulate',
        enabled: true,
        dependsOn: ['n-dd-api'],
        // 绑 12 排 + 2 工位 → 分配只在这 12 排的库位里发生
        targetDeviceIds: [...allRows, st1, st2],
        simulate: sampleSimulate('allocate', { putawayStrategy: 'nearest' }),
      },
      {
        id: 'n-dd-putaway',
        name: '上架（入库实际落地）',
        kind: 'simulate',
        enabled: true,
        dependsOn: ['n-dd-allocate'],
        sourceDeviceIds: [st1, st2],                          // 路由到入库工位（角色校验）
        simulate: sampleSimulate('putaway'),
      },
    ],
  };
}

function makeBuiltinTemplates(): DataTemplate[] {
  const t0 = Date.now();
  return [
    {
      id: 'tpl-inbound-default',
      name: '入库订单模板',
      description: '示例：orderId / sku / qty / container / batch / category',
      source: 'manual',
      rowCount: 30,
      seed: 7,
      createdAt: t0,
      updatedAt: t0,
      fields: [
        { name: 'orderId',   type: 'string',  required: true,  prefix: 'IB' },
        { name: 'sku',       type: 'sku',     required: true,  prefix: 'SKU' },
        { name: 'qty',       type: 'int',     required: true,  min: 5,  max: 60 },
        { name: 'container', type: 'barcode', required: false, prefix: 'CTN' },
        { name: 'batch',     type: 'string',  required: false, prefix: 'B' },
        { name: 'category',  type: 'enum',    required: false, enumValues: ['饮料', '零食', '日化', '电器', '服饰', '生鲜'] },
      ],
    },
    {
      id: 'tpl-double-deep',
      name: '双深库位 · 入库订单模板',
      description: '显式构造 4 种组合：①同品同批(应配对) ②同品不同批(应避开) ③同品同批(应配对) ④单条(单占) — 验证双深约束',
      source: 'manual',
      rowCount: 12,
      createdAt: t0,
      updatedAt: t0,
      fields: [
        { name: 'orderId',   type: 'string',  required: true,  prefix: 'IB' },
        { name: 'sku',       type: 'string',  required: true,  prefix: 'SKU-' },
        { name: 'qty',       type: 'int',     required: true,  min: 5,  max: 60 },
        { name: 'container', type: 'barcode', required: false, prefix: 'CTN' },
        { name: 'batch',     type: 'string',  required: false, prefix: 'B' },
        { name: 'category',  type: 'enum',    required: false, enumValues: ['饮料', '零食', '日化'] },
      ],
      customRows: [
        // ① 同品同批：SKU-0001 + B001 出 2 行 → 库存分配时应优先配对到一对双深库位
        { orderId: 'IB-0001', sku: 'SKU-0001', qty: 10, container: 'CTN-10001', batch: 'B001', category: '饮料' },
        { orderId: 'IB-0001', sku: 'SKU-0001', qty: 8,  container: 'CTN-10002', batch: 'B001', category: '饮料' },
        // ② 同品不同批：SKU-0002 + B002 出 1 行 + B003 出 1 行 → 不可配对，分配后两个库位都是「单独占」
        { orderId: 'IB-0002', sku: 'SKU-0002', qty: 12, container: 'CTN-20001', batch: 'B002', category: '饮料' },
        { orderId: 'IB-0002', sku: 'SKU-0002', qty: 6,  container: 'CTN-20002', batch: 'B003', category: '饮料' },
        // ③ 同品同批(再一组)：SKU-0003 + B004 出 2 行 → 配对
        { orderId: 'IB-0003', sku: 'SKU-0003', qty: 15, container: 'CTN-30001', batch: 'B004', category: '零食' },
        { orderId: 'IB-0003', sku: 'SKU-0003', qty: 9,  container: 'CTN-30002', batch: 'B004', category: '零食' },
        // ④ 单条(单占)：SKU-0004 + B005 出 1 行 → 单独占
        { orderId: 'IB-0004', sku: 'SKU-0004', qty: 7,  container: 'CTN-40001', batch: 'B005', category: '零食' },
        // ⑤ 单条(单占)：SKU-0005 + B006
        { orderId: 'IB-0005', sku: 'SKU-0005', qty: 11, container: 'CTN-50001', batch: 'B006', category: '日化' },
        // ⑥ 异品混合：SKU-0006 + B007 + 异 batch SKU-0007 + B008
        { orderId: 'IB-0006', sku: 'SKU-0006', qty: 14, container: 'CTN-60001', batch: 'B007', category: '日化' },
        { orderId: 'IB-0006', sku: 'SKU-0007', qty: 6,  container: 'CTN-70001', batch: 'B008', category: '日化' },
        // ⑦ 又一组同品同批：SKU-0008 + B009 出 2 行 → 配对
        { orderId: 'IB-0007', sku: 'SKU-0008', qty: 18, container: 'CTN-80001', batch: 'B009', category: '饮料' },
        { orderId: 'IB-0007', sku: 'SKU-0008', qty: 5,  container: 'CTN-80002', batch: 'B009', category: '饮料' },
      ],
    },
    {
      id: 'tpl-outbound-default',
      name: '出库订单模板',
      description: '示例：orderId / sku / qty / customer / priority',
      source: 'manual',
      rowCount: 20,
      seed: 13,
      createdAt: t0,
      updatedAt: t0,
      fields: [
        { name: 'orderId',   type: 'string',  required: true,  prefix: 'OB' },
        { name: 'sku',       type: 'sku',     required: true,  prefix: 'SKU' },
        { name: 'qty',       type: 'int',     required: true,  min: 1,  max: 12 },
        { name: 'customer',  type: 'string',  required: true,  prefix: 'C' },
        { name: 'priority',  type: 'enum',    required: false, enumValues: ['加急', '常规', '经济'] },
      ],
    },
    {
      id: 'tpl-sku-master',
      name: 'SKU 主数据模板',
      description: '示例：sku / name / category / weight / volume / abcClass',
      source: 'manual',
      rowCount: 50,
      seed: 21,
      createdAt: t0,
      updatedAt: t0,
      fields: [
        { name: 'sku',       type: 'sku',     required: true,  prefix: 'SKU' },
        { name: 'name',      type: 'string',  required: true },
        { name: 'category',  type: 'enum',    required: true,  enumValues: ['饮料', '零食', '日化', '电器', '服饰', '生鲜'] },
        { name: 'weight',    type: 'float',   required: false, min: 0.1, max: 25 },
        { name: 'volume',    type: 'float',   required: false, min: 0.01, max: 5 },
        { name: 'abcClass',  type: 'enum',    required: false, enumValues: ['A', 'B', 'C'] },
      ],
    },
  ];
}

const snapLocations = buildLocations();
const snapSkus = buildSKUs(60, 999);
const _snapInventory = buildInitialInventory(snapLocations, snapSkus, 1000);
const initialSnapshots = buildHistoricalSnapshots(snapSkus, snapLocations);

const builtinScenarios: Scenario[] = [
  (() => {
    const s = makeInboundAllocateScenario('scn-inbound-allocate');
    s.stage = makeInboundAllocateStage(s.id);
    return s;
  })(),
  (() => {
    const s = makeDoubleDeepScenario('scn-double-deep');
    s.stage = makeDoubleDeepStage(s.id);
    return s;
  })(),
  (() => {
    const s = makeBuiltinScenario();
    s.stage = makeDefaultStage(s.id);
    return s;
  })(),
];
// 兼容旧名：上一版里 builtinScenarios.forEach 注入了 stage，新版在上面已经做了
// builtinScenarios.forEach((s) => { s.stage = makeDefaultStage(s.id); });
const builtinTemplates: DataTemplate[] = makeBuiltinTemplates();

// 内置示例看板：5 个块，覆盖 KPI / 表格 / 图表 / 库位 / 设备
function makeBuiltinDashboard(): Dashboard {
  const t0 = Date.now();
  return {
    id: 'dsb-default',
    name: '默认：WMS 业务对象看板',
    description: '数据来自当前场景的舞台（月台/工位/库位/区域），舞台改这里跟着变',
    builtin: true,
    createdAt: t0,
    updatedAt: t0,
    widgets: [
      { id: 'w-dev-count',   kind: 'kpi',  title: '业务对象总数', size: { w: 1, h: 1 }, binding: { source: 'stage', agg: 'count' } },
      { id: 'w-dev-dock',     kind: 'kpi',  title: '月台数',     size: { w: 1, h: 1 }, binding: { source: 'stageDevices', agg: 'count', deviceKindFilter: 'dock' } },
      { id: 'w-dev-station',  kind: 'kpi',  title: '工位数',     size: { w: 1, h: 1 }, binding: { source: 'stageDevices', agg: 'count', deviceKindFilter: 'station' } },
      { id: 'w-dev-zone',     kind: 'kpi',  title: '区域数',     size: { w: 1, h: 1 }, binding: { source: 'stageDevices', agg: 'count', deviceKindFilter: 'zone' } },
      { id: 'w-by-status',    kind: 'kpi',  title: '对象 · 按状态', size: { w: 1, h: 2 }, binding: { source: 'stage', agg: 'count', groupBy: 'status' } },
      { id: 'w-by-kind-g',    kind: 'kpi',  title: '对象 · 按类型', size: { w: 1, h: 2 }, binding: { source: 'stage', agg: 'count', groupBy: 'kind' } },
      { id: 'w-by-kind',      kind: 'chart', title: '按对象类型分布', size: { w: 2, h: 2 }, binding: { source: 'stage', groupBy: 'kind' }, chartType: 'pie' },
      { id: 'w-by-status-c',  kind: 'chart', title: '按状态分布',   size: { w: 2, h: 1 }, binding: { source: 'stage', groupBy: 'status' }, chartType: 'bar' },
      { id: 'w-dev-table',    kind: 'table', title: '业务对象清单', size: { w: 2, h: 2 }, binding: { source: 'stage' } },
      { id: 'w-fault-table',  kind: 'table', title: '异常对象',     size: { w: 2, h: 2 }, binding: { source: 'stage' } },
      { id: 'w-orders',       kind: 'kpi',  title: '入库单数',     size: { w: 1, h: 1 }, binding: { source: 'orders', agg: 'count' } },
      { id: 'w-assigned',     kind: 'kpi',  title: '已分配行',     size: { w: 1, h: 1 }, binding: { source: 'assignments', agg: 'count' } },
      { id: 'w-map',          kind: 'map',   title: '仓库库位分布', size: { w: 2, h: 2 }, binding: { source: 'inventory', mapMode: 'zone', mapField: 'zone' } },
      { id: 'w-equip',        kind: 'equipment', title: 'WMS 业务对象', size: { w: 2, h: 2 }, binding: { source: 'inventory', equipmentKind: 'all' } },
      // === 设备结果块（按舞台设备组织） ===
      { id: 'w-dev-result-kpi',  kind: 'kpi',  title: '仿真中 · 设备数',     size: { w: 1, h: 1 }, binding: { source: 'deviceResults', agg: 'count', resultStatusFilter: 'running' } },
      { id: 'w-dev-result-anom', kind: 'kpi',  title: '有异常 · 设备数',     size: { w: 1, h: 1 }, binding: { source: 'deviceResults', agg: 'count', resultStatusFilter: 'with-anomaly' } },
      { id: 'w-dev-result-dock', kind: 'kpi',  title: '月台 · 处理单数',     size: { w: 1, h: 2 }, binding: { source: 'deviceResults', agg: 'sum', field: 'ordersHandled', resultDeviceKind: 'dock' } },
      { id: 'w-dev-result-table', kind: 'table', title: '设备结果 · 任务/指令', size: { w: 2, h: 2 }, binding: { source: 'deviceResults', resultStatusFilter: 'with-task' } },
    ],
  };
}
const builtinDashboards: Dashboard[] = [makeBuiltinDashboard()];

// 给场景生成默认舞台：2 排货架 + 2 个月台 + 2 个工位 + 1 个区域
// 货架排现在是 shelfRow 设备（在设备库里），可在画布上自由拖动、编辑
function makeDefaultStage(scenarioId: string): Stage {
  const t0 = Date.now();
  return {
    id: `stg-${scenarioId}`,
    name: '默认舞台',
    description: '空仓库布局，可拖拽月台/工位/货架排/区域到画布上',
    createdAt: t0,
    updatedAt: t0,
    shelves: [],  // 兼容旧字段，新版用 shelfRow 设备
    devices: [
      // 货架排 A（shelfRow=1）
      { id: `d-${scenarioId}-row-1`, kind: 'shelfRow', name: 'A 排', position: { x: 5, y: 30 }, size: { w: 90, h: 6 }, status: 'normal', cellCount: 14, shelfRow: 1, fields: { ...buildDefaultFields('shelfRow'), rowLabel: 'A 排' } },
      // 货架排 B（shelfRow=2）
      { id: `d-${scenarioId}-row-2`, kind: 'shelfRow', name: 'B 排', position: { x: 5, y: 50 }, size: { w: 90, h: 6 }, status: 'normal', cellCount: 14, shelfRow: 2, fields: { ...buildDefaultFields('shelfRow'), rowLabel: 'B 排' } },
      // 月台 1：入库事件
      { id: `d-${scenarioId}-dock-1`, kind: 'dock', name: '月台 A1', position: { x: 80, y: 15 }, size: { w: 12, h: 7 }, status: 'normal', fields: { ...buildDefaultFields('dock'), dockNo: 'DOCK-A1', dockName: '月台 A1', vendor: '华东供应商' }, business: { inboundEvent: { enabled: true, ordersPerRun: 5, skuPool: [], avgLinesPerOrder: 3, avgQtyPerLine: 8, putawayStrategy: 'abc' } } },
      // 月台 2：出库事件
      { id: `d-${scenarioId}-dock-2`, kind: 'dock', name: '月台 B1', position: { x: 80, y: 80 }, size: { w: 12, h: 7 }, status: 'normal', fields: { ...buildDefaultFields('dock'), dockNo: 'DOCK-B1', dockName: '月台 B1', vendor: '国美电器' }, business: { outboundEvent: { enabled: true, ordersPerRun: 4, skuPool: [], avgLinesPerOrder: 4, avgQtyPerLine: 5, pickStrategy: 'batch' } } },
      // 工位：拣选
      { id: `d-${scenarioId}-station-1`, kind: 'station', name: '工位 1', position: { x: 5, y: 15 }, size: { w: 8, h: 7 }, status: 'normal', fields: { ...buildDefaultFields('station'), stationCode: 'ST-01', stationName: '拣选工位 1' }, business: { stationRole: 'pick' } },
      // 工位：打包
      { id: `d-${scenarioId}-station-2`, kind: 'station', name: '工位 2', position: { x: 5, y: 80 }, size: { w: 8, h: 7 }, status: 'normal', fields: { ...buildDefaultFields('station'), stationCode: 'ST-02', stationName: '打包工位 2' }, business: { stationRole: 'pack' } },
      // 区域：危险品
      { id: `d-${scenarioId}-zone-1`, kind: 'zone', name: '危险品区', position: { x: 40, y: 70 }, size: { w: 25, h: 12 }, status: 'normal', fields: { ...buildDefaultFields('zone'), zoneCode: 'Z-HZ', zoneName: '危险品区' } },
    ],
  };
}

/**
 * 入库申请 → 库存分配 演示舞台
 * 6 排 + 3 巷道 + 2 入库申请工位，路线已预连接：
 *   - 入库工位 1  →  巷道 1  →  A 排 / B 排
 *   - 入库工位 2  →  巷道 2  →  C 排 / D 排
 *                →  巷道 3  →  E 排 / F 排
 * 跑仿真后会自动高亮：点击工位可看到该工位服务的巷道与排
 */
function makeInboundAllocateStage(scenarioId: string): Stage {
  const t0 = Date.now();
  const sid = scenarioId;
  const st1 = `d-${sid}-station-1`;
  const st2 = `d-${sid}-station-2`;
  const a1 = `d-${sid}-aisle-1`;
  const a2 = `d-${sid}-aisle-2`;
  const a3 = `d-${sid}-aisle-3`;
  const rowIds = ['A', 'B', 'C', 'D', 'E', 'F'].map((c, i) => `d-${sid}-row-${i + 1}`);
  const [rowA, rowB, rowC, rowD, rowE, rowF] = rowIds;
  return {
    id: `stg-${sid}`,
    name: '入库申请 → 库存分配 · 演示舞台',
    description: '6 排 + 3 巷道 + 2 入库申请工位 · 工位 1 申请 → 巷道 1（A/B 排） · 工位 2 申请 → 巷道 2（C/D 排）+ 巷道 3（E/F 排）',
    createdAt: t0,
    updatedAt: t0,
    shelves: [],
    devices: [
      // 6 个货架排：右侧垂直堆叠，每个 4% 高
      { id: rowA, kind: 'shelfRow', name: 'A 排', position: { x: 50, y: 6 },  size: { w: 48, h: 5 }, status: 'normal', cellCount: 12, shelfRow: 1, fields: { ...buildDefaultFields('shelfRow'), rowLabel: 'A 排' } },
      { id: rowB, kind: 'shelfRow', name: 'B 排', position: { x: 50, y: 13 }, size: { w: 48, h: 5 }, status: 'normal', cellCount: 12, shelfRow: 2, fields: { ...buildDefaultFields('shelfRow'), rowLabel: 'B 排' } },
      { id: rowC, kind: 'shelfRow', name: 'C 排', position: { x: 50, y: 32 }, size: { w: 48, h: 5 }, status: 'normal', cellCount: 12, shelfRow: 3, fields: { ...buildDefaultFields('shelfRow'), rowLabel: 'C 排' } },
      { id: rowD, kind: 'shelfRow', name: 'D 排', position: { x: 50, y: 39 }, size: { w: 48, h: 5 }, status: 'normal', cellCount: 12, shelfRow: 4, fields: { ...buildDefaultFields('shelfRow'), rowLabel: 'D 排' } },
      { id: rowE, kind: 'shelfRow', name: 'E 排', position: { x: 50, y: 58 }, size: { w: 48, h: 5 }, status: 'normal', cellCount: 12, shelfRow: 5, fields: { ...buildDefaultFields('shelfRow'), rowLabel: 'E 排' } },
      { id: rowF, kind: 'shelfRow', name: 'F 排', position: { x: 50, y: 65 }, size: { w: 48, h: 5 }, status: 'normal', cellCount: 12, shelfRow: 6, fields: { ...buildDefaultFields('shelfRow'), rowLabel: 'F 排' } },
      // 3 个巷道：每两个排之间一个巷道
      { id: a1, kind: 'aisle', name: '巷道 1', position: { x: 28, y: 8 },  size: { w: 18, h: 4 }, status: 'normal', fields: { ...buildDefaultFields('aisle'), aisleCode: 'A01', aisleName: '入库巷道 1' } },
      { id: a2, kind: 'aisle', name: '巷道 2', position: { x: 28, y: 34 }, size: { w: 18, h: 4 }, status: 'normal', fields: { ...buildDefaultFields('aisle'), aisleCode: 'A02', aisleName: '入库巷道 2' } },
      { id: a3, kind: 'aisle', name: '巷道 3', position: { x: 28, y: 60 }, size: { w: 18, h: 4 }, status: 'normal', fields: { ...buildDefaultFields('aisle'), aisleCode: 'A03', aisleName: '入库巷道 3' } },
      // 2 个入库申请工位：左列
      { id: st1, kind: 'station', name: '入库工位 1', position: { x: 5, y: 8 },  size: { w: 12, h: 8 }, status: 'normal', fields: { ...buildDefaultFields('station'), stationCode: 'IN-ST01', stationName: '入库申请工位 1' }, business: { stationRole: 'putaway' } },
      { id: st2, kind: 'station', name: '入库工位 2', position: { x: 5, y: 60 }, size: { w: 12, h: 8 }, status: 'normal', fields: { ...buildDefaultFields('station'), stationCode: 'IN-ST02', stationName: '入库申请工位 2' }, business: { stationRole: 'putaway' } },
      // 入库月台（触发入库事件）
      { id: `d-${sid}-dock-1`, kind: 'dock', name: '入库月台', position: { x: 5, y: 82 }, size: { w: 12, h: 7 }, status: 'normal', fields: { ...buildDefaultFields('dock'), dockNo: 'DOCK-IN', dockName: '入库月台', vendor: '华东供应商' }, business: { inboundEvent: { enabled: true, ordersPerRun: 8, skuPool: [], avgLinesPerOrder: 3, avgQtyPerLine: 8, putawayStrategy: 'abc' } } },
      // 路线（route 设备）：入库工位 1 → 巷道 1 → A/B 排
      { id: `d-${sid}-route-st1-a1`, kind: 'route', name: '入库工位 1 → 巷道 1', position: { x: 50, y: 50 }, size: { w: 4, h: 4 }, status: 'normal', fields: buildDefaultFields('route'), routeFrom: st1, routeTo: a1, routeType: 'inbound' },
      { id: `d-${sid}-route-a1-A`,  kind: 'route', name: '巷道 1 → A 排',      position: { x: 50, y: 50 }, size: { w: 4, h: 4 }, status: 'normal', fields: buildDefaultFields('route'), routeFrom: a1,  routeTo: rowA, routeType: 'inbound' },
      { id: `d-${sid}-route-a1-B`,  kind: 'route', name: '巷道 1 → B 排',      position: { x: 50, y: 50 }, size: { w: 4, h: 4 }, status: 'normal', fields: buildDefaultFields('route'), routeFrom: a1,  routeTo: rowB, routeType: 'inbound' },
      // 路线：入库工位 2 → 巷道 2 → C/D 排
      { id: `d-${sid}-route-st2-a2`, kind: 'route', name: '入库工位 2 → 巷道 2', position: { x: 50, y: 50 }, size: { w: 4, h: 4 }, status: 'normal', fields: buildDefaultFields('route'), routeFrom: st2, routeTo: a2, routeType: 'inbound' },
      { id: `d-${sid}-route-a2-C`,   kind: 'route', name: '巷道 2 → C 排',      position: { x: 50, y: 50 }, size: { w: 4, h: 4 }, status: 'normal', fields: buildDefaultFields('route'), routeFrom: a2,  routeTo: rowC, routeType: 'inbound' },
      { id: `d-${sid}-route-a2-D`,   kind: 'route', name: '巷道 2 → D 排',      position: { x: 50, y: 50 }, size: { w: 4, h: 4 }, status: 'normal', fields: buildDefaultFields('route'), routeFrom: a2,  routeTo: rowD, routeType: 'inbound' },
      // 路线：入库工位 2 → 巷道 3 → E/F 排
      { id: `d-${sid}-route-st2-a3`, kind: 'route', name: '入库工位 2 → 巷道 3', position: { x: 50, y: 50 }, size: { w: 4, h: 4 }, status: 'normal', fields: buildDefaultFields('route'), routeFrom: st2, routeTo: a3, routeType: 'inbound' },
      { id: `d-${sid}-route-a3-E`,   kind: 'route', name: '巷道 3 → E 排',      position: { x: 50, y: 50 }, size: { w: 4, h: 4 }, status: 'normal', fields: buildDefaultFields('route'), routeFrom: a3,  routeTo: rowE, routeType: 'inbound' },
      { id: `d-${sid}-route-a3-F`,   kind: 'route', name: '巷道 3 → F 排',      position: { x: 50, y: 50 }, size: { w: 4, h: 4 }, status: 'normal', fields: buildDefaultFields('route'), routeFrom: a3,  routeTo: rowF, routeType: 'inbound' },
    ],
  };
}

export const useStore = create<SandboxState>()(
  persist(
    (set, get) => ({
      scenarios: builtinScenarios,
      currentScenarioId: builtinScenarios[0].id,
      templates: builtinTemplates,
      dashboards: builtinDashboards,
      currentDashboardId: builtinDashboards[0].id,
      snapshots: initialSnapshots,
      result: null,
      isRunning: false,
      progress: 0,
      config: defaultConfig,
      prodConfig: { putaway: 'nearest', pick: 's_shape', replenishThreshold: 20, version: 'v2025.05.30' },
      syncDiff: null,

      setCurrentScenario: (id) => set({ currentScenarioId: id }),
      addScenario: (s) => set((state) => ({ scenarios: [...state.scenarios, s], currentScenarioId: s.id })),
      updateScenario: (id, patch) => set((state) => ({
        scenarios: state.scenarios.map((s) => s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s),
      })),
      deleteScenario: (id) => set((state) => {
        const remaining = state.scenarios.filter((s) => s.id !== id);
        return {
          scenarios: remaining,
          currentScenarioId: remaining[0]?.id ?? '',
        };
      }),
      duplicateScenario: (id) => set((state) => {
        const orig = state.scenarios.find((s) => s.id === id);
        if (!orig) return state;
        const t = Date.now();
        const newId = `scn-${t}`;
        const copy: Scenario = {
          ...orig,
          id: newId,
          name: `${orig.name} 副本`,
          builtin: false,
          createdAt: t,
          updatedAt: t,
          nodes: orig.nodes.map((n) => ({ ...n, id: `${n.id}-${t}` })),
        };
        return { scenarios: [...state.scenarios, copy], currentScenarioId: newId };
      }),

      addNode: (scenarioId, node) => set((state) => ({
        scenarios: state.scenarios.map((s) => s.id === scenarioId ? { ...s, nodes: [...s.nodes, node], updatedAt: Date.now() } : s),
      })),
      updateNode: (scenarioId, nodeId, patch) => set((state) => ({
        scenarios: state.scenarios.map((s) => s.id === scenarioId ? {
          ...s,
          nodes: s.nodes.map((n) => n.id === nodeId ? { ...n, ...patch } : n),
          updatedAt: Date.now(),
        } : s),
      })),
      deleteNode: (scenarioId, nodeId) => set((state) => ({
        scenarios: state.scenarios.map((s) => s.id === scenarioId ? {
          ...s,
          nodes: s.nodes.filter((n) => n.id !== nodeId),
          updatedAt: Date.now(),
        } : s),
      })),
      moveNode: (scenarioId, nodeId, dir) => set((state) => ({
        scenarios: state.scenarios.map((s) => {
          if (s.id !== scenarioId) return s;
          const idx = s.nodes.findIndex((n) => n.id === nodeId);
          if (idx < 0) return s;
          const swap = dir === 'up' ? idx - 1 : idx + 1;
          if (swap < 0 || swap >= s.nodes.length) return s;
          const arr = [...s.nodes];
          [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
          return { ...s, nodes: arr, updatedAt: Date.now() };
        }),
      })),
      toggleNode: (scenarioId, nodeId) => set((state) => ({
        scenarios: state.scenarios.map((s) => s.id === scenarioId ? {
          ...s,
          nodes: s.nodes.map((n) => n.id === nodeId ? { ...n, enabled: !n.enabled } : n),
          updatedAt: Date.now(),
        } : s),
      })),

      addTemplate: (t) => set((state) => ({ templates: [...state.templates, t] })),
      updateTemplate: (id, patch) => set((state) => ({
        templates: state.templates.map((t) => t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t),
      })),
      deleteTemplate: (id) => set((state) => ({ templates: state.templates.filter((t) => t.id !== id) })),

      setScale: (scale: SimulationConfig['scale']) => set((s) => ({ config: { ...s.config, scale } })),
      setStrategy: (s: Partial<SimulationConfig['strategy']>) => set((state) => ({ config: { ...state.config, strategy: { ...state.config.strategy, ...s } } })),
      setDataSource: (d: 'random' | 'historical') => set((s) => ({ config: { ...s.config, dataSource: d } })),
      setHistoricalId: (id: string | undefined) => set((s) => ({ config: { ...s.config, historicalId: id } })),

      setRunning: (running) => set({ isRunning: running }),
      setProgress: (p) => set({ progress: p }),
      setResult: (r) => set({ result: r }),
      setSeed: (seed) => set((s) => ({ config: { ...s.config, seed } })),

      syncToProd: () => {
        const c = get().config;
        const p = get().prodConfig;
        const diff: SandboxState['syncDiff'] = {};
        if (c.strategy.putaway !== p.putaway) diff.putaway = [p.putaway, c.strategy.putaway];
        if (c.strategy.pick !== p.pick) diff.pick = [p.pick, c.strategy.pick];
        if (c.strategy.replenishThreshold !== p.replenishThreshold) diff.replenishThreshold = [p.replenishThreshold, c.strategy.replenishThreshold];
        set({
          syncDiff: diff,
          prodConfig: {
            putaway: c.strategy.putaway,
            pick: c.strategy.pick,
            replenishThreshold: c.strategy.replenishThreshold,
            version: bumpVersion(p.version),
          },
        });
      },
      reset: () => set({ result: null, progress: 0, syncDiff: null }),

      // === 看板操作 ===
      setCurrentDashboard: (id) => set({ currentDashboardId: id }),
      addDashboard: (d) => set((state) => ({ dashboards: [...state.dashboards, d], currentDashboardId: d.id })),
      updateDashboard: (id, patch) => set((state) => ({
        dashboards: state.dashboards.map((d) => d.id === id ? { ...d, ...patch, updatedAt: Date.now() } : d),
      })),
      deleteDashboard: (id) => set((state) => {
        const remaining = state.dashboards.filter((d) => d.id !== id);
        return { dashboards: remaining, currentDashboardId: remaining[0]?.id ?? '' };
      }),
      duplicateDashboard: (id) => set((state) => {
        const src = state.dashboards.find((d) => d.id === id);
        if (!src) return {};
        const t0 = Date.now();
        const copy: Dashboard = {
          ...src,
          id: `dsb-${Math.random().toString(36).slice(2, 8)}`,
          name: `${src.name} · 副本`,
          builtin: false,
          createdAt: t0,
          updatedAt: t0,
          widgets: src.widgets.map((w) => ({ ...w, id: `w-${Math.random().toString(36).slice(2, 8)}` })),
        };
        return { dashboards: [...state.dashboards, copy], currentDashboardId: copy.id };
      }),
      addWidget: (dashboardId, widget) => set((state) => ({
        dashboards: state.dashboards.map((d) => d.id === dashboardId
          ? { ...d, widgets: [...d.widgets, widget], updatedAt: Date.now() }
          : d),
      })),
      updateWidget: (dashboardId, widgetId, patch) => set((state) => ({
        dashboards: state.dashboards.map((d) => d.id === dashboardId
          ? { ...d, widgets: d.widgets.map((w) => w.id === widgetId ? { ...w, ...patch } : w), updatedAt: Date.now() }
          : d),
      })),
      deleteWidget: (dashboardId, widgetId) => set((state) => ({
        dashboards: state.dashboards.map((d) => d.id === dashboardId
          ? { ...d, widgets: d.widgets.filter((w) => w.id !== widgetId), updatedAt: Date.now() }
          : d),
      })),
      moveWidget: (dashboardId, widgetId, dir) => set((state) => {
        const d = state.dashboards.find((x) => x.id === dashboardId);
        if (!d) return {};
        const idx = d.widgets.findIndex((w) => w.id === widgetId);
        if (idx < 0) return {};
        const targetIdx = dir === 'left' ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= d.widgets.length) return {};
        const arr = [...d.widgets];
        [arr[idx], arr[targetIdx]] = [arr[targetIdx], arr[idx]];
        return {
          dashboards: state.dashboards.map((x) => x.id === dashboardId ? { ...x, widgets: arr, updatedAt: Date.now() } : x),
        };
      }),

      // === 舞台实现（操作当前场景的 stage） ===
      updateCurrentScenarioStage: (patch) => set((state) => {
        const scenario = state.scenarios.find((x) => x.id === state.currentScenarioId);
        if (!scenario || !scenario.stage) return {};
        return { scenarios: state.scenarios.map((x) => x.id === scenario.id ? { ...x, stage: { ...x.stage!, ...patch, updatedAt: Date.now() } } : x) };
      }),
      ensureCurrentScenarioStage: () => set((state) => {
        const scenario = state.scenarios.find((x) => x.id === state.currentScenarioId);
        if (!scenario) return {};
        if (scenario.stage) return {};
        return { scenarios: state.scenarios.map((x) => x.id === scenario.id ? { ...x, stage: makeDefaultStage(scenario.id) } : x) };
      }),
      removeCurrentScenarioStage: () => set((state) => {
        const scenario = state.scenarios.find((x) => x.id === state.currentScenarioId);
        if (!scenario || !scenario.stage) return {};
        return { scenarios: state.scenarios.map((x) => x.id === scenario.id ? { ...x, stage: undefined, updatedAt: Date.now() } : x) };
      }),
      addDevice: (device) => set((state) => {
        const scenario = state.scenarios.find((x) => x.id === state.currentScenarioId);
        if (!scenario) return {};
        if (!scenario.stage) {
          const newStage = makeDefaultStage(scenario.id);
          return { scenarios: state.scenarios.map((x) => x.id === scenario.id ? { ...x, stage: { ...newStage, devices: [...newStage.devices, device] } } : x) };
        }
        return { scenarios: state.scenarios.map((x) => x.id === scenario.id ? { ...x, stage: { ...x.stage!, devices: [...x.stage!.devices, device], updatedAt: Date.now() } } : x) };
      }),
      updateDevice: (deviceId, patch) => set((state) => {
        const scenario = state.scenarios.find((x) => x.id === state.currentScenarioId);
        if (!scenario?.stage) return {};
        return { scenarios: state.scenarios.map((x) => x.id === scenario.id
          ? { ...x, stage: { ...x.stage!, devices: x.stage!.devices.map((d) => d.id === deviceId ? { ...d, ...patch } : d), updatedAt: Date.now() } }
          : x) };
      }),
      updateDeviceSize: (deviceId, size) => set((state) => {
        const scenario = state.scenarios.find((x) => x.id === state.currentScenarioId);
        if (!scenario?.stage) return {};
        return { scenarios: state.scenarios.map((x) => x.id === scenario.id
          ? { ...x, stage: { ...x.stage!, devices: x.stage!.devices.map((d) => d.id === deviceId ? { ...d, size: { w: Math.max(1, size.w), h: Math.max(1, size.h) } } : d), updatedAt: Date.now() } }
          : x) };
      }),
      deleteDevice: (deviceId) => set((state) => {
        const scenario = state.scenarios.find((x) => x.id === state.currentScenarioId);
        if (!scenario?.stage) return {};
        return { scenarios: state.scenarios.map((x) => x.id === scenario.id
          ? { ...x, stage: { ...x.stage!, devices: x.stage!.devices.filter((d) => d.id !== deviceId), updatedAt: Date.now() } }
          : x) };
      }),
      setDevicePosition: (deviceId, position) => set((state) => {
        const scenario = state.scenarios.find((x) => x.id === state.currentScenarioId);
        if (!scenario?.stage) return {};
        return { scenarios: state.scenarios.map((x) => x.id === scenario.id
          ? { ...x, stage: { ...x.stage!, devices: x.stage!.devices.map((d) => d.id === deviceId
              ? { ...d, position: { x: Math.max(0, Math.min(100, position.x)), y: Math.max(0, Math.min(100, position.y)) } }
              : d), updatedAt: Date.now() } }
          : x) };
      }),
      addShelfRow: (row) => set((state) => {
        const scenario = state.scenarios.find((x) => x.id === state.currentScenarioId);
        if (!scenario) return {};
        if (!scenario.stage) {
          const newStage = makeDefaultStage(scenario.id);
          return { scenarios: state.scenarios.map((x) => x.id === scenario.id ? { ...x, stage: { ...newStage, shelves: [...newStage.shelves, row] } } : x) };
        }
        return { scenarios: state.scenarios.map((x) => x.id === scenario.id
          ? { ...x, stage: { ...x.stage!, shelves: [...x.stage!.shelves, row].sort((a, b) => a.y - b.y), updatedAt: Date.now() } }
          : x) };
      }),
      removeShelfRow: (rowNumber) => set((state) => {
        const scenario = state.scenarios.find((x) => x.id === state.currentScenarioId);
        if (!scenario?.stage) return {};
        return { scenarios: state.scenarios.map((x) => x.id === scenario.id
          ? { ...x, stage: { ...x.stage!, shelves: x.stage!.shelves.filter((s) => s.row !== rowNumber), updatedAt: Date.now() } }
          : x) };
      }),
      updateShelfRow: (rowNumber, patch) => set((state) => {
        const scenario = state.scenarios.find((x) => x.id === state.currentScenarioId);
        if (!scenario?.stage) return {};
        return { scenarios: state.scenarios.map((x) => x.id === scenario.id
          ? { ...x, stage: { ...x.stage!, shelves: x.stage!.shelves.map((s) => s.row === rowNumber ? { ...s, ...patch } : s), updatedAt: Date.now() } }
          : x) };
      }),
    }),
    {
      name: 'wms-sandbox-v15',
      version: 15,
      // store 升级到 v11：把 shelves 数组迁移到 shelfRow 设备，清掉老结构
      migrate: (persisted: any, _version: number) => {
        if (!persisted || !Array.isArray(persisted.scenarios)) return persisted;
        persisted.scenarios = persisted.scenarios.map((sc: any) => {
          if (!sc.stage) return sc;
          const oldShelves = Array.isArray(sc.stage.shelves) ? sc.stage.shelves : [];
          const existing = Array.isArray(sc.stage.devices) ? sc.stage.devices : [];
          // 把 shelves 数组转成 shelfRow 设备（如果还没有）
          const converted = oldShelves
            .filter((s: any) => s && typeof s.row === 'number')
            .map((s: any) => {
              const id = `d-${sc.id}-row-${s.row}`;
              if (existing.some((d: any) => d.id === id)) return null;
              return {
                id,
                kind: 'shelfRow',
                name: s.label ?? `${String.fromCharCode(64 + s.row)} 排`,
                position: { x: 5, y: 30 + (s.row - 1) * 20 },
                size: { w: 90, h: 6 },
                status: 'normal',
                cellCount: s.cellCount ?? 14,
                shelfRow: s.row,
                fields: { rowLabel: s.label ?? `${String.fromCharCode(64 + s.row)} 排` },
              };
            })
            .filter(Boolean);
          return { ...sc, stage: { ...sc.stage, devices: [...existing, ...converted], shelves: [] } };
        });
        return persisted;
      },
      partialize: (s) => ({
        scenarios: s.scenarios,
        currentScenarioId: s.currentScenarioId,
        templates: s.templates,
        dashboards: s.dashboards,
        currentDashboardId: s.currentDashboardId,
        prodConfig: s.prodConfig,
      }),
    },
  ),
);

function bumpVersion(v: string) {
  const m = v.match(/v(\d+)\.(\d+)\.(\d+)/);
  if (!m) return 'v2025.06.01';
  return `v${m[1]}.${m[2]}.${String(Number(m[3]) + 1).padStart(2, '0')}`;
}

export function useCurrentScenario(): Scenario | undefined {
  return useStore((s) => s.scenarios.find((sc) => sc.id === s.currentScenarioId));
}

export { WAREHOUSE };

// ===== 工具：根据模板 + 策略类型 快速生成一个默认 ApiConfig =====
export function defaultApiConfig(): ApiConfig {
  return sampleApi();
}

export function defaultSimulateConfig(subKind: SimulateConfig['subKind']): SimulateConfig {
  return sampleSimulate(subKind);
}

export function defaultNode(kind: 'simulate' | 'api', subKind?: SimulateConfig['subKind']): ScenarioNode {
  const id = `n-${Date.now().toString(36)}`;
  if (kind === 'api') {
    return { id, name: 'API 节点', kind: 'api', enabled: true, dependsOn: [], api: sampleApi() };
  }
  return {
    id, name: '模拟节点', kind: 'simulate', enabled: true, dependsOn: [],
    simulate: sampleSimulate(subKind || 'inbound'),
  };
}

export function defaultTemplateField(name = 'field'): TemplateField {
  return { name, type: 'string', required: false, prefix: '' };
}
