const express = require('express');
const router = express.Router();
const db = require('../db');
const { ok, fail } = require('../utils/response');
const { auth } = require('../middleware/auth');

router.use(auth);

// 任务列表，可选 workOrderId 筛选
router.get('/', (req, res) => {
  try {
    const { workOrderId, status } = req.query;
    let sql = `
      SELECT t.id, t.work_order_id AS workOrderId, w.order_no AS orderNo,
        t.task_no AS taskNo, t.line_no AS lineNo, t.product_code AS productCode,
        t.product_name AS productName, t.spec, t.unit, t.process_route_name AS processRouteName,
        t.process_name AS processName, t.process_sequence AS processSequence,
        t.quality_char AS qualityChar, t.target_value AS targetValue,
        t.usl, t.lsl, t.subgroup_size AS subgroupSize, t.total_sample_size AS totalSampleSize,
        t.equipment_code AS equipmentCode, t.instrument_code AS instrumentCode,
        t.status, t.created_at AS createdAt, t.enabled_at AS enabledAt
      FROM tasks t
      LEFT JOIN work_orders w ON t.work_order_id = w.id WHERE 1=1 AND (t.deleted IS NULL OR t.deleted = 0)
    `;
    const params = [];
    if (workOrderId) { sql += ' AND t.work_order_id = ?'; params.push(workOrderId); }
    if (status !== undefined && status !== '') { sql += ' AND t.status = ?'; params.push(Number(status)); }
    sql += ' ORDER BY t.id DESC';
    const list = db.prepare(sql).all(...params);
    return ok(res, list);
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

// 单条任务详情
router.get('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const row = db.prepare(`
      SELECT t.*, w.order_no AS orderNo
      FROM tasks t LEFT JOIN work_orders w ON t.work_order_id = w.id
      WHERE t.id = ? AND (t.deleted IS NULL OR t.deleted = 0)
    `).get(id);
    if (!row) return fail(res, 404, '任务不存在');
    const out = {
      id: row.id, workOrderId: row.work_order_id, orderNo: row.orderNo,
      taskNo: row.task_no, lineNo: row.line_no, productCode: row.product_code,
      productName: row.product_name, spec: row.spec, unit: row.unit,
      processRouteName: row.process_route_name, processName: row.process_name,
      processSequence: row.process_sequence,
      qualityChar: row.quality_char, targetValue: row.target_value,
      usl: row.usl, lsl: row.lsl, subgroupSize: row.subgroup_size,
      totalSampleSize: row.total_sample_size, equipmentCode: row.equipment_code,
      instrumentCode: row.instrument_code, status: row.status,
      createdAt: row.created_at, enabledAt: row.enabled_at
    };
    return ok(res, out);
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

// 新增任务
router.post('/', (req, res) => {
  try {
    const b = req.body || {};
    const workOrderId = b.workOrderId;
    if (!workOrderId) return fail(res, 400, '工单不能为空');
    const wo = db.prepare('SELECT id, order_no FROM work_orders WHERE id = ?').get(workOrderId);
    if (!wo) return fail(res, 404, '工单不存在');
    const lineNo = b.lineNo ?? 1;
    const seq = db.prepare('SELECT COUNT(*) c FROM tasks WHERE work_order_id = ?').get(workOrderId).c + 1;
    const taskNo = b.taskNo || `${wo.order_no}-${lineNo}-${String(seq).padStart(3, '0')}`;
    if (b.taskNo) {
      const exists = db.prepare('SELECT id FROM tasks WHERE task_no = ?').get(b.taskNo);
      if (exists) return fail(res, 400, '工作任务号已存在');
    }
    const subgroupSize = Math.min(25, Math.max(5, parseInt(b.subgroupSize, 10) || 5));
    let totalSampleSize = Math.max(subgroupSize, parseInt(b.totalSampleSize, 10) || 200);
    // 总体样本量必须是组内样本量的整倍数
    totalSampleSize = Math.ceil(totalSampleSize / subgroupSize) * subgroupSize;
    if (b.usl != null && b.lsl != null && Number(b.usl) <= Number(b.lsl)) return fail(res, 400, 'USL 必须大于 LSL');
    db.prepare(`
      INSERT INTO tasks (work_order_id, task_no, line_no, product_code, product_name, spec, unit,
        process_route_name, process_name, process_sequence, quality_char, target_value, usl, lsl,
        subgroup_size, total_sample_size, equipment_code, instrument_code, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      workOrderId, taskNo, lineNo, b.productCode || '', b.productName || '', b.spec || '', b.unit || '',
      b.processRouteName || '', b.processName || '', b.processSequence || '',
      b.qualityChar || '', Number(b.targetValue) || 0,
      Number(b.usl) || 0, Number(b.lsl) || 0, subgroupSize, totalSampleSize,
      b.equipmentCode || null, b.instrumentCode || null
    );
    const row = db.prepare('SELECT id, task_no AS taskNo, product_name AS productName FROM tasks WHERE task_no = ?').get(taskNo);
    return ok(res, row, '创建成功');
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) return fail(res, 400, '工作任务号已存在');
    return fail(res, 500, e.message);
  }
});

