import type {
  Assignment, Location, Order, OrderLine, ReplenishSuggestion, Scenario, ScenarioNode, DataTemplate, TraceEvent, Metrics, Inventory, SKU, SimulateConfig, ApiConfig, RuntimeContext,
} from './types';
import { makeRng, manhattan, pickOne, randInt, shortId, pad } from './utils';
import { buildLocations, buildSKUs, buildInitialInventory, buildInboundOrders, buildOutboundOrders, GRID_ROWS, GRID_COLS } from './mock';
import { generateRows, interpolate, getPath } from './template';
import { deviceFieldsToApiMap } from './types';

const ENTRY: { row: number; col: number } = { row: 0, col: 0 };
const EXIT: { row: number; col: number } = { row: GRID_ROWS - 1, col: GRID_COLS - 1 };

let _locations: Location[] = [];
let _skus: SKU[] = [];
let _locationById = new Map<string, Location>();
let _skuById = new Map<string, SKU>();

// ===== 策略实现 =====
function putawayNearest(line: OrderLine, _sku: SKU | undefined, free: Location[]): Location {
  return [...free].sort((a, b) => manhattan(a, ENTRY) - manhattan(b, ENTRY))[0];
}
function putawayCategory(line: OrderLine, sku: SKU | undefined, free: Location[], inventory: Inventory[]): Location {
  if (!sku) return putawayNearest(line, sku, free);
  const usedCols = new Set(
    inventory
      .filter((i) => _skuById.get(i.skuId)?.category === sku.category)
      .map((i) => i.locationId.split('-')[1]),
  );
  const sameCol = free.filter((l) => usedCols.has(String(l.col).padStart(2, '0')));
  if (sameCol.length) return sameCol[0];
  return putawayNearest(line, sku, free);
}
function putawayCapacity(line: OrderLine, sku: SKU | undefined, free: Location[]): Location {
  return [...free].sort((a, b) => b.occupied - a.occupied)[0];
}
function putawayFifo(line: OrderLine, sku: SKU | undefined, free: Location[]): Location {
  return [...free].sort((a, b) => a.id.localeCompare(b.id))[0];
}

function chooseLocation(strategy: SimulateConfig['putawayStrategy'], line: OrderLine, sku: SKU | undefined, free: Location[], inventory: Inventory[]): Location {
  switch (strategy) {
    case 'nearest':  return putawayNearest(line, sku, free);
    case 'category': return putawayCategory(line, sku, free, inventory);
    case 'capacity': return putawayCapacity(line, sku, free);
    case 'fifo':     return putawayFifo(line, sku, free);
    default:         return putawayNearest(line, sku, free);
  }
}

function pickPath(order: Order, inventory: Inventory[]): { path: Location[]; distance: number; duration: number; startedAt?: number; completedAt?: number; steps: { locationId: string; pickAt: number; skuId: string; qty: number; batch?: string }[] } {
  const occupied = new Map(inventory.map((i) => [i.locationId, i]));
  const targets: Location[] = [];
  for (const line of order.lines) {
    for (const [locId, inv] of occupied) {
      if (inv.skuId === line.skuId) {
        const loc = _locationById.get(locId);
        if (loc) targets.push(loc);
        break;
      }
    }
  }
  if (targets.length === 0) return { path: [], distance: 0, duration: 0, steps: [] };
  const sorted = [...targets].sort((a, b) => a.row - b.row || a.col - b.col);
  const path: Location[] = [toLoc(ENTRY)];
  let cur = ENTRY;
  let dist = 0;
  const startedAt = Date.now();
  for (const t of sorted) {
    dist += manhattan(cur, t);
    path.push(t);
    cur = t;
  }
  dist += manhattan(cur, EXIT);
  path.push(toLoc(EXIT));
  const duration = +(dist * 0.012).toFixed(1);
  const completedAt = startedAt + duration * 1000;
  // 每步的拣选/下降时间：按行进距离比例分配
  const steps = sorted.map((t, i) => {
    const inv = occupied.get(t.id);
    const ratio = sorted.length > 0 ? (i + 1) / sorted.length : 1;
    return {
      locationId: t.id,
      pickAt: Math.round(startedAt + duration * 1000 * ratio),
      skuId: inv?.skuId ?? '',
      qty: inv?.qty ?? 0,
      batch: inv?.batch,
    };
  });
  return { path, distance: dist, duration, startedAt, completedAt, steps };
}

/** 把舞台上的设备 ID 解析成 Location ID 集合
 *  - shelf:  一个 shelf 设备 = 一个 Location (L{row-1, cell-1})
 *  - zone:   包含若干个 shelf 设备 → 这些 shelf 各自映射到 Location
 *  - 其它:   不直接映射 Location，留作 hint（如 station/dock）
 */
function resolveDeviceIdsToLocationIds(
  deviceIds: string[] | undefined,
  stage: import('./types').Stage | undefined,
): { ids: Set<string> | null; matched: import('./types').StageDevice[]; unmatched: string[]; zoneExpanded: number } {
  if (!deviceIds || deviceIds.length === 0 || !stage) {
    return { ids: null, matched: [], unmatched: [], zoneExpanded: 0 };
  }
  const ids = new Set<string>();
  const matched: import('./types').StageDevice[] = [];
  const unmatched: string[] = [];
  let zoneExpanded = 0;
  for (const did of deviceIds) {
    const dev = stage.devices.find((d) => d.id === did);
    if (!dev) { unmatched.push(did); continue; }
    matched.push(dev);
    if (dev.kind === 'shelf' && dev.shelfRow != null && dev.shelfCell != null) {
      const r = dev.shelfRow - 1;
      const c = dev.shelfCell - 1;
      const locId = `L${String(r).padStart(2, '0')}-${String(c).padStart(2, '0')}`;
      ids.add(locId);
    } else if (dev.kind === 'zone') {
      // 区域：把区域内所有 shelf 设备都展开进来
      for (const child of stage.devices) {
        if (child.kind !== 'shelf' || child.shelfRow == null || child.shelfCell == null) continue;
        const inside =
          child.position.x + child.size.w / 2 >= dev.position.x &&
          child.position.x + child.size.w / 2 <= dev.position.x + dev.size.w &&
          child.position.y + child.size.h / 2 >= dev.position.y &&
          child.position.y + child.size.h / 2 <= dev.position.y + dev.size.h;
        if (!inside) continue;
        const r = child.shelfRow - 1;
        const c = child.shelfCell - 1;
        const locId = `L${String(r).padStart(2, '0')}-${String(c).padStart(2, '0')}`;
        ids.add(locId);
        zoneExpanded++;
      }
    }
    // station / dock / agv / conveyor / chute / stack / lift / pallet / tote / aisle → 不直接映射 Location
  }
  return { ids: ids.size > 0 ? ids : null, matched, unmatched, zoneExpanded };
}

