// === 核心类型定义 ===
export type Scope = 'inbound' | 'allocate' | 'putaway' | 'pick' | 'replenish';

export type Zone = 'INBOUND' | 'STORAGE' | 'PICK' | 'OUTBOUND';

export interface Warehouse {
  id: string;
  name: string;
  zoneCount: number;
}

export interface Location {
  id: string;
  warehouseId: string;
  zone: Zone;
  row: number;
  col: number;
  capacity: number;
  occupied: number;
}

export interface SKU {
  id: string;
  name: string;
  category: string;
  weight: number;
  volume: number;
  abcClass: 'A' | 'B' | 'C';
}

export interface Inventory {
  locationId: string;
  skuId: string;
  qty: number;
  batch: string;
  /** 上架时间戳（ms），用于 FIFO/批次策略 */
  putawayAt?: number;
  /** 锁定标记（库存单 lock 类型使用） */
  locked?: boolean;
}

export interface OrderLine {
  id: string;
  skuId: string;
  qty: number;
  container?: string;
  /** 批次号：双深库位要求同品同批 */
  batch?: string;
}

export interface Order {
  id: string;
  type: 'INBOUND' | 'OUTBOUND';
  lines: OrderLine[];
  createdAt: number;
  /** 客户编码（出库单用） */
  customer?: string;
  /** 优先级（出库单用） */
  priority?: '加急' | '常规' | '经济' | string;
  /** 设备 ID：入库单在哪个 dock 上申请 / 出库单在哪个 dock 上发货 */
  dockId?: string;
  /** 设备名（冗余字段，便于直接展示） */
  dockName?: string;
  /** 入库策略（来源 dock 的 inbound 事件配置） */
  putawayStrategy?: string;
  /** 拣选策略（来源 dock 的 outbound 事件配置） */
  pickStrategy?: string;
}

export interface Assignment {
  orderLineId: string;
  orderId: string;
  skuId: string;
  container: string;
  locationId: string;
  distance: number;
  /** 批次号：双深库位要求同品同批 */
  batch?: string;
  /** 申请时间：库存分配节点执行时的时间 */
  createdAt?: number;
  /** 上架时间：上架节点执行时的时间（仅入库） */
  putawayAt?: number;
  /** 拣选/下降时间：拣选节点执行时的时间（仅出库） */
  pickAt?: number;
  /**
   * 当前阶段：
   *  - pending  已申请分配，未上架/未拣选
   *  - occupied 入库已上架 / 出库已下架
   *  - picked   出库已拣选（库位已空）
   */
  phase?: 'pending' | 'occupied' | 'picked';
}

export interface ReplenishSuggestion {
  skuId: string;
  locationId: string;
  current: number;
  threshold: number;
  suggested: number;
}

export type TraceStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';
export interface TraceEvent {
  id: string;
  ts: number;
  step: string;
  nodeId: string;
  nodeName: string;
  status: TraceStatus;
  summary: string;
  payload?: Record<string, unknown>;
  durationMs?: number;
}

export interface Metrics {
  utilization: number;
  pickDistance: number;
  pickTime: number;
  anomalies: number;
  assignmentsCount: number;
  ordersCount: number;
  pickOrdersCount: number;
  apiCallsCount: number;
  apiSuccessCount: number;
}

// === 可配置场景（新）===

/** 节点类型：
 *  - simulate：使用内置策略/生成器模拟一个环节
 *  - api：调用外部接口（沙盒内默认 mock 响应）
 *  - transform：对上下文数据做映射（透传/重命名）
 */
export type NodeKind = 'simulate' | 'api' | 'transform';

export type SimulateSubKind =
  // ===== 入库流程 =====
  | 'inbound'           // 生成入库申请单
  | 'allocate'          // 上架分配（入货位）
  | 'putaway'           // 上架实际落地
  // ===== 出库流程 =====
  | 'outbound'          // 生成出库订单
  | 'outbound-allocate' // 出库分配（订单 → 库位映射）
  | 'cartonize'         // 组盘：按目的/容器/批次合并订单行 → 容器
  | 'picklist'          // 拣选单生成：合并多订单 → 一张拣选单
  | 'pick'              // 拣选路径生成 + 下架
  | 'down'              // 下架（实际从库位移除）
  | 'pack'              // 打包
  | 'ship'              // 发货/出库交接
  | 'agv-deliver'       // AGV 配送：托盘 → 月台
  // ===== 库存辅助 =====
  | 'replenish'         // 补货扫描
  | 'inventory'         // 初始库存生成
  | 'inventory-order'   // 库存单：盘点/调拨/损益/锁定
  | 'custom';           // 自定义脚本

