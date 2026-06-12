import type {
  Warehouse, Location, SKU, Inventory, Order, OrderLine, HistoricalSnapshot, Metrics,
} from './types';
import { makeRng, pickOne, randInt, shortId, range } from './utils';

export const WAREHOUSE: Warehouse = {
  id: 'WH-001',
  name: '沙河中心仓',
  zoneCount: 4,
};

export const GRID_ROWS = 8;
export const GRID_COLS = 12;

// 12 列分区：左 1-2 = INBOUND，3-8 = STORAGE，9-10 = PICK，11-12 = OUTBOUND
export function buildLocations(): Location[] {
  const list: Location[] = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      let zone: Location['zone'] = 'STORAGE';
      if (c < 2) zone = 'INBOUND';
      else if (c >= 2 && c < 8) zone = 'STORAGE';
      else if (c >= 8 && c < 10) zone = 'PICK';
      else zone = 'OUTBOUND';
      list.push({
        id: `L${String(r).padStart(2, '0')}-${String(c).padStart(2, '0')}`,
        warehouseId: WAREHOUSE.id,
        zone,
        row: r,
        col: c,
        capacity: zone === 'STORAGE' ? 100 : 50,
        occupied: 0,
      });
    }
  }
  return list;
}

const CATEGORIES = ['饮料', '零食', '日化', '电器', '服饰', '生鲜'];
const SUFFIX = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export function buildSKUs(count: number, seed = 42): SKU[] {
  const rng = makeRng(seed);
  return range(count).map((i) => {
    const cat = pickOne(rng, CATEGORIES);
    const cls: SKU['abcClass'] = i < count * 0.2 ? 'A' : i < count * 0.5 ? 'B' : 'C';
    return {
      id: `SKU-${String(i + 1).padStart(4, '0')}`,
      name: `${cat}${pickOne(rng, SUFFIX)}-${randInt(rng, 100, 999)}`,
      category: cat,
      weight: +(rng() * 5 + 0.2).toFixed(2),
      volume: +(rng() * 3 + 0.1).toFixed(2),
      abcClass: cls,
    };
  });
}

export function buildInitialInventory(
  locations: Location[],
  skus: SKU[],
  seed = 7,
): Inventory[] {
  const storage = locations.filter((l) => l.zone === 'STORAGE');
  const rng = makeRng(seed);
  const inv: Inventory[] = [];
  for (const loc of storage.slice(0, Math.min(storage.length, 60))) {
    if (rng() < 0.65) {
      const sku = pickOne(rng, skus);
      const qty = randInt(rng, 10, 90);
      inv.push({ locationId: loc.id, skuId: sku.id, qty, batch: `B${randInt(rng, 1000, 9999)}` });
      loc.occupied = qty;
    }
  }
  return inv;
}

export function buildInboundOrders(
  count: number,
  skus: SKU[],
  linesPerOrder = 3,
  seed = 11,
): Order[] {
  const rng = makeRng(seed);
  return range(count).map((i) => {
    const lines: OrderLine[] = range(randInt(rng, 1, linesPerOrder)).map((j) => ({
      id: `L${i}-${j}`,
      skuId: pickOne(rng, skus).id,
      qty: randInt(rng, 5, 60),
      container: `CTN-${randInt(rng, 10000, 99999)}`,
    }));
    return {
      id: shortId('IB', i + 1),
      type: 'INBOUND',
      lines,
      createdAt: Date.now() - randInt(rng, 0, 3600_000),
    };
  });
}

export function buildOutboundOrders(
  count: number,
  skus: SKU[],
  linesPerOrder = 4,
  seed = 23,
): Order[] {
  const rng = makeRng(seed);
  return range(count).map((i) => {
    const lines: OrderLine[] = range(randInt(rng, 1, linesPerOrder)).map((j) => ({
      id: `OL${i}-${j}`,
      skuId: pickOne(rng, skus).id,
      qty: randInt(rng, 1, 10),
    }));
    return {
      id: shortId('OB', i + 1),
      type: 'OUTBOUND',
      lines,
      createdAt: Date.now() - randInt(rng, 0, 3600_000),
    };
  });
}

const SNAPSHOT_TEMPLATES: { name: string; desc: string; orders: number; seed: number }[] = [
  { name: '6·18 大促前夜', desc: '618 前一晚的入库高峰，200 单涌入', orders: 200, seed: 101 },
  { name: '常温区 5 日平稳', desc: '正常工作日，平均负荷', orders: 60, seed: 202 },
  { name: '冷链紧急补货', desc: '生鲜品类补货告急，需快速周转', orders: 80, seed: 303 },
  { name: '月末库存盘点', desc: '系统升级前的全量数据回放', orders: 150, seed: 404 },
  { name: '新品上架演练', desc: '20 个新品 SKU 首次入库', orders: 40, seed: 505 },
];

export function buildHistoricalSnapshots(
  skus: SKU[],
  locations: Location[],
): HistoricalSnapshot[] {
  return SNAPSHOT_TEMPLATES.map((t, i) => {
    const orders = buildInboundOrders(t.orders, skus, 3, t.seed);
    const inventory = buildInitialInventory(locations, skus, t.seed + 1);
    const baseMetrics: Metrics = {
      utilization: 40 + (i * 7) % 35,
      pickDistance: 800 + (i * 311) % 900,
      pickTime: 30 + (i * 11) % 60,
      anomalies: (i * 3) % 8,
      assignmentsCount: orders.reduce((a, o) => a + o.lines.length, 0),
      ordersCount: orders.length,
      pickOrdersCount: 0,
      apiCallsCount: 0,
      apiSuccessCount: 0,
    };
    const d = new Date();
    d.setDate(d.getDate() - (i + 1) * 5);
    return {
      id: `SNAP-${String(i + 1).padStart(3, '0')}`,
      name: t.name,
      date: d.toISOString().slice(0, 10),
      orders: t.orders,
      description: t.desc,
      baseMetrics,
      data: { orders, inventory },
    };
  });
}

// 生产配置（用于同步页对比）
export const PROD_CONFIG = {
  putaway: 'nearest' as const,
  pick: 's_shape' as const,
  replenishThreshold: 20,
  version: 'v2025.05.30',
};