function toLoc(p: { row: number; col: number }): Location {
  return _locationById.get(`L${String(p.row).padStart(2, '0')}-${String(p.col).padStart(2, '0')}`) || {
    id: '?', warehouseId: '?', zone: 'STORAGE', row: p.row, col: p.col, capacity: 0, occupied: 0,
  };
}

// ===== 拓扑排序 =====
function topoSort(nodes: ScenarioNode[]): ScenarioNode[] {
  const enabled = nodes.filter((n) => n.enabled);
  const map = new Map(enabled.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const order: ScenarioNode[] = [];

  function visit(n: ScenarioNode, stack = new Set<string>()) {
    if (visited.has(n.id)) return;
    if (stack.has(n.id)) {
      // 循环依赖：跳过依赖，单独输出
      return;
    }
    stack.add(n.id);
    for (const dep of n.dependsOn) {
      const d = map.get(dep);
      if (d) visit(d, stack);
    }
    stack.delete(n.id);
    visited.add(n.id);
    order.push(n);
  }

  for (const n of enabled) visit(n);
  return order;
}

// ===== API 调用（带 mock） =====
async function callApi(api: ApiConfig, ctx: Record<string, unknown>): Promise<{ status: number; ok: boolean; data: unknown; ms: number; url: string }> {
  const url = interpolate(api.url, ctx);
  const body = api.body ? interpolate(api.body, ctx) : undefined;
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(api.headers || {})) headers[k] = interpolate(v, ctx);

  const t0 = performance.now();
  // 沙盒：仅当 url 看起来是真实地址（非 example/mock）时才真发请求
  const isRealUrl = /^https?:\/\/[^/]+/.test(url) && !url.includes('example.com') && !url.includes('mock');

  if (isRealUrl) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), api.timeoutMs);
      const res = await fetch(url, { method: api.method, headers, body, signal: controller.signal });
      clearTimeout(timer);
      const text = await res.text();
      let data: unknown = text;
      try { data = JSON.parse(text); } catch { /* keep as text */ }
      return { status: res.status, ok: res.ok, data, ms: Math.round(performance.now() - t0), url };
    } catch (e) {
      return { status: 0, ok: false, data: { error: String(e) }, ms: Math.round(performance.now() - t0), url };
    }
  } else {
    // mock 模式：解析 mockResponse，作为成功响应
    await sleep(150 + Math.random() * 250);
    let data: unknown = { ok: true, mock: true };
    try { data = JSON.parse(api.mockResponse || '{}'); } catch { /* keep default */ }
    return { status: 200, ok: true, data, ms: Math.round(performance.now() - t0), url: url + ' (mock)' };
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ===== 节点执行 =====
type NodeExecutor = (
  node: ScenarioNode,
  ctx: RuntimeContext,
  apiCalls: { ok: number; total: number },
  tplMap: Record<string, DataTemplate>,
) => Promise<{ summary: string; payload?: Record<string, unknown> }>;

/** 把数据模板行转换成 Order[]（用于 inbound/outbound 节点） */
function templateRowsToOrders(
  tpl: DataTemplate,
  type: 'INBOUND' | 'OUTBOUND',
  rng: () => number,
  skuIds: string[],
): Order[] {
  const rows = generateRows(tpl);
  // 自定义行：直接保留 row.sku 原值（演示/测试场景要严格用模板指定的 SKU）
  const isCustom = !!(tpl.customRows && tpl.customRows.length > 0);
  return rows.map((row, i) => {
    const line: OrderLine = {
      id: `L-${i}`,
      skuId: isCustom
        ? String(row.sku ?? `SKU-${pad(i + 1, 4)}`)
        : `SKU-${pad(((Number(row.sku?.toString().replace(/\D/g, '')) || i + 1) % skuIds.length) + 1, 4)}`,
      qty: Number(row.qty) || 10,
      container: String(row.container ?? `CTN-${randInt(rng, 10000, 99999)}`),
      batch: String(row.batch ?? `${type === 'INBOUND' ? 'IB' : 'OB'}-${pad(i + 1, 4)}`),
    };
    return {
      id: String(row.orderId ?? `${type === 'INBOUND' ? 'IB' : 'OB'}-${pad(i + 1, 4)}`),
      type,
      lines: [line],
      createdAt: Date.now() - randInt(rng, 0, 3600_000),
    };
  });
}

const SIMULATE_EXECUTORS: Record<SimulateConfig['subKind'], NodeExecutor> = {
  inbound: async (node, ctx, _apiCalls, tplMap) => {
    const cfg = node.simulate!;
    const boundTpl = node.templateId ? tplMap[node.templateId] : undefined;
    let orders: Order[] = [];
    let source: 'stage' | 'template' | 'mock' = 'mock';
    let dockSummaries: { dockId: string; dockName: string; count: number; strategy: string }[] = [];

    if (_stage && _stage.devices.some((d) => d.business?.inboundEvent?.enabled)) {
      // 节点级 sourceDeviceIds 过滤：只允许选中设备参与
      const filterIds = node.sourceDeviceIds;
      const events = _stage.devices.filter((d) =>
        d.business?.inboundEvent?.enabled && (!filterIds || filterIds.length === 0 || filterIds.includes(d.id))
      );
      for (const dev of events) {
        const ev = dev.business!.inboundEvent!;
        // 节点级 ordersPerRun 覆盖
        const ordersPerRun = node.businessOverride?.ordersPerRun ?? ev.ordersPerRun;
        const dockOrders = buildInboundOrders(
          ordersPerRun,
          _skus,
          ev.avgLinesPerOrder,
          (ctx.variables._seed as number) + dev.id.length,
        ).map((o) => ({
          ...o,
          dockId: dev.id,
          dockName: dev.name,
          putawayStrategy: node.businessOverride?.putawayStrategy ?? ev.putawayStrategy,
        }));
        orders = orders.concat(dockOrders);
        dockSummaries.push({ dockId: dev.id, dockName: dev.name, count: dockOrders.length, strategy: ev.putawayStrategy });
      }
      source = 'stage';
    } else if (boundTpl && boundTpl.fields.length > 0) {
      orders = templateRowsToOrders(boundTpl, 'INBOUND', () => ctx.variables._seed as number, _skus.map((s) => s.id));
      source = 'template';
    } else {
      const count = cfg.count ?? Math.max(ctx.orders.length, 12);
      orders = buildInboundOrders(count, _skus, 3, ctx.variables._seed as number);
    }
    ctx.orders = orders;
    const summarySuffix = source === 'stage'
      ? `· 来自 ${dockSummaries.length} 个月台：${dockSummaries.map((d) => `${d.dockName}(${d.count})`).join(', ')}`
      : (source === 'template' ? `· 数据源：模板「${boundTpl!.name}」` : '· 数据源：内置 mock');
    return {
      summary: `生成入库申请 ${orders.length} 单 · ${orders.reduce((a, o) => a + o.lines.length, 0)} 行 ${summarySuffix}`,
      payload: { orderCount: orders.length, linesCount: orders.reduce((a, o) => a + o.lines.length, 0), sample: orders[0], source, templateId: boundTpl?.id, dockSummaries, sourceDeviceIds: node.sourceDeviceIds },
    };
  },
  outbound: async (node, ctx, _apiCalls, tplMap) => {
    const cfg = node.simulate!;
    const boundTpl = node.templateId ? tplMap[node.templateId] : undefined;
    let orders: Order[] = [];
    let source: 'stage' | 'template' | 'mock' = 'mock';
    let dockSummaries: { dockId: string; dockName: string; count: number; strategy: string }[] = [];

    if (_stage && _stage.devices.some((d) => d.business?.outboundEvent?.enabled)) {
      const filterIds = node.sourceDeviceIds;
      const events = _stage.devices.filter((d) =>
        d.business?.outboundEvent?.enabled && (!filterIds || filterIds.length === 0 || filterIds.includes(d.id))
      );
      for (const dev of events) {
        const ev = dev.business!.outboundEvent!;
        const ordersPerRun = node.businessOverride?.ordersPerRun ?? ev.ordersPerRun;
        const dockOrders = buildOutboundOrders(
          ordersPerRun,
          _skus,
          ev.avgLinesPerOrder,
          (ctx.variables._seed as number) + dev.id.length + 1,
        ).map((o) => ({
          ...o,
          dockId: dev.id,
          dockName: dev.name,
          pickStrategy: node.businessOverride?.pickStrategy ?? ev.pickStrategy,
        }));
        orders = orders.concat(dockOrders);
        dockSummaries.push({ dockId: dev.id, dockName: dev.name, count: dockOrders.length, strategy: ev.pickStrategy });
      }
      source = 'stage';
    } else if (boundTpl && boundTpl.fields.length > 0) {
      orders = templateRowsToOrders(boundTpl, 'OUTBOUND', () => (ctx.variables._seed as number) + 1, _skus.map((s) => s.id));
      source = 'template';
    } else {
      const count = cfg.count ?? 10;
      orders = buildOutboundOrders(count, _skus, 3, (ctx.variables._seed as number) + 1);
    }
    ctx.pickOrders = orders;
    const summarySuffix = source === 'stage'
      ? `· 来自 ${dockSummaries.length} 个月台：${dockSummaries.map((d) => `${d.dockName}(${d.count})`).join(', ')}`
      : (source === 'template' ? `· 数据源：模板「${boundTpl!.name}」` : '· 数据源：内置 mock');
    return {
      summary: `生成出库单 ${orders.length} 张 · 共 ${orders.reduce((a, o) => a + o.lines.length, 0)} 行 ${summarySuffix}`,
      payload: { orderCount: orders.length, sample: orders[0], source, templateId: boundTpl?.id, dockSummaries, sourceDeviceIds: node.sourceDeviceIds },
    };
  },
  inventory: async (node, ctx) => {
    const seed = (ctx.variables._seed as number) + 99;
    // 节点级目标设备：库存只生成在绑定的库位
    const targetRes = resolveDeviceIdsToLocationIds(node.targetDeviceIds, _stage);
    const targetLocIds = targetRes.ids;
    const baseLocations = targetLocIds
      ? _locations.filter((l) => l.zone === 'STORAGE' && targetLocIds.has(l.id))
      : _locations.filter((l) => l.zone === 'STORAGE');
    if (targetLocIds && baseLocations.length === 0) {
      return { summary: '⚠ 目标库位未匹配到可用的 STORAGE 位置', payload: { invCount: 0, bound: true } };
    }
    const inv = buildInitialInventory(baseLocations, _skus, seed);
    ctx.inventory = inv;
    const boundInfo = targetLocIds
      ? ` · 仅在绑定 ${targetRes.matched.length} 个设备${targetRes.zoneExpanded ? `（区域展开 ${targetRes.zoneExpanded} 个库位）` : ''} (${targetRes.matched.map((d) => d.name).slice(0, 3).join(',')}${targetRes.matched.length > 3 ? '...' : ''})`
      : '';
    return {
      summary: `生成初始库存 ${inv.length} 条 · 分布在 ${new Set(inv.map((i) => i.locationId)).size} 个库位${boundInfo}`,
      payload: {
        invCount: inv.length,
        targetDeviceIds: node.targetDeviceIds,
        targetMatched: targetRes.matched.map((d) => ({ id: d.id, name: d.name, kind: d.kind })),
        targetUnmatched: targetRes.unmatched,
        zoneExpanded: targetRes.zoneExpanded,
        bound: !!targetLocIds,
      },
    };
  },
  allocate: async (node, ctx) => {
    if (ctx.orders.length === 0) return { summary: '⚠ 无入库单可分配（请先执行「入库申请」）', payload: { count: 0 } };
    const strategy = node.simulate!.putawayStrategy ?? 'nearest';
    // 节点级目标设备解析：分到哪些库位
    const targetRes = resolveDeviceIdsToLocationIds(node.targetDeviceIds, _stage);
    const targetLocIds = targetRes.ids; // null = 不限制（用全部）
    const usedKeys = new Set(ctx.inventory.map((i) => i.locationId));
    const allStorage = _locations.filter((l) => l.zone === 'STORAGE' && !usedKeys.has(l.id));
    const free = targetLocIds
      ? allStorage.filter((l) => targetLocIds.has(l.id))
      : allStorage;
    // 双深约束：从 _stage.devices 解析 shelfRow → rowIndex (0-based) 的映射
    // 并把每行纳入 rowIndex 的双深对（如果配置了）
    const rowToRowIdx = new Map<number, number>();  // shelfRow (1-based) -> location row (0-based)
    if (_stage) {
      for (const d of _stage.devices) {
        if (d.kind === 'shelfRow' && d.shelfRow != null) {
          rowToRowIdx.set(d.shelfRow, d.shelfRow - 1);
        }
      }
    }
    const ddp = _stage?.doubleDeepPairs;
    const ddpLocPair = new Map<number, number>();  // location row (0-based) -> paired location row
    if (ddp) {
      for (const [sRow, paired] of Object.entries(ddp)) {
        const a = rowToRowIdx.get(Number(sRow));
        const b = rowToRowIdx.get(paired);
        if (a != null && b != null) {
          ddpLocPair.set(a, b);
          ddpLocPair.set(b, a);
        }
      }
    }
    // 双深过滤：把与已占库位冲突的双深位置排除（已占库位中可能存在不同品/批的双深对端）
    const conflictedLocIds = new Set<string>();
    if (ddpLocPair.size > 0) {
      for (const inv of ctx.inventory) {
        const m = inv.locationId.match(/^L(\d+)-(\d+)$/);
        if (!m) continue;
        const r = Number(m[1]);
        const c = Number(m[2]);
        const paired = ddpLocPair.get(r);
        if (paired == null) continue;
        const pairedId = `L${String(paired).padStart(2, '0')}-${String(c).padStart(2, '0')}`;
        // 配对端被占的 SKU+batch
        const pairedInv = ctx.inventory.find((x) => x.locationId === pairedId);
        if (pairedInv && (pairedInv.skuId !== inv.skuId || pairedInv.batch !== inv.batch)) {
          // 冲突：本端和配对端都被不同品/批占着，两端都禁入
          conflictedLocIds.add(inv.locationId);
          conflictedLocIds.add(pairedId);
        }
      }
    }
    const filteredFree = conflictedLocIds.size > 0
      ? free.filter((l) => !conflictedLocIds.has(l.id))
      : free;
    const freeCopy = [...filteredFree];
    const assignments: Assignment[] = [];
    // 实时跟踪：本轮内已分配的"占位信息"（含同轮后续冲突判定）
    const liveInv = new Map<string, { skuId: string; batch: string }>();
    for (const inv of ctx.inventory) liveInv.set(inv.locationId, { skuId: inv.skuId, batch: inv.batch });
    let anomalies = 0;
    for (const order of ctx.orders) {
      for (const line of order.lines) {
        // 双深实时过滤：再排除一次（与本轮已分配/初始库存冲突的位置）
        const liveFiltered = freeCopy.filter((l) => {
          if (!ddpLocPair.size) return true;
          const m = l.id.match(/^L(\d+)-(\d+)$/);
          if (!m) return true;
          const r = Number(m[1]);
          const c = Number(m[2]);
          const paired = ddpLocPair.get(r);
          if (paired == null) return true;
          const pairedId = `L${String(paired).padStart(2, '0')}-${String(c).padStart(2, '0')}`;
          const pairedOcc = liveInv.get(pairedId);
          if (!pairedOcc) return true;  // 配对端空，可入
          // 配对端被占：要求相同 SKU+batch
          return pairedOcc.skuId === line.skuId && pairedOcc.batch === line.batch;
        });
        if (liveFiltered.length === 0) { anomalies++; continue; }
        const sku = _skuById.get(line.skuId);
        const chosen = chooseLocation(strategy, line, sku, liveFiltered, ctx.inventory);
        freeCopy.splice(freeCopy.indexOf(chosen), 1);
        liveInv.set(chosen.id, { skuId: line.skuId, batch: line.batch ?? 'BATCH-0000' });
        // 解析该库位对应到哪个舞台设备（用于看板展示）
        let deviceHint: { deviceId?: string; deviceName?: string; deviceKind?: string } = {};
        if (_stage) {
          const hit = _stage.devices.find(
            (d) => d.kind === 'shelf' && d.shelfRow != null && d.shelfCell != null
              && d.shelfRow - 1 === chosen.row && d.shelfCell - 1 === chosen.col,
          );
          if (hit) deviceHint = { deviceId: hit.id, deviceName: hit.name, deviceKind: hit.kind };
        }
        const createdAt = Date.now();
        assignments.push({
          orderLineId: line.id,
          orderId: order.id,
          skuId: line.skuId,
          container: line.container || 'CTN-00000',
          locationId: chosen.id,
          distance: manhattan(ENTRY, chosen),
          batch: line.batch,
          createdAt,
          phase: 'pending',
        });
      }
    }
    ctx.assignments = assignments;
    const boundInfo = targetLocIds
      ? ` · 终点已绑定 ${targetRes.matched.length} 个设备${targetRes.zoneExpanded ? `（区域展开 ${targetRes.zoneExpanded} 个库位）` : ''}${targetRes.unmatched.length ? ` ⚠ 失效 ${targetRes.unmatched.length}` : ''}`
      : (node.targetDeviceIds && node.targetDeviceIds.length > 0 ? ' · ⚠ 绑定设备未匹配到库位' : '');
    return {
      summary: `分配完成：${assignments.length} 行 · 策略 ${strategy} · 异常 ${anomalies}${boundInfo}`,
      payload: {
        count: assignments.length,
        strategy,
        anomalies,
        targetDeviceIds: node.targetDeviceIds,
        targetMatched: targetRes.matched.map((d) => ({ id: d.id, name: d.name, kind: d.kind })),
        targetUnmatched: targetRes.unmatched,
        zoneExpanded: targetRes.zoneExpanded,
        bound: !!targetLocIds,
      },
    };
  },
  putaway: async (node, ctx) => {
    if (ctx.assignments.length === 0) return { summary: '⚠ 未先执行「库存分配」', payload: {} };
    const categories = new Set(ctx.assignments.map((a) => _skuById.get(a.skuId)?.category).filter(Boolean));
    // 节点级目标设备解析：经由哪些工位（putaway role 校验）
    const targetRes = node.targetDeviceIds && _stage
      ? {
          stations: _stage.devices.filter(
            (d) => node.targetDeviceIds!.includes(d.id) && d.kind === 'station',
          ),
          others: _stage.devices.filter(
            (d) => node.targetDeviceIds!.includes(d.id) && d.kind !== 'station',
          ),
        }
      : null;
    const stationInfo = targetRes
      ? targetRes.stations.length
        ? ` · 经由工位 ${targetRes.stations.map((d) => d.name).slice(0, 3).join(',')}${targetRes.stations.length > 3 ? '...' : ''}（${targetRes.stations.filter((d) => d.business?.stationRole === 'putaway').length} 个角色匹配）`
        : (node.targetDeviceIds && node.targetDeviceIds.length > 0 ? ' · ⚠ 绑定设备未匹配到工位' : '')
      : '';
    // 实际执行上架：把 pending 分配落到 inventory，标记 putawayAt + phase=occupied
    const now = Date.now();
    let putawayCount = 0;
    for (const a of ctx.assignments) {
      if (a.phase !== 'pending') continue;  // 已上架的跳过（支持重跑幂等）
      const loc = _locationById.get(a.locationId);
      if (!loc) continue;
      // 入库：往 inventory 加一条
      ctx.inventory.push({ locationId: a.locationId, skuId: a.skuId, qty: a.distance || 1, batch: a.batch ?? 'BATCH-0000' });
      a.putawayAt = now;
      a.phase = 'occupied';
      putawayCount++;
    }
    return {
      summary: `上架完成 · ${putawayCount} 行已上架 · 涉及品类 ${categories.size} 类${stationInfo}`,
      payload: {
        categories: categories.size,
        putawayCount,
        targetDeviceIds: node.targetDeviceIds,
        stations: targetRes?.stations.map((d) => ({ id: d.id, name: d.name, role: d.business?.stationRole })) ?? [],
        others: targetRes?.others.map((d) => ({ id: d.id, name: d.name, kind: d.kind })) ?? [],
      },
    };
  },
  pick: async (node, ctx) => {
    if (ctx.pickOrders.length === 0) {
      // 兜底生成
      ctx.pickOrders = buildOutboundOrders(10, _skus, 3, (ctx.variables._seed as number) + 5);
    }
    // 节点级来源设备：只从绑定库位拣
    const sourceRes = resolveDeviceIdsToLocationIds(node.sourceDeviceIds, _stage);
    const sourceLocIds = sourceRes.ids;
    const scopedInventory = sourceLocIds
      ? ctx.inventory.filter((i) => sourceLocIds.has(i.locationId))
      : ctx.inventory;
    const picks: RuntimeContext['picks'] = [];
    const pickedLocIds = new Set<string>();
    for (const order of ctx.pickOrders) {
      const result = pickPath(order, scopedInventory);
      picks.push({ orderId: order.id, ...result });
      for (const step of result.steps) pickedLocIds.add(step.locationId);
    }
    // 实际执行下降：把被拣的库位从 inventory 移除
    if (pickedLocIds.size > 0) {
      ctx.inventory = ctx.inventory.filter((i) => !pickedLocIds.has(i.locationId));
    }
    ctx.picks = picks;
    const totalDist = picks.reduce((a, p) => a + p.distance, 0);
    const boundInfo = sourceLocIds
      ? ` · 仅扫绑定 ${sourceRes.matched.length} 个设备${sourceRes.zoneExpanded ? `（区域展开 ${sourceRes.zoneExpanded} 个库位）` : ''} (${sourceRes.matched.map((d) => d.name).slice(0, 3).join(',')}${sourceRes.matched.length > 3 ? '...' : ''})`
      : (node.sourceDeviceIds && node.sourceDeviceIds.length > 0 ? ' · ⚠ 绑定设备未匹配到库位' : '');
    return {
      summary: `拣选/下降完成 · ${picks.length} 单 · 下降 ${pickedLocIds.size} 个库位 · 总距离 ${totalDist} m${boundInfo}`,
      payload: {
        count: picks.length,
        totalDist,
        pickedLocations: pickedLocIds.size,
        sourceDeviceIds: node.sourceDeviceIds,
        sourceMatched: sourceRes.matched.map((d) => ({ id: d.id, name: d.name, kind: d.kind })),
        sourceUnmatched: sourceRes.unmatched,
        zoneExpanded: sourceRes.zoneExpanded,
        bound: !!sourceLocIds,
        scopedInventoryCount: scopedInventory.length,
      },
    };
  },
  replenish: async (node, ctx) => {
    const threshold = node.simulate!.replenishThreshold ?? 30;
    // 节点级来源设备：只扫描绑定库位
    const sourceRes = resolveDeviceIdsToLocationIds(node.sourceDeviceIds, _stage);
    const sourceLocIds = sourceRes.ids;
    const scannedInventory = sourceLocIds
      ? ctx.inventory.filter((i) => sourceLocIds.has(i.locationId))
      : ctx.inventory;
    const list: ReplenishSuggestion[] = scannedInventory
      .filter((i) => i.qty < threshold)
      .map((i) => ({ skuId: i.skuId, locationId: i.locationId, current: i.qty, threshold, suggested: threshold * 3 - i.qty }));
    ctx.replenish = list;
    const boundInfo = sourceLocIds
      ? ` · 仅扫绑定 ${sourceRes.matched.length} 个设备${sourceRes.zoneExpanded ? `（区域展开 ${sourceRes.zoneExpanded} 个库位）` : ''} (${sourceRes.matched.map((d) => d.name).slice(0, 3).join(',')}${sourceRes.matched.length > 3 ? '...' : ''})`
      : '';
    return {
      summary: `补货建议：${list.length} 条 · 阈值 ${threshold}${boundInfo}`,
      payload: {
        count: list.length,
        threshold,
        sourceDeviceIds: node.sourceDeviceIds,
        sourceMatched: sourceRes.matched.map((d) => ({ id: d.id, name: d.name, kind: d.kind })),
        sourceUnmatched: sourceRes.unmatched,
        zoneExpanded: sourceRes.zoneExpanded,
        bound: !!sourceLocIds,
        scannedLocations: scannedInventory.length,
      },
    };
  },
  custom: async (node, ctx) => {
    // 简化实现：只回显 customScript
    const script = node.simulate?.customScript ?? '';
    return { summary: `自定义脚本已「执行」：${script.slice(0, 60) || '(空)'}`, payload: { script: script.slice(0, 200) } };
  },
};

const API_EXECUTOR: NodeExecutor = async (node, ctx, apiCalls, tplMap) => {
  const api = node.api!;
  const baseVars: Record<string, unknown> = { ...ctx.variables };
  for (const [nid, out] of Object.entries(ctx.nodeOutputs)) {
    if (out && typeof out === 'object') {
      for (const [k, v] of Object.entries(out as Record<string, unknown>)) {
        baseVars[`${nid}.${k}`] = v;
      }
    }
  }
  // 注入设备字段：{{device.xxx}} 引用 → 第一个绑定设备的字段
  // 注入数组：{{devices[0].xxx}} / {{devices}} 引用
  if (_stage && (node.sourceDeviceIds?.length || node.targetDeviceIds?.length)) {
    const ids = [...(node.sourceDeviceIds ?? []), ...(node.targetDeviceIds ?? [])];
    const devList = ids
      .map((id) => _stage!.devices.find((d) => d.id === id))
      .filter(Boolean) as import('./types').StageDevice[];
    if (devList.length > 0) {
      baseVars.device = deviceFieldsToApiMap(devList[0]);
      baseVars.devices = devList.map((d) => deviceFieldsToApiMap(d));
    }
  }

  // 把绑定设备列表挂到 ctx 上，runSingleApiCall / 批量结束后回填
  // （用 module 级 _boundDevicesForNode 暂存）
  _boundDevicesForNode = [...(node.sourceDeviceIds ?? []), ...(node.targetDeviceIds ?? [])];
  try {
    const boundTpl = node.templateId ? tplMap[node.templateId] : undefined;
    // 模板未绑定 / 模板无字段 → 单次调用（保持原行为）
    if (!boundTpl || boundTpl.fields.length === 0) {
      return await runSingleApiCall(api, baseVars, apiCalls);
    }

    // 模板绑定 → 按行批量调用
    const rows = generateRows(boundTpl);
    const concurrency = Math.max(1, Math.min(20, Number((api as ApiConfig & { batchConcurrency?: number }).batchConcurrency) || 5));
    const results: { ok: boolean; status: number; ms: number; rowIndex: number; url: string; data: unknown }[] = [];
    let cursor = 0;
    const workers: Promise<void>[] = [];
    for (let w = 0; w < Math.min(concurrency, rows.length); w++) {
      workers.push((async () => {
        while (true) {
          const i = cursor++;
          if (i >= rows.length) return;
          const row = rows[i];
          const rowVars: Record<string, unknown> = { ...baseVars, ...row };
          let attempts = 0;
          let res: { ok: boolean; status: number; data: unknown; ms: number; url: string };
          while (true) {
            res = await callApi(api, rowVars);
            attempts++;
            apiCalls.total++;
            if (res.ok) { apiCalls.ok++; break; }
            if (attempts > api.retry) break;
            await sleep(200);
          }
          results.push({ ...res, rowIndex: i });
          await sleep(20);
        }
      })());
    }
    await Promise.all(workers);

    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;
    const totalMs = results.reduce((a, r) => a + r.ms, 0);
    const sample = results[0];
    return {
      summary: `${api.method} ${api.url.split('/').pop() || '/'} · 批量 ${results.length} 次 · ✓${okCount} ✗${failCount} · 均耗 ${results.length ? Math.round(totalMs / results.length) : 0}ms · 并发 ${concurrency}`,
      payload: {
        _boundDevices: _boundDevicesForNode,
        method: api.method,
        url: api.url,
        batch: true,
        total: results.length,
        ok: okCount,
        fail: failCount,
        concurrency,
        totalMs,
        avgMs: results.length ? Math.round(totalMs / results.length) : 0,
        templateId: boundTpl.id,
        templateName: boundTpl.name,
        results,
        sample: sample ? { request: { method: api.method, url: sample.url, body: api.body }, response: sample.data, status: sample.status } : undefined,
      },
    };
  } finally {
    _boundDevicesForNode = [];
  }
};

// module 级：当前 API 节点绑定的设备 ID 列表（供 runSingleApiCall 写 payload）
let _boundDevicesForNode: string[] = [];

async function runSingleApiCall(
  api: ApiConfig,
  vars: Record<string, unknown>,
  apiCalls: { ok: number; total: number },
): Promise<{ summary: string; payload?: Record<string, unknown> }> {
  let res;
  let attempts = 0;
  while (true) {
    res = await callApi(api, vars);
    attempts++;
    apiCalls.total++;
    if (res.ok) { apiCalls.ok++; break; }
    if (attempts > api.retry) break;
    await sleep(200);
  }
  const extracted = api.responseMapping ? getPath(res.data, api.responseMapping) : res.data;
  return {
    summary: res.ok
      ? `${api.method} ${api.url.split('/').pop() || '/'} · ${res.status} · ${res.ms}ms${res.url.includes('mock') ? ' (MOCK)' : ''}`
      : `${api.method} ${api.url.split('/').pop() || '/'} · 失败 ${res.status} · ${res.ms}ms`,
    payload: {
      _boundDevices: _boundDevicesForNode,
      method: api.method,
      url: api.url,
      request: { method: api.method, url: res.url, headers: api.headers, body: api.body },
      response: res.data,
      status: res.status,
      durationMs: res.ms,
      extracted,
    },
  };
}

// ===== 主入口 =====
// 模拟器模块级状态（一次仿真期间可访问）
let _stage: import('./types').Stage | undefined;

export async function runScenario(
  scenario: Scenario,
  /** 默认模板（场景级兜底），未给则不应用 */
  template: DataTemplate | undefined,
  seed: number,
  onTrace: (e: TraceEvent) => void,
  onProgress?: (p: number) => void,
  /** 全部已注册模板（含内置与用户自定义），按节点 templateId 查找 */
  templatesById?: Record<string, DataTemplate>,
  /** 场景自带的舞台（WMS 业务对象 + 事件配置） */
  stage?: import('./types').Stage,
): Promise<import('./types').SimulationResult> {
  const t0 = performance.now();
  const rng = makeRng(seed);
  const tplMap: Record<string, DataTemplate> = templatesById ?? (template ? { __default__: template } : {});
  _stage = stage;

  // 初始化领域数据
  _locations = buildLocations();
  _locationById = new Map(_locations.map((l) => [l.id, l]));
  _skus = buildSKUs(40, seed + 1);
  _skuById = new Map(_skus.map((s) => [s.id, s]));

  const ctx: RuntimeContext = {
    variables: { _seed: seed, _wareHouseId: 'WH-001' },
    nodeOutputs: {},
    orders: [],
    pickOrders: [],
    inventory: buildInitialInventory(_locations, _skus, seed + 2),
    assignments: [],
    picks: [],
    replenish: [],
  };

  // 旧版全局模板兜底：若 inbound 节点未绑模板且给了全局 template，则预填 orders
  if (template && template.fields.length > 0 && !scenario.nodes.some((n) => n.templateId)) {
    ctx.orders = templateRowsToOrders(template, 'INBOUND', rng, _skus.map((s) => s.id));
  }

  const trace: TraceEvent[] = [];
  const apiCalls = { ok: 0, total: 0 };
  const total = scenario.nodes.filter((n) => n.enabled).length || 1;

  const push = (node: ScenarioNode, status: TraceEvent['status'], summary: string, payload?: Record<string, unknown>, durationMs?: number) => {
    const e: TraceEvent = {
      id: shortId('T', trace.length + 1),
      ts: Date.now(),
      step: node.id,
      nodeId: node.id,
      nodeName: node.name,
      status,
      summary,
      payload,
      durationMs,
    };
    trace.push(e);
    onTrace(e);
  };

  const order = topoSort(scenario.nodes);
  let done = 0;

  for (const node of order) {
    push(node, 'running', '执行中...');
    const tn0 = performance.now();
    try {
      let result: { summary: string; payload?: Record<string, unknown> };
      if (node.kind === 'simulate') {
        const subKind = node.simulate?.subKind ?? 'inbound';
        result = await SIMULATE_EXECUTORS[subKind](node, ctx, apiCalls, tplMap);
      } else if (node.kind === 'api') {
        if (!node.api) throw new Error('API 节点缺少 api 配置');
        result = await API_EXECUTOR(node, ctx, apiCalls, tplMap);
      } else {
        result = { summary: '透传节点' };
      }
      ctx.nodeOutputs[node.id] = result.payload || {};
      const ms = Math.round(performance.now() - tn0);
      push(node, 'done', result.summary, result.payload, ms);
    } catch (err) {
      // 错误：把绑定设备、method/url 都写到 payload，让 buildStageDeviceResults 能挂 fault
      const bound = [...(node.sourceDeviceIds ?? []), ...(node.targetDeviceIds ?? [])];
      const method = node.api?.method ?? 'API';
      const url = node.api?.url ?? '';
      push(node, 'error', `错误: ${(err as Error).message}`, {
        _boundDevices: bound,
        method,
        url,
        status: 0,
        durationMs: Math.round(performance.now() - tn0),
        errorMessage: (err as Error).message,
      });
    }
    done++;
    onProgress?.(done / total);
    await sleep(50);
  }

  // 汇总指标
  const usedStorage = _locations.filter((l) => l.zone === 'STORAGE');
  const usedCount = usedStorage.filter((l) => l.occupied > 0).length + ctx.assignments.length;
  const utilization = +(Math.min(100, (usedCount / usedStorage.length) * 100)).toFixed(1);
  const totalDist = ctx.picks.reduce((a, p) => a + p.distance, 0);
  const totalTime = +ctx.picks.reduce((a, p) => a + p.duration, 0).toFixed(1);
  const anomalies = 0;

  const metrics: Metrics = {
    utilization,
    pickDistance: totalDist,
    pickTime: totalTime,
    anomalies,
    assignmentsCount: ctx.assignments.length,
    ordersCount: ctx.orders.length,
    pickOrdersCount: ctx.pickOrders.length,
    apiCallsCount: apiCalls.total,
    apiSuccessCount: apiCalls.ok,
  };

  // === 回填舞台设备结果（按设备 ID 索引） ===
  const stageDeviceResults = buildStageDeviceResults({
    stage: _stage,
    orders: ctx.orders,
    pickOrders: ctx.pickOrders,
    assignments: ctx.assignments,
    picks: ctx.picks,
    inventory: ctx.inventory,
    trace,
    skus: _skus,
  });

  // === 舞台快照（深拷贝设备的最终状态） ===
  const stageSnapshot = _stage
    ? {
        ..._stage,
        devices: _stage.devices.map((d) => ({ ...d, fields: d.fields ? { ...d.fields } : undefined })),
      }
    : undefined;

  const t1 = performance.now();
  return {
    id: shortId('SIM', Math.floor(t0)),
    trace,
    orders: ctx.orders,
    pickOrders: ctx.pickOrders,
    inventory: ctx.inventory,
    locations: _locations,
    assignments: ctx.assignments,
    picks: ctx.picks,
    replenish: ctx.replenish,
    metrics,
    config: { scope: [], scenarioId: scenario.id },
    timestamp: Date.now(),
    duration: Math.round(t1 - t0),
    stageDeviceResults,
    stageSnapshot,
  };
}

// ============== 设备结果回填 ==============
function buildStageDeviceResults(args: {
  stage: import('./types').Stage | undefined;
  orders: Order[];
  pickOrders: Order[];
  assignments: Assignment[];
  picks: { orderId: string; path: Location[]; distance: number; duration: number; startedAt?: number; completedAt?: number; steps?: { locationId: string; pickAt: number; skuId: string; qty: number; batch?: string }[] }[];
  inventory: Inventory[];
  trace: TraceEvent[];
  skus: SKU[];
}): Record<string, import('./types').StageDeviceResult> {
  const out: Record<string, import('./types').StageDeviceResult> = {};
  if (!args.stage) return out;
  const { stage, orders, pickOrders, assignments, picks, trace, skus } = args;
  // 给每个设备一个基础结果
  for (const dev of stage.devices) {
    out[dev.id] = {
      deviceId: dev.id,
      deviceName: dev.name,
      deviceKind: dev.kind,
      status: dev.status,
    };
  }
  // ===== 把 API 节点的调用结果回填到绑定设备 =====
  for (const e of trace) {
    if (e.status === 'running' || !e.payload) continue;
    // 从 trace event payload 读出 _boundDevices（API_EXECUTOR / 错误分支写入）
    const bound = (e.payload as Record<string, unknown> | undefined)?._boundDevices as string[] | undefined;
    if (!bound || bound.length === 0) continue;
    // 提取 API 调用摘要
    const method = String((e.payload as Record<string, unknown>).method ?? '');
    const url = String((e.payload as Record<string, unknown>).url ?? '');
    const httpStatus = Number((e.payload as Record<string, unknown>).status ?? 0) || 0;
    const durationMs = Number((e.payload as Record<string, unknown>).durationMs ?? e.durationMs ?? 0) || 0;
    const isBatch = (e.payload as Record<string, unknown>).batch === true;
    const ok = isBatch
      ? Number((e.payload as Record<string, unknown>).fail ?? 0) === 0
      : e.status === 'done' && (httpStatus === 0 || (httpStatus >= 200 && httpStatus < 300));
    const errorMessage = !ok
      ? (e.status === 'error' ? e.summary : `HTTP ${httpStatus || 'N/A'}`)
      : undefined;
    const responseSummary = (() => {
      const resp = (e.payload as Record<string, unknown>).response;
      if (resp == null) return undefined;
      try { return JSON.stringify(resp).slice(0, 120); } catch { return String(resp).slice(0, 120); }
    })();
    const requestSummary = (() => {
      const req = (e.payload as Record<string, unknown>).request;
      if (req && typeof req === 'object') {
        try { return JSON.stringify(req).slice(0, 120); } catch { return String(req).slice(0, 120); }
      }
      return undefined;
    })();
    const batchInfo = isBatch
      ? {
          total: Number((e.payload as Record<string, unknown>).total ?? 0),
          ok: Number((e.payload as Record<string, unknown>).ok ?? 0),
          fail: Number((e.payload as Record<string, unknown>).fail ?? 0),
        }
      : undefined;
    const call = {
      ok,
      method: method || 'API',
      url,
      httpStatus,
      durationMs,
      errorMessage,
      responseSummary,
      requestSummary,
      batch: batchInfo,
      ts: e.ts,
      nodeId: e.nodeId,
      nodeName: e.nodeName,
    };
    for (const devId of bound) {
      if (!out[devId]) continue;
      const r = out[devId];
      r.apiCall = call;
      // 失败时把设备状态置 fault
      if (!ok) r.status = 'fault';
      else if (r.status === 'normal' || r.status === 'idle') r.status = 'running';
    }
  }
  // dock: 入库事件 → 哪些单是在哪个 dock 上生成的
  for (const o of orders) {
    if (o.dockId && out[o.dockId]) {
      const r = out[o.dockId];
      r.ordersHandled = (r.ordersHandled ?? 0) + 1;
      r.linesHandled = (r.linesHandled ?? 0) + o.lines.length;
      r.taskNumber = o.id;
      r.currentCommand = '收货';
      r.barcode = o.lines[0]?.container;
      if (r.status !== 'fault') r.status = 'running';
    }
  }
  for (const o of pickOrders) {
    if (o.dockId && out[o.dockId]) {
      const r = out[o.dockId];
      r.ordersHandled = (r.ordersHandled ?? 0) + 1;
      r.linesHandled = (r.linesHandled ?? 0) + o.lines.length;
      r.taskNumber = o.id;
      r.currentCommand = '发货';
      r.barcode = o.lines[0]?.container;
      if (r.status !== 'fault') r.status = 'running';
    }
  }
  // shelf: assignment.locationId → 反查 shelf 设备
  const locToDevice = new Map<string, string>();
  for (const dev of stage.devices) {
    if (dev.kind === 'shelf' && dev.shelfRow != null && dev.shelfCell != null) {
      const r = dev.shelfRow - 1;
      const c = dev.shelfCell - 1;
      const locId = `L${String(r).padStart(2, '0')}-${String(c).padStart(2, '0')}`;
      locToDevice.set(locId, dev.id);
    } else if (dev.kind === 'zone') {
      // 区域：把区域内 shelf 全部算上
      for (const child of stage.devices) {
        if (child.kind !== 'shelf' || child.shelfRow == null || child.shelfCell == null) continue;
        const inside =
          child.position.x + child.size.w / 2 >= dev.position.x &&
          child.position.x + child.size.w / 2 <= dev.position.x + dev.size.w &&
          child.position.y + child.size.h / 2 >= dev.position.y &&
          child.position.y + child.size.h / 2 <= dev.position.y + dev.size.h;
        if (!inside) continue;
        const r = child.shelfRow - 1;
        const c = child.shelfCell - 1;
        const locId = `L${String(r).padStart(2, '0')}-${String(c).padStart(2, '0')}`;
        if (!locToDevice.has(locId)) locToDevice.set(locId, dev.id);
      }
    }
  }
  for (const a of assignments) {
    const devId = locToDevice.get(a.locationId);
    if (devId && out[devId]) {
      const r = out[devId];
      r.assignedLocationIds = [...(r.assignedLocationIds ?? []), a.locationId];
      r.taskNumber = a.orderId;
      r.barcode = a.container;
      r.currentCommand = '已上架';
      if (r.status !== 'fault') r.status = 'running';
      // 行摘要（SKU / 数量） —— 用于舞台单元格填充
      // 从 order/pickOrder 里反查 orderLineId → qty
      const order = orders.find((o) => o.id === a.orderId) ?? pickOrders.find((o) => o.id === a.orderId);
      const line = order?.lines.find((l) => l.id === a.orderLineId);
      const sku = skus.find((s) => s.id === a.skuId);
      r.assignmentsSummary = [
        ...(r.assignmentsSummary ?? []),
        {
          orderId: a.orderId,
          sku: sku?.name ?? a.skuId,
          qty: line?.qty ?? 0,
          container: a.container,
          locationId: a.locationId,
        },
      ];
    }
  }
  // station: 拣选数
  for (const dev of stage.devices) {
    if (dev.kind !== 'station') continue;
    const r = out[dev.id];
    const role = dev.business?.stationRole;
    if (role === 'pick' || role === 'pack') {
      // 按 inbound 触发把拣选量挂到这个工位上
      r.picksHandled = picks.length;
      r.taskNumber = picks[0]?.orderId;
      r.currentCommand = role === 'pick' ? '拣选' : '打包';
      r.status = picks.length > 0 ? 'running' : 'idle';
    } else if (role === 'putaway') {
      r.picksHandled = assignments.length;
      r.taskNumber = assignments[0]?.orderId;
      r.currentCommand = '上架';
      r.status = assignments.length > 0 ? 'running' : 'idle';
    } else {
      r.status = 'idle';
    }
  }
  return out;
}

export { ENTRY, EXIT, GRID_ROWS, GRID_COLS };