export type PutawayStrategyId =
  | 'nearest'           // 最近库位
  | 'category'          // 按品类集中
  | 'capacity'          // 按容量分散
  | 'fifo'              // 先进先出
  | 'abc';              // ABC 分类

export type OutboundAllocateStrategyId =
  | 'nearest'           // 最近库位
  | 'fifo'              // 先进先出
  | 'lifo'              // 后进先出
  | 'category'          // 同品类集中
  | 'oldest-batch'      // 最早批次优先
  | 'multi-location';   // 多库位拆分

export type CartonizeStrategyId =
  | 'by-customer'       // 按客户分托盘
  | 'by-zone'           // 按区域分托盘
  | 'by-batch'          // 按批次分托盘
  | 'single'            // 单托盘
  | 'container';        // 按容器分托盘

export type PickListStrategyId =
  | 'one-per-order'     // 一单一拣选
  | 'batch-by-zone'     // 按区域合批
  | 'batch-by-customer' // 按客户合批
  | 'wave';             // 波次合批

export type DownStrategyId =
  | 'nearest'           // 最近库位
  | 'fifo'              // 先进先出
  | 'lifo'              // 后进先出
  | 'oldest-batch'      // 最早批次
  | 'category'          // 同品类集中
  | 'max-pick';         // 同库位最大拣选量

export type PickStrategyId = 's_shape' | 'return' | 'midpoint' | 'largest_gap';

export interface SimulateConfig {
  subKind: SimulateSubKind;
  putawayStrategy?: PutawayStrategyId;
  outboundAllocateStrategy?: OutboundAllocateStrategyId;
  cartonizeStrategy?: CartonizeStrategyId;
  pickListStrategy?: PickListStrategyId;
  downStrategy?: DownStrategyId;
  pickStrategy?: PickStrategyId;
  replenishThreshold?: number;
  count?: number;          // 数量（如入库单数 / 出库单数）
  /** 容器/托盘容量上限（组盘/拣选单拆分用） */
  containerCapacity?: number;
  customScript?: string;   // kind=custom 时执行的脚本片段
}

export interface ApiConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;                       // 支持 {{nodeId.field}} 模板
  headers: Record<string, string>;
  body: string;                      // JSON 字符串模板
  responseMapping: string;           // 简单点路径，如 "data.items" 或 "result"
  mockResponse: string;              // JSON 字符串，未提供真 URL 时使用
  timeoutMs: number;
  retry: number;                     // 失败重试次数
  /** 模板批量调用时的并发数（1-20），仅当本节点绑定了数据模板时生效 */
  batchConcurrency?: number;
}

export interface ScenarioNode {
  id: string;
  name: string;
  kind: NodeKind;
  enabled: boolean;
  dependsOn: string[];               // 依赖的节点 ID
  simulate?: SimulateConfig;
  api?: ApiConfig;
  /** 绑定的数据模板 ID（仅 simulate 节点有效）。为空时使用模拟器默认生成器 */
  templateId?: string;
  description?: string;
  /** 来源设备：例如入库节点 = 在哪些月台申请 / 拣选节点 = 从哪些库位取货 */
  sourceDeviceIds?: string[];
  /** 目标设备：例如分配节点 = 分到哪些库位 / 上架节点 = 经由哪些工位 */
  targetDeviceIds?: string[];
  /** 节点级业务覆盖：仅本节点用，不影响其他节点和舞台 */
  businessOverride?: {
    ordersPerRun?: number;
    putawayStrategy?: PutawayStrategy;
    pickStrategy?: PickStrategy;
  };
  // 画布位置（可选）
  position?: { x: number; y: number };
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  nodes: ScenarioNode[];
  templateId?: string;                // 关联的数据模板
  stage?: Stage;                     // 该场景自带的舞台（WMS 业务对象 + 事件配置）
  createdAt: number;
  updatedAt: number;
  builtin?: boolean;
}

// === 数据模板（新）===
export type FieldType = 'string' | 'int' | 'float' | 'enum' | 'date' | 'sku' | 'barcode' | 'bool';

export interface TemplateField {
  name: string;
  type: FieldType;
  required: boolean;
  // 生成规则
  min?: number;
  max?: number;
  prefix?: string;
  suffix?: string;
  enumValues?: string[];
  format?: string;        // 'YYYY-MM-DD' 等
  refTemplate?: string;   // 引用其他字段名作为值（用于 ID 关联）
}

