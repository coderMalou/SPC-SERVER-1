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

    function generateNormalSamples(target, lsl, usl, count) {
      const samples = [];
      const range = usl - lsl;
      const normalRange = range * 0.4;
      for (let i = 0; i < count; i++) {
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        let value = target + z * (normalRange / 3);
        value = Math.max(lsl - range * 0.1, Math.min(usl + range * 0.1, value));
        samples.push(parseFloat(value.toFixed(4)));
      }
      return samples;
    }

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

      // 为每个任务生成测量数据
      const taskRows = db.prepare('SELECT id, target_value, usl, lsl FROM tasks WHERE work_order_id = ?').all(workOrderId);
      const insertGroup = db.prepare(`
        INSERT INTO measurement_groups (task_id, group_no, measure_time, sample_values, operator, remark, enabled, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const task of taskRows) {
        const baseTime = new Date('2026-04-20T08:00:00');
        for (let g = 0; g < 25; g++) {
          const groupNo = g + 1;
          const measureTime = new Date(baseTime.getTime() + g * 30 * 60 * 1000);
          const samples = generateNormalSamples(task.target_value, task.lsl, task.usl, 5);
          insertGroup.run(task.id, groupNo, measureTime.toISOString().slice(0, 19).replace('T', ' '), JSON.stringify(samples), '操作员A', g === 12 ? '换料调整' : '', 1, 0);
        }
      }

      return {
        workOrder: db.prepare('SELECT id, order_no AS orderNo, status, created_at AS createdAt FROM work_orders').get(),
        tasks: db.prepare('SELECT id, task_no AS taskNo, line_no AS lineNo, product_name AS productName, status FROM tasks ORDER BY id').all()
      };
    });
    const result = tx();
    return ok(res, result, '已重置并初始化演示数据（含测量数据）');
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
    console.log('登录：POST /api/auth/login 或 POST /login，账号 admin，密码 123456');
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
