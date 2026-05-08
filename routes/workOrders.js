const express = require('express');//生产工单的增删改查
const router = express.Router();
const db = require('../db');
const { ok, fail } = require('../utils/response');
const { auth } = require('../middleware/auth');

router.use(auth);

// 工单列表（启用在前、已关闭在后）
router.get('/', (req, res) => {
  try {
    const list = db.prepare(`
      SELECT id, order_no AS orderNo, status, created_at AS createdAt, closed_at AS closedAt
      FROM work_orders ORDER BY status DESC, closed_at ASC, id DESC
    `).all();
    return ok(res, list);
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

// 新增工单
router.post('/', (req, res) => {
  try {
    const { orderNo } = req.body || {};
    if (!orderNo || !String(orderNo).trim()) return fail(res, 400, '工单号不能为空');
    const order_no = String(orderNo).trim();
    db.prepare(`
      INSERT INTO work_orders (order_no, status) VALUES (?, 1)
    `).run(order_no);
    const row = db.prepare('SELECT id, order_no AS orderNo, status, created_at AS createdAt FROM work_orders WHERE order_no = ?').get(order_no);
    return ok(res, row, '创建成功');
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) return fail(res, 400, '工单号已存在');
    return fail(res, 500, e.message);
  }
});

// 关闭工单
router.put('/:id/close', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    db.prepare('UPDATE work_orders SET status = 0, closed_at = ? WHERE id = ?').run(now, id);
    if (db.prepare('SELECT changes()').get()['changes()'] === 0) return fail(res, 404, '工单不存在');
    db.prepare('UPDATE tasks SET status = 0 WHERE work_order_id = ?').run(id);
    return ok(res, null, '已关闭');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

// 启用工单
router.put('/:id/enable', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    db.prepare('UPDATE work_orders SET status = 1, closed_at = NULL WHERE id = ?').run(id);
    if (db.prepare('SELECT changes()').get()['changes()'] === 0) return fail(res, 404, '工单不存在');
    return ok(res, null, '已启用');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

// 工单树（包含任务列表）
router.get('/tree', (req, res) => {
  try {
    const workOrders = db.prepare(`
      SELECT id, order_no AS orderNo FROM work_orders WHERE status = 1 ORDER BY id DESC
    `).all();

    const tasks = db.prepare(`
      SELECT id, work_order_id AS workOrderId, task_no AS taskNo, process_name AS processName, quality_char AS qualityChar
      FROM tasks WHERE (deleted IS NULL OR deleted = 0)
    `).all();

    const result = workOrders.map(wo => ({
      id: wo.id,
      orderNo: wo.orderNo,
      children: tasks
        .filter(t => t.workOrderId === wo.id)
        .map(t => ({
          id: t.id,
          taskNo: t.taskNo,
          processName: t.processName,
          qualityChar: t.qualityChar
        }))
    }));

    return ok(res, result);
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

module.exports = router;