export interface DataTemplate {
  id: string;
  name: string;
  description: string;
  fields: TemplateField[];
  rowCount: number;
  seed?: number;
  source: 'manual' | 'csv' | 'json';  // 来源
  /**
   * 自定义数据行（每行 = Record<字段名, 值>）
   * 设置后将替代随机生成器，用于演示/测试场景
   * 例：双深库位测试需要显式构造「同品同批」「同品不同批」组合
   */
  customRows?: Record<string, unknown>[];
  createdAt: number;
  updatedAt: number;
}

// === 运行时 ===
export interface RuntimeContext {
  // 跨节点共享上下文
  variables: Record<string, unknown>;
  // 节点输出
  nodeOutputs: Record<string, unknown>;
  // 模拟器产出的领域数据
  orders: Order[];
  pickOrders: Order[];
  inventory: Inventory[];
  assignments: Assignment[];
  picks: { orderId: string; path: Location[]; distance: number; duration: number; startedAt?: number; completedAt?: number; steps?: { locationId: string; pickAt: number; skuId: string; qty: number; batch?: string }[] }[];
  replenish: ReplenishSuggestion[];
  /** 出库分配结果（订单 → 库位） */
  outboundAllocations: OutboundAllocation[];
  /** 组盘单（容器） */
  cartonizations: Cartonization[];
  /** 拣选单 */
  pickLists: PickList[];
  /** 打包记录 */
  packs: PackRecord[];
  /** 发货记录 */
  shipments: ShipmentRecord[];
  /** 库存单（盘点/调拨/损益/锁定） */
  inventoryOrders: InventoryOrder[];
  /** AGV 配送记录 */
  agvDeliveries: AgvDelivery[];
}

/** 出库分配：出库订单行 → 库位 */
export interface OutboundAllocation {
  orderLineId: string;
  orderId: string;
  skuId: string;
  qty: number;              // 需要拣的数量
  locationId: string;       // 拣选库位
  batch?: string;
  /** 是否被多库位拆分 */
  splitIndex?: number;
  splitCount?: number;
  /** 分配时间 */
  createdAt?: number;
  /** 下架时间 */
  downAt?: number;
  strategy?: OutboundAllocateStrategyId;
  /** 关联的出库工位（拣选完成后托盘送到的工位） */
  stationId?: string;
  stationName?: string;
  /** 关联的容器/托盘号（组盘后产生） */
  containerNo?: string;
  /** 关联的目标月台（AGV 配送后产生） */
  dockId?: string;
  dockName?: string;
}

/** 组盘单：把多张出库订单行按规则合并成一个容器（托盘/箱） */
export interface Cartonization {
  id: string;
  strategy: CartonizeStrategyId;
  containerNo: string;          // 容器/托盘号
  sourceOrderIds: string[];     // 关联的出库单
  items: CartonizationItem[];   // 容器内的明细
  capacityUsed: number;         // 0~1
  createdAt: number;
  /** 关联的拣选/组盘工位 */
  stationId?: string;
  stationName?: string;
  /** 关联的目标月台（AGV 配送后产生） */
  dockId?: string;
  dockName?: string;
  /** AGV 编号 */
  agvId?: string;
  /** AGV 配送开始/到达时间 */
  agvStartedAt?: number;
  agvArrivedAt?: number;
}

export interface CartonizationItem {
  skuId: string;
  qty: number;
  batch?: string;
  sourceOrderId: string;
  sourceLineId: string;
  locationId?: string;          // 拣选库位（出库分配后才有）
  pickAt?: number;              // 拣选时间
}