// 更新任务
router.put('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const b = req.body || {};
    if (b.usl != null && b.lsl != null && Number(b.usl) !== 0 && Number(b.lsl) !== 0 && Number(b.usl) <= Number(b.lsl)) return fail(res, 400, 'USL 必须大于 LSL');
    const subgroupSize = b.subgroupSize != null ? Math.min(25, Math.max(5, parseInt(b.subgroupSize, 10))) : undefined;
    let totalSampleSize = b.totalSampleSize != null ? parseInt(b.totalSampleSize, 10) : undefined;
    // 总体样本量必须是组内样本量的整倍数
    if (totalSampleSize != null) {
      const ss = subgroupSize || db.prepare('SELECT subgroup_size FROM tasks WHERE id = ?').get(id)?.subgroup_size || 5;
      totalSampleSize = Math.ceil(Math.max(ss, totalSampleSize) / ss) * ss;
    }
    const fields = [];
    const vals = [];
    ['product_code', 'product_name', 'spec', 'unit', 'line_no', 'process_route_name', 'process_name', 'process_sequence', 'quality_char', 'target_value', 'usl', 'lsl', 'equipment_code', 'instrument_code'].forEach(f => {
      const key = f.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      if (b[key] !== undefined) { fields.push(`${f} = ?`); vals.push(b[key]); }
    });
    if (subgroupSize !== undefined) { fields.push('subgroup_size = ?'); vals.push(subgroupSize); }
    if (totalSampleSize !== undefined) { fields.push('total_sample_size = ?'); vals.push(totalSampleSize); }
    if (b.taskNo !== undefined) { fields.push('task_no = ?'); vals.push(b.taskNo); }
    if (!fields.length) return fail(res, 400, '无有效更新字段');
    vals.push(id);
    const result = db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ? AND (deleted IS NULL OR deleted = 0)`).run(...vals);
    if (result.changes === 0) return fail(res, 404, '任务不存在');
    return ok(res, null, '更新成功');
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) return fail(res, 400, '工作任务号已存在');
    return fail(res, 500, e.message);
  }
});

// 启用/停止任务
router.put('/:id/status', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const status = parseInt(req.body?.status, 10);
    if (status !== 0 && status !== 1) return fail(res, 400, 'status 应为 0 或 1');
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    let statusResult;
    if (status === 1) {
      statusResult = db.prepare('UPDATE tasks SET status = 1, enabled_at = ? WHERE id = ? AND (deleted IS NULL OR deleted = 0)').run(now, id);
    } else {
      statusResult = db.prepare('UPDATE tasks SET status = 0 WHERE id = ? AND (deleted IS NULL OR deleted = 0)').run(id);
    }
    if (statusResult.changes === 0) return fail(res, 404, '任务不存在');
    return ok(res, null, '已更新');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});


router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const deleteResult = db.prepare('UPDATE tasks SET deleted = 1, deleted_at = ? WHERE id = ? AND (deleted IS NULL OR deleted = 0)').run(now, id);
    if (deleteResult.changes === 0) return fail(res, 404, '任务不存在');
    return ok(res, null, '已删除');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

// 恢复任务（取消逻辑删除）
router.put('/:id/restore', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const restoreResult = db.prepare('UPDATE tasks SET deleted = 0, deleted_at = NULL WHERE id = ? AND deleted = 1').run(id);
    if (restoreResult.changes === 0) return fail(res, 404, '任务不存在或未删除');
    return ok(res, null, '已恢复');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

module.exports = router;
