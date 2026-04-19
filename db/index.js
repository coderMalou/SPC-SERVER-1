/**
 * SQLite 连接与建表（轻量毕设版）
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const config = require('../config');
const dbPath = path.resolve(config.db.path);
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// 建表
db.exec(`
-- 用户（毕设简化：可继续用 mock，也可存库）
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'operator',
  created_at TEXT DEFAULT (datetime('now'))
);

-- 工单（不接 MES，手动维护）
CREATE TABLE IF NOT EXISTS work_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no VARCHAR UNIQUE NOT NULL,
  status INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  closed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_wo_order_no ON work_orders(order_no);
CREATE INDEX IF NOT EXISTS idx_wo_status ON work_orders(status);

-- 任务
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_order_id INTEGER NOT NULL,
  task_no TEXT UNIQUE NOT NULL,
  line_no INTEGER NOT NULL,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  spec TEXT,
  unit TEXT,
  process_route_name TEXT,
  process_name TEXT NOT NULL,
  quality_char TEXT NOT NULL,
  target_value REAL NOT NULL,
  usl REAL NOT NULL,
  lsl REAL NOT NULL,
  subgroup_size INTEGER NOT NULL DEFAULT 5,
  total_sample_size INTEGER NOT NULL DEFAULT 200,
  equipment_code TEXT,
  instrument_code TEXT,
  status INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  enabled_at TEXT,
  FOREIGN KEY (work_order_id) REFERENCES work_orders(id)
);
CREATE INDEX IF NOT EXISTS idx_tasks_wo ON tasks(work_order_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- 测量数据（按子组一条记录，样本存 JSON）
CREATE TABLE IF NOT EXISTS measurement_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  group_no VARCHAR,
  measure_time TEXT NOT NULL,
  sample_values TEXT NOT NULL,
  operator TEXT,
  remark TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  status INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  UNIQUE(task_id, group_no)
);
CREATE INDEX IF NOT EXISTS idx_mg_task ON measurement_groups(task_id);
`);

try { db.exec(`ALTER TABLE tasks ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;`); } catch (e) {}
try { db.exec(`ALTER TABLE tasks ADD COLUMN deleted_at TEXT;`); } catch (e) {}
try { db.exec(`ALTER TABLE measurement_groups ADD COLUMN status INTEGER NOT NULL DEFAULT 0;`); } catch (e) {}

function ensureSeedData() {
  const c = db.prepare('SELECT COUNT(*) c FROM work_orders').get().c;
  if (c > 0) return;
  const orderNo = 'WO20260420001';
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO work_orders (order_no, status) VALUES (?, 1)').run(orderNo);
    const wo = db.prepare('SELECT id FROM work_orders WHERE order_no = ?').get(orderNo);
    const workOrderId = wo.id;
    const tasks = [
      {
        lineNo: 1,
        taskNo: `${orderNo}-1-001`,
        productCode: 'BME-NEEDLE-001',
        productName: '一次性采血针',
        spec: '外径1.20±0.05',
        unit: 'mm',
        processRouteName: '成型-检验',
        processName: '注塑成型',
        qualityChar: '外径',
        targetValue: 1.2,
        usl: 1.25,
        lsl: 1.15
      },
      {
        lineNo: 2,
        taskNo: `${orderNo}-2-002`,
        productCode: 'BME-TUBE-002',
        productName: '采血管（抗凝）',
        spec: '容量3.0±0.2',
        unit: 'mL',
        processRouteName: '灌装-封口-检验',
        processName: '灌装封口',
        qualityChar: '容量',
        targetValue: 3.0,
        usl: 3.2,
        lsl: 2.8
      },
      {
        lineNo: 3,
        taskNo: `${orderNo}-3-003`,
        productCode: 'BME-REAG-003',
        productName: '生化检测试剂A',
        spec: '浓度100±5',
        unit: 'mg/L',
        processRouteName: '配制-混匀-检验',
        processName: '配制混匀',
        qualityChar: '浓度',
        targetValue: 100,
        usl: 105,
        lsl: 95
      }
    ];

    const stmt = db.prepare(`
      INSERT INTO tasks (
        work_order_id, task_no, line_no, product_code, product_name, spec, unit,
        process_route_name, process_name, quality_char, target_value, usl, lsl,
        subgroup_size, total_sample_size, equipment_code, instrument_code, status, enabled_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const t of tasks) {
      stmt.run(
        workOrderId,
        t.taskNo,
        t.lineNo,
        t.productCode,
        t.productName,
        t.spec,
        t.unit,
        t.processRouteName,
        t.processName,
        t.qualityChar,
        t.targetValue,
        t.usl,
        t.lsl,
        5,
        50,
        null,
        null,
        1,
        now
      );
    }
  });
  tx();
}

ensureSeedData();

module.exports = db;