/** 拣选单：把多张订单合并成一张拣选任务（一次拣完多个订单） */
export interface PickList {
  id: string;
  strategy: PickListStrategyId;
  pickerId?: string;            // 拣选员/工位
  sourceOrderIds: string[];     // 关联的出库单
  cartonIds: string[];          // 关联的容器
  lines: PickListLine[];        // 拣选明细
  totalDistance: number;        // 行走总距离
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface PickListLine {
  locationId: string;
  skuId: string;
  qty: number;
  batch?: string;
  sourceOrderId: string;
  containerNo?: string;
  pickAt?: number;
}

/** 打包记录 */
export interface PackRecord {
  id: string;
  cartonId: string;
  packerId?: string;
  weight?: number;
  startedAt?: number;
  completedAt?: number;
  status: 'pending' | 'packing' | 'packed' | 'shipped';
}

/** 发货记录 */
export interface ShipmentRecord {
  id: string;
  cartonIds: string[];
  carrier?: string;
  destination?: string;
  shippedAt?: number;
  status: 'pending' | 'shipped';
}

/** AGV 配送记录：托盘 → 月台 */
export interface AgvDelivery {
  id: string;
  cartonId: string;
  sourceStationId?: string;  // 起点工位（打包工位）
  dockId: string;            // 目标月台
  dockName: string;
  distance: number;          // AGV 行驶距离（米）
  duration: number;          // 配送耗时（ms）
  status: 'queued' | 'moving' | 'arrived';
  queuedAt: number;
  arrivedAt?: number;
  agvId?: string;            // 分配的 AGV 编号
}

/** 库存单类型 */
export type InventoryOrderType = 'cycle-count' | 'transfer' | 'adjustment' | 'lock';

/** 库存单：盘点/调拨/损益/锁定 */
export interface InventoryOrder {
  id: string;                       // 单号 IN-xxxx
  type: InventoryOrderType;         // 单据类型
  skuId: string;
  qty: number;                      // 数量（损益可为负）
  batch?: string;
  sourceLocationId?: string;        // 源库位（调拨/盘点）
  targetLocationId?: string;        // 目标库位（调拨/锁定）
  reason?: string;                  // 原因说明
  status: 'pending' | 'applied' | 'failed';
  createdAt: number;
  appliedAt?: number;
  /** 盘点实数与账面差 */
  countedQty?: number;
  variance?: number;
}

export interface SimulationRequest {
  scenario: Scenario;
  template?: DataTemplate;
  seed: number;
}

export interface SimulationResult {
  id: string;
  trace: TraceEvent[];
  orders: Order[];
  pickOrders: Order[];
  inventory: Inventory[];
  locations?: Location[];
  assignments: Assignment[];
  picks: { orderId: string; path: Location[]; distance: number; duration: number; startedAt?: number; completedAt?: number; steps?: { locationId: string; pickAt: number; skuId: string; qty: number; batch?: string }[] }[];
  replenish: ReplenishSuggestion[];
  equipment?: Equipment[];
  metrics: Metrics;
  config: { scope: Scope[]; scenarioId: string };
  timestamp: number;
  duration: number;
  /** 出库分配结果 */
  outboundAllocations?: OutboundAllocation[];
  /** 组盘单（容器） */
  cartonizations?: Cartonization[];
  /** 拣选单 */
  pickLists?: PickList[];
  /** 打包记录 */
  packs?: PackRecord[];
  /** 发货记录 */
  shipments?: ShipmentRecord[];
  /** 库存单（盘点/调拨/损益/锁定） */
  inventoryOrders?: InventoryOrder[];
  /** AGV 配送记录 */
  agvDeliveries?: AgvDelivery[];
  /** 仿真时各舞台设备的运行结果（按设备 ID 索引）—— 任务/指令/异常等 */
  stageDeviceResults?: Record<string, StageDeviceResult>;
  /** 仿真时舞台的快照（设备最终状态），用于 Dashboard 还原 */
  stageSnapshot?: Stage;
}

/** 单个设备在本轮仿真中的运行结果 */
export interface StageDeviceResult {
  deviceId: string;
  deviceName: string;
  deviceKind: StageDeviceKind;
  /** 任务号（最近一个分配到该设备的任务） */
  taskNumber?: string;
  /** 指令号 */
  commandNumber?: string;
  /** 当前指令描述 */
  currentCommand?: string;
  /** 上一个指令描述 */
  lastCommand?: string;
  /** 关联条码/容器 */
  barcode?: string;
  /** 异常描述（仿真过程中遇到） */
  anomaly?: string;
  /** 涉及的入库/出库单数（dock 设备用） */
  ordersHandled?: number;
  /** 涉及的行数（dock 设备用） */
  linesHandled?: number;
  /** 分配的库位（shelf 设备用） */
  assignedLocationIds?: string[];
  /** 拣货数（station 设备用） */
  picksHandled?: number;
  /** 设备最终状态（normal/idle/running/...） */
  status: DeviceStatus;
  /** API 调用结果（节点绑定了本设备时，仿真调用 API 落在这里） */
  apiCall?: {
    ok: boolean;
    method: string;
    url: string;
    httpStatus: number;
    durationMs: number;
    /** 出错信息（HTTP 非 2xx / 网络异常 / 模拟响应 fail） */
    errorMessage?: string;
    /** 响应摘要（截断） */
    responseSummary?: string;
    /** 请求摘要（截断） */
    requestSummary?: string;
    /** 批量调用时：总数 / 成功 / 失败 */
    batch?: { total: number; ok: number; fail: number };
    ts: number;
    nodeId: string;
    nodeName: string;
  };
  /** 仿真后分配到该设备的入库/出库单 + 行摘要（用于舞台单元格填充） */
  assignmentsSummary?: Array<{
    orderId: string;
    sku: string;
    qty: number;
    container?: string;
    locationId: string;
  }>;
}

export interface HistoricalSnapshot {
  id: string;
  name: string;
  date: string;
  orders: number;
  description: string;
  baseMetrics: Metrics;
  data: { orders: Order[]; inventory: Inventory[] };
}

// === 可配置看板（Stage）===
export type WidgetKind = 'kpi' | 'table' | 'chart' | 'map' | 'equipment' | 'deviceResult';
export type DataSourceId =
  | 'orders'         // 入库单
  | 'pickOrders'     // 出库单
  | 'inventory'      // 库存
  | 'assignments'    // 分配行
  | 'picks'          // 拣选路径
  | 'replenish'      // 补货建议
  | 'trace'          // 节点 trace
  | 'metrics'        // 汇总指标
  | 'stage'          // 舞台设备全集
  | 'stageDevices'   // 同 stage，但按 kind 过滤
  | 'deviceResults'; // 仿真时每个设备的运行结果（任务/指令/异常）

export type AggFn = 'count' | 'sum' | 'avg' | 'unique';
export type ChartType = 'bar' | 'pie';

export interface DataBinding {
  source: DataSourceId;
  /** 数值聚合用的字段名（sum/avg 时必填） */
  field?: string;
  /** 聚合方式（KPI 用） */
  agg?: AggFn;
  /** 图表分组字段（chart 用） */
  groupBy?: string;
  /** 库位地图：按哪个字段的值给库位上色（如 'zone' 'abcClass' 'qty'） */
  mapField?: string;
  /** 库位地图：地图标题旁的小字描述 */
  mapMode?: 'zone' | 'abc' | 'qty' | 'status';
  /** 设备清单：列出的设备类型 */
  equipmentKind?: 'conveyor' | 'agv' | 'all';
  /** stageDevices 专用：按 kind 过滤 */
  deviceKindFilter?: StageDeviceKind;
  /** deviceResults 专用：按 kind 过滤 */
  resultDeviceKind?: StageDeviceKind;
  /** deviceResults 专用：按状态过滤 */
  resultStatusFilter?: 'all' | 'running' | 'idle' | 'with-task' | 'with-anomaly';
}

export interface Widget {
  id: string;
  kind: WidgetKind;
  title: string;
  /** 网格中的预设尺寸（与布局策略配合） */
  size: { w: 1 | 2 | 3; h: 1 | 2 | 3 };
  binding: DataBinding;
  /** chart 专用 */
  chartType?: ChartType;
}

export interface Dashboard {
  id: string;
  name: string;
  description?: string;
  widgets: Widget[];
  builtin?: boolean;
  createdAt: number;
  updatedAt: number;
}

// === WCS 设备（看板设备块的占位数据） ===
export interface Equipment {
  id: string;
  kind: 'conveyor' | 'agv' | 'station';
  name: string;
  status: 'idle' | 'running' | 'blocked' | 'offline';
  /** 当前位置（AGV 用）/ 段位（conveyor 用） */
  position?: { row: number; col: number };
  currentTask?: string;
}

// === WMS 业务对象（立库专用设备） ===
export type StageDeviceKind =
  | 'dock'       // 月台
  | 'station'    // 工位
  | 'shelfRow'   // 货架排（一排 = N 个库位，在设备库里可拖）
  | 'shelf'      // 立体库货架（一个货位 = 一个库位）
  | 'zone'       // 区域
  | 'agv'        // AGV
  | 'conveyor'   // 输送线
  | 'chute'      // 滑槽
  | 'aisle'      // 巷道
  | 'stack'      // 堆垛机
  | 'lift'       // 提升机
  | 'route'      // 路线（连接两个设备，用于展示路径/高亮）
  | 'pallet'     // 托盘
  | 'tote';      // 料箱
export type DeviceStatus = 'normal' | 'idle' | 'running' | 'blocked' | 'offline' | 'fault';

// === 设备业务事件配置 ===
export type PutawayStrategy = 'fifo' | 'abc' | 'near-dock' | 'random';
export type PickStrategy = 'single' | 'batch' | 'zone' | 'wave';
export type StationRole = 'putaway' | 'pick' | 'pack' | 'replenish' | 'idle';
export type AbcClass = 'A' | 'B' | 'C';

export interface InboundEventConfig {
  enabled: boolean;
  /** 每次仿真跑生成几个入库单 */
  ordersPerRun: number;
  /** SKU 池（空 = 用全局 SKU 库随机） */
  skuPool: string[];
  /** 每个单几行 */
  avgLinesPerOrder: number;
  /** 每行几件 */
  avgQtyPerLine: number;
  /** 上架策略 */
  putawayStrategy: PutawayStrategy;
}

export interface OutboundEventConfig {
  enabled: boolean;
  ordersPerRun: number;
  skuPool: string[];
  avgLinesPerOrder: number;
  avgQtyPerLine: number;
  pickStrategy: PickStrategy;
}

export interface ReplenishEventConfig {
  enabled: boolean;
  /** 触发补货扫描的频率（0-1，每秒） */
  rate: number;
}

export interface DeviceBusiness {
  /** 月台：入库事件（卡车到此月台卸货 → 生成入库申请 → WMS 分配库位） */
  inboundEvent?: InboundEventConfig;
  /** 月台：出库事件（卡车到此月台装货 → 生成出库申请 → WMS 拣选路径） */
  outboundEvent?: OutboundEventConfig;
  /** 工位：拣选/打包/补货/上架 角色（决定它处理什么） */
  stationRole?: StationRole;
  /** 库位：容量 + 库区 + ABC 分类 */
  capacity?: { max: number; abcClass: AbcClass; zone: string };
  /** 补货：触发频率 */
  replenishEvent?: ReplenishEventConfig;
  /** 备注（自由文本） */
  remark?: string;
}

/** 设备字段：键名 + 类型 + 默认值 + 描述 + 是否映射到 API */
export interface DeviceFieldDef {
  key: string;             // 字段名，作为存储 key
  label: string;           // 中文显示名
  type: 'text' | 'number' | 'boolean' | 'enum' | 'json';
  defaultValue?: string | number | boolean | null;
  options?: string[];      // enum 类型的可选值
  /** 该字段在 API 节点中默认映射到的变量名（用于自动拼装请求体） */
  apiField?: string;
  desc?: string;
}

export interface StageDevice {
  id: string;
  kind: StageDeviceKind;
  name: string;
  /** 0-100 百分比定位 */
  position: { x: number; y: number };
  /** 货架/输送线占用面积，0-100 百分比 */
  size: { w: number; h: number };
  /** 货架专用：所属排号 (1-N) */
  shelfRow?: number;
  /** 货架专用：第几个格 (1-N) */
  shelfCell?: number;
  /** shelfRow 专用：该排的库位数（默认 14） */
  cellCount?: number;
  /** shelfRow 专用：ABC 分类（用于上架策略） */
  abcClass?: 'A' | 'B' | 'C';
  /** AGV 专用：朝向 */
  direction?: 'up' | 'down' | 'left' | 'right';
  /** 旋转角度（度数，0-360） */
  rotation?: number;
  status: DeviceStatus;
  /** 业务事件配置（按 kind 适用） */
  business?: DeviceBusiness;
  /** 字段值（key -> value），键名属于 DEVICE_FIELDS_SCHEMA 中该 kind 的字段集 */
  fields?: Record<string, string | number | boolean | null>;
  /** route 专用：起点设备 ID */
  routeFrom?: string;
  /** route 专用：终点设备 ID */
  routeTo?: string;
  /** route 专用：路线流类型（用于仿真后高亮过滤） */
  routeType?: 'inbound' | 'outbound' | 'both';
  /** route 专用：是否处于"待选端点"状态（拖到画布后等用户点两设备） */
  pendingConnection?: boolean;
  /** 详情面板字段（仿真后的实际值） */
  taskNumber?: string;
  commandNumber?: string;
  currentCommand?: string;
  lastCommand?: string;
  barcode?: string;
  anomaly?: string;
}

export interface StageShelfRow {
  row: number;
  cellCount: number;
  /** 行的纵向位置 (0-100) */
  y: number;
  label: string;
}

/** 每个设备类型的默认字段 schema（用户在详情面板里可改值） */
export const DEVICE_FIELDS_SCHEMA: Record<StageDeviceKind, DeviceFieldDef[]> = {
  dock: [
    { key: 'dockNo',      label: '月台号',     type: 'text',   apiField: 'dockNo',      desc: 'WMS 中的月台编号' },
    { key: 'dockName',    label: '月台名',     type: 'text',   apiField: 'dockName',    desc: '显示名' },
    { key: 'dockType',    label: '月台类型',   type: 'enum',   options: ['收货', '发货', '中转'], defaultValue: '收货', apiField: 'dockType' },
    { key: 'maxOrders',   label: '最大同时任务数', type: 'number', defaultValue: 5,    apiField: 'maxOrders' },
    { key: 'isOpen',      label: '是否启用',   type: 'boolean', defaultValue: true,  apiField: 'enabled' },
    { key: 'vendor',      label: '供应商',     type: 'text',   apiField: 'supplier' },
  ],
  station: [
    { key: 'stationCode', label: '工位编码',   type: 'text',   apiField: 'stationCode' },
    { key: 'stationName', label: '工位名',     type: 'text',   apiField: 'stationName' },
    { key: 'role',        label: '工位角色',   type: 'enum',   options: ['inbound', 'outbound', 'transfer', 'replenish'], defaultValue: 'inbound', apiField: 'role' },
    { key: 'throughput',  label: '吞吐(件/小时)', type: 'number', defaultValue: 60, apiField: 'throughput' },
    { key: 'enabled',     label: '是否启用',   type: 'boolean', defaultValue: true, apiField: 'enabled' },
  ],
  shelfRow: [
    { key: 'rowLabel',   label: '排标签',     type: 'text',   apiField: 'rowLabel' },
    { key: 'cellCount',  label: '库位数',     type: 'number', defaultValue: 14,   apiField: 'cellCount' },
    { key: 'abcClass',   label: 'ABC 分类',   type: 'enum',   options: ['A', 'B', 'C'], defaultValue: 'B', apiField: 'abcClass' },
    { key: 'level',      label: '层数',       type: 'number', defaultValue: 1,    apiField: 'level' },
    { key: 'mixedSku',   label: '允许混 SKU', type: 'boolean', defaultValue: false, apiField: 'mixedSku' },
  ],
  shelf: [
    { key: 'locationId',  label: '库位 ID',    type: 'text',   apiField: 'locationId' },
    { key: 'level',       label: '层数',       type: 'number', defaultValue: 1,    apiField: 'level' },
    { key: 'depth',       label: '深(mm)',     type: 'number', defaultValue: 1200, apiField: 'depth' },
    { key: 'width',       label: '宽(mm)',     type: 'number', defaultValue: 1200, apiField: 'width' },
    { key: 'height',      label: '高(mm)',     type: 'number', defaultValue: 1800, apiField: 'height' },
    { key: 'maxWeight',   label: '承重(kg)',   type: 'number', defaultValue: 1000, apiField: 'maxWeight' },
    { key: 'abcClass',    label: 'ABC 分类',   type: 'enum',   options: ['A', 'B', 'C'], defaultValue: 'B', apiField: 'abcClass' },
    { key: 'mixedSku',    label: '允许混 SKU', type: 'boolean', defaultValue: false, apiField: 'mixedSku' },
  ],
  zone: [
    { key: 'zoneCode',    label: '区域编码',   type: 'text',   apiField: 'zoneCode' },
    { key: 'zoneName',    label: '区域名',     type: 'text',   apiField: 'zoneName' },
    { key: 'tempRange',   label: '温区',       type: 'enum',   options: ['常温', '冷藏', '冷冻'], defaultValue: '常温', apiField: 'tempRange' },
    { key: 'capacity',    label: '容量(库位)', type: 'number', defaultValue: 100,  apiField: 'capacity' },
  ],
  agv: [
    { key: 'agvId',       label: 'AGV 号',     type: 'text',   apiField: 'agvId' },
    { key: 'battery',     label: '电量(%)',    type: 'number', defaultValue: 100,  apiField: 'battery' },
    { key: 'loadWeight',  label: '载重(kg)',   type: 'number', defaultValue: 0,    apiField: 'loadWeight' },
    { key: 'status',      label: '状态',       type: 'enum',   options: ['idle', 'running', 'charging', 'fault'], defaultValue: 'idle', apiField: 'status' },
  ],
  conveyor: [
    { key: 'lineNo',      label: '线体号',     type: 'text',   apiField: 'lineNo' },
    { key: 'speed',       label: '速度(m/min)', type: 'number', defaultValue: 60,  apiField: 'speed' },
    { key: 'direction',   label: '方向',       type: 'enum',   options: ['left-to-right', 'right-to-left', 'bidirectional'], defaultValue: 'left-to-right', apiField: 'direction' },
    { key: 'enabled',     label: '是否启用',   type: 'boolean', defaultValue: true, apiField: 'enabled' },
  ],
  chute: [
    { key: 'chuteNo',     label: '滑槽号',     type: 'text',   apiField: 'chuteNo' },
    { key: 'targetZone',  label: '目的区域',   type: 'text',   apiField: 'targetZone' },
    { key: 'enabled',     label: '是否启用',   type: 'boolean', defaultValue: true, apiField: 'enabled' },
  ],
  aisle: [
    { key: 'aisleNo',     label: '巷道号',     type: 'text',   apiField: 'aisleNo' },
    { key: 'length',      label: '长度(m)',    type: 'number', defaultValue: 30,   apiField: 'length' },
    { key: 'stackerId',   label: '堆垛机 ID',  type: 'text',   apiField: 'stackerId' },
  ],
  stack: [
    { key: 'stackerId',   label: '堆垛机号',   type: 'text',   apiField: 'stackerId' },
    { key: 'aisleNo',     label: '所在巷道',   type: 'text',   apiField: 'aisleNo' },
    { key: 'curLevel',    label: '当前层',     type: 'number', defaultValue: 1,    apiField: 'curLevel' },
    { key: 'curCol',      label: '当前列',     type: 'number', defaultValue: 1,    apiField: 'curCol' },
    { key: 'status',      label: '状态',       type: 'enum',   options: ['idle', 'running', 'fault', 'offline'], defaultValue: 'idle', apiField: 'status' },
  ],
  lift: [
    { key: 'liftId',      label: '提升机号',   type: 'text',   apiField: 'liftId' },
    { key: 'curLevel',    label: '当前层',     type: 'number', defaultValue: 1,    apiField: 'curLevel' },
    { key: 'maxLevel',    label: '最大层',     type: 'number', defaultValue: 5,    apiField: 'maxLevel' },
    { key: 'status',      label: '状态',       type: 'enum',   options: ['idle', 'running', 'fault', 'offline'], defaultValue: 'idle', apiField: 'status' },
  ],
  route: [
    { key: 'routeType',   label: '路线类型',   type: 'enum',   options: ['inbound', 'outbound', 'both'], defaultValue: 'both', apiField: 'routeType', desc: 'inbound=入库路径 / outbound=出库路径 / both=通用' },
    { key: 'note',        label: '备注',       type: 'text',   apiField: 'note' },
  ],
  pallet: [
    { key: 'palletNo',    label: '托盘号',     type: 'text',   apiField: 'palletNo' },
    { key: 'material',    label: '材质',       type: 'enum',   options: ['plastic', 'wood', 'steel'], defaultValue: 'plastic', apiField: 'material' },
    { key: 'maxLoad',     label: '最大载重(kg)', type: 'number', defaultValue: 1000, apiField: 'maxLoad' },
  ],
  tote: [
    { key: 'toteNo',      label: '料箱号',     type: 'text',   apiField: 'toteNo' },
    { key: 'volume',      label: '容积(L)',    type: 'number', defaultValue: 60,   apiField: 'volume' },
    { key: 'sku',         label: '当前 SKU',   type: 'text',   apiField: 'sku' },
  ],
};

/** 根据 schema 生成初始字段值（填默认值） */
export function buildDefaultFields(kind: StageDeviceKind): Record<string, string | number | boolean | null> {
  const defs = DEVICE_FIELDS_SCHEMA[kind] ?? [];
  const out: Record<string, string | number | boolean | null> = {};
  for (const d of defs) {
    out[d.key] = d.defaultValue ?? null;
  }
  return out;
}

/** 将设备的 fields 拍平成「{apiField: value}」用于 API 节点拼装请求体 */
export function deviceFieldsToApiMap(device: StageDevice): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  if (!device.fields) return out;
  const defs = DEVICE_FIELDS_SCHEMA[device.kind] ?? [];
  for (const d of defs) {
    if (d.apiField && device.fields[d.key] != null) {
      out[d.apiField] = device.fields[d.key];
    }
  }
  return out;
}

export interface Stage {
  id: string;
  name: string;
  description?: string;
  shelves: StageShelfRow[];
  devices: StageDevice[];
  /**
   * 双深库位约束：shelfRow -> 配对的 shelfRow
   * 例：{ 1: 2, 2: 1, 3: 4, 4: 3, ... }
   * 库存分配时：同对的两个库位必须同品同批（或同时为空）
   */
  doubleDeepPairs?: Record<number, number>;
  createdAt: number;
  updatedAt: number;
}