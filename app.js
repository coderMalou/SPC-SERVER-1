/**
 * SPC 统计过程控制系统 - 轻量 Node 后端
 */
const express = require('express');
const config = require('./config');
const db = require('./db');
const { ok, fail } = require('./utils/response');
const { auth } = require('./middleware/auth');

let app;
try {
  // 初始化数据库（建表）
  app = express();
  app.use(express.json());

  const authRouter = require('./routes/auth');
  app.use('/api/auth', authRouter);
  app.use('/', authRouter);

  app.post('/api/admin/reset-demo', auth, (req, res) => {
    try {
      if (req.user?.role !== 'admin') return fail(res, 403, '无权限');
      const orderNo = 'WO20260420001';
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const tx = db.transaction(() => {
        db.prepare('DELETE FROM measurement_groups').run();
        db.prepare('DELETE FROM tasks').run();
        db.prepare('DELETE FROM work_orders').run();
        try { db.prepare(`DELETE FROM sqlite_sequence WHERE name IN ('measurement_groups','tasks','work_orders')`).run(); } catch (e) {}
        db.prepare('INSERT INTO work_orders (order_no, status) VALUES (?, 1)').run(orderNo);
        const workOrderId = db.prepare('SELECT id FROM work_orders WHERE order_no = ?').get(orderNo).id;
        const tasks = [
          { lineNo: 1, taskNo: `${orderNo}-1-001`, productCode: 'BME-NEEDLE-001', productName: '一次性采血针', spec: '外径1.20±0.05', unit: 'mm', processRouteName: '成型-检验', processName: '注塑成型', qualityChar: '外径', targetValue: 1.2, usl: 1.25, lsl: 1.15 },
          { lineNo: 2, taskNo: `${orderNo}-2-002`, productCode: 'BME-TUBE-002', productName: '采血管（抗凝）', spec: '容量3.0±0.2', unit: 'mL', processRouteName: '灌装-封口-检验', processName: '灌装封口', qualityChar: '容量', targetValue: 3.0, usl: 3.2, lsl: 2.8 },
          { lineNo: 3, taskNo: `${orderNo}-3-003`, productCode: 'BME-REAG-003', productName: '生化检测试剂A', spec: '浓度100±5', unit: 'mg/L', processRouteName: '配制-混匀-检验', processName: '配制混匀', qualityChar: '浓度', targetValue: 100, usl: 105, lsl: 95 }
        ];
        const stmt = db.prepare(`
          INSERT INTO tasks (
            work_order_id, task_no, line_no, product_code, product_name, spec, unit,
            process_route_name, process_name, quality_char, target_value, usl, lsl,
            subgroup_size, total_sample_size, equipment_code, instrument_code, status, enabled_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const t of tasks) {
          stmt.run(workOrderId, t.taskNo, t.lineNo, t.productCode, t.productName, t.spec, t.unit, t.processRouteName, t.processName, t.qualityChar, t.targetValue, t.usl, t.lsl, 5, 50, null, null, 1, now);
        }
        return {
          workOrder: db.prepare('SELECT id, order_no AS orderNo, status, created_at AS createdAt FROM work_orders').get(),
          tasks: db.prepare('SELECT id, task_no AS taskNo, line_no AS lineNo, product_name AS productName, status FROM tasks ORDER BY id').all()
        };
      });
      const result = tx();
      return ok(res, result, '已重置并初始化演示数据');
    } catch (e) {
      return fail(res, 500, e.message);
    }
  });

  app.use('/api/work-orders', require('./routes/workOrders'));
  app.use('/api/tasks', require('./routes/tasks'));
  app.use('/api/measurement', require('./routes/measurement'));
  app.use('/api/control-chart', require('./routes/controlChart'));
  app.use('/api/capability', require('./routes/capability'));

  app.get('/health', (req, res) => {
    res.json({ ok: true, message: 'SPC 后端运行中' });
  });

  const server = app.listen(config.port, () => {
    console.log(`SPC 后端已启动，端口：${config.port}`);
    console.log('登录：POST /api/auth/login 或 POST /login，账号 spc_admin，密码 123456');
    console.log('接口前缀：/api/work-orders, /api/tasks, /api/measurement, /api/control-chart, /api/capability');
    console.log('--- 服务会一直运行，按 Ctrl+C 可停止 ---');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`端口 ${config.port} 已被占用，请换端口或关闭占用该端口的程序。`);
    } else {
      console.error('启动失败:', err.message);
    }
    process.exit(1);
  });
} catch (err) {
  console.error('启动失败:', err.message);
  process.exit(1);
}
