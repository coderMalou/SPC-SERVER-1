const express = require('express');
const router = express.Router();
const db = require('../db');
const { ok, fail } = require('../utils/response');
const { auth } = require('../middleware/auth');
const { computeFromGroups } = require('../services/controlLimits');
const { evaluateRules } = require('../services/rules');

router.use(auth);

function recomputeMeasurementStatus(taskId) {
  const rows = db.prepare(`
    SELECT id, group_no AS groupNo, sample_values AS sampleValues
    FROM measurement_groups
    WHERE task_id = ? AND enabled = 1
    ORDER BY group_no
  `).all(taskId);

  const groups = rows.map(r => ({
    id: r.id,
    groupNo: r.groupNo,
    values: (typeof r.sampleValues === 'string' ? JSON.parse(r.sampleValues || '[]') : (r.sampleValues || []))
      .map(Number)
      .filter(v => !isNaN(v))
  })).filter(g => g.values.length >= 2);

  if (groups.length === 0) {
    db.prepare('UPDATE measurement_groups SET status = 0 WHERE task_id = ? AND enabled = 1').run(taskId);
    return;
  }

  const result = computeFromGroups(groups);
  const rules = evaluateRules(result.means, result.xbar, { rule1: true, rule2: true, rule3: true, rule4: true });

  const anomalyIndexSet = new Set();
  for (const a of rules.anomalies || []) {
    const start = Number(a.index);
    const len = Number(a.length) || 1;
    if (!Number.isFinite(start) || !Number.isFinite(len)) continue;
    for (let i = start; i < start + len; i++) anomalyIndexSet.add(i);
  }

  const anomalyIds = [];
  for (let i = 0; i < groups.length; i++) {
    if (anomalyIndexSet.has(i)) anomalyIds.push(groups[i].id);
  }

  if (anomalyIds.length === 0) {
    db.prepare('UPDATE measurement_groups SET status = 0 WHERE task_id = ? AND enabled = 1').run(taskId);
    return;
  }

  const placeholders = anomalyIds.map(() => '?').join(', ');
  db.prepare(`
    UPDATE measurement_groups
    SET status = CASE WHEN id IN (${placeholders}) THEN 1 ELSE 0 END
    WHERE task_id = ? AND enabled = 1
  `).run(...anomalyIds, taskId);
}

// 获取任务的测量数据（子组列表）
router.get('/task/:taskId', (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId, 10);
    const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND (deleted IS NULL OR deleted = 0)').get(taskId);
    if (!task) return fail(res, 404, '任务不存在');
    const enabled = req.query.enabled;
    let sql = 'SELECT id, task_id AS taskId, group_no AS groupNo, measure_time AS measureTime, sample_values AS sampleValues, operator, remark, enabled, status FROM measurement_groups WHERE task_id = ?';
    const params = [taskId];
    if (enabled !== undefined && enabled !== '') { sql += ' AND enabled = ?'; params.push(Number(enabled)); }
    sql += ' ORDER BY group_no';
    const rows = db.prepare(sql).all(...params);
    const list = rows.map(r => ({
      ...r,
      sampleValues: typeof r.sampleValues === 'string' ? JSON.parse(r.sampleValues || '[]') : (r.sampleValues || [])
    }));
    return ok(res, list);
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

// 新增一条子组数据
router.post('/task/:taskId', (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId, 10);
    const task = db.prepare('SELECT id, subgroup_size, total_sample_size FROM tasks WHERE id = ? AND (deleted IS NULL OR deleted = 0)').get(taskId);
    if (!task) return fail(res, 404, '任务不存在');
    const maxGroups = Math.floor(task.total_sample_size / task.subgroup_size);
    const count = db.prepare('SELECT COUNT(*) c FROM measurement_groups WHERE task_id = ?').get(taskId).c;
    // 若超过当前限制，自动更新总体样本量
    if (count >= maxGroups) {
      const newTotalSampleSize = (count + 1) * task.subgroup_size;
      db.prepare('UPDATE tasks SET total_sample_size = ? WHERE id = ?').run(newTotalSampleSize, taskId);
    }
    const b = req.body || {};
    const groupNo = parseInt(b.groupNo, 10) || (count + 1);
    const existing = db.prepare('SELECT id FROM measurement_groups WHERE task_id = ? AND group_no = ?').get(taskId, groupNo);
    if (existing) return fail(res, 400, '该子组编号已存在');
    const sampleValues = Array.isArray(b.sampleValues) ? b.sampleValues : (b.sampleValues != null ? [b.sampleValues] : []);
    const n = Math.min(25, Math.max(5, task.subgroup_size));
    while (sampleValues.length < n) sampleValues.push(null);
    const measureTime = b.measureTime || new Date().toISOString().slice(0, 19).replace('T', ' ');
    const status = b.status === undefined ? 0 : parseInt(b.status, 10);
    if (status !== 0 && status !== 1) return fail(res, 400, 'status 应为 0（正常）或 1（异常）');
    db.prepare(`
      INSERT INTO measurement_groups (task_id, group_no, measure_time, sample_values, operator, remark, enabled, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(taskId, groupNo, measureTime, JSON.stringify(sampleValues.slice(0, n)), b.operator || '', b.remark || '', b.enabled !== 0 ? 1 : 0, status);
    if (b.enabled !== 0) recomputeMeasurementStatus(taskId);
    const row = db.prepare('SELECT id, group_no AS groupNo, measure_time AS measureTime, sample_values AS sampleValues, operator, remark, enabled, status FROM measurement_groups WHERE task_id = ? AND group_no = ?').get(taskId, groupNo);
    row.sampleValues = JSON.parse(row.sampleValues || '[]');
    return ok(res, row, '添加成功');
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) return fail(res, 400, '子组编号已存在');
    return fail(res, 500, e.message);
  }
});

// 批量导入子组（body: [{ groupNo, measureTime, sampleValues, operator?, remark? }, ...]）
router.post('/task/:taskId/batch', (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId, 10);
    const task = db.prepare('SELECT id, subgroup_size, total_sample_size FROM tasks WHERE id = ? AND (deleted IS NULL OR deleted = 0)').get(taskId);
    if (!task) return fail(res, 404, '任务不存在');
    const n = Math.min(25, Math.max(5, task.subgroup_size));
    const items = Array.isArray(req.body) ? req.body : (req.body?.items ? req.body.items : []);
    const inserted = [];
    const errors = [];
    for (let i = 0; i < items.length; i++) {
      const b = items[i];
      const groupNo = parseInt(b.groupNo, 10) || (i + 1);
      const existing = db.prepare('SELECT id FROM measurement_groups WHERE task_id = ? AND group_no = ?').get(taskId, groupNo);
      if (existing) { errors.push(`子组${groupNo}已存在`); continue; }
      const count = db.prepare('SELECT COUNT(*) c FROM measurement_groups WHERE task_id = ?').get(taskId).c;
      const maxGroups = Math.floor(task.total_sample_size / task.subgroup_size);
      // 若超过当前限制，自动更新总体样本量
      if (count >= maxGroups) {
        const newTotalSampleSize = (count + 1) * task.subgroup_size;
        db.prepare('UPDATE tasks SET total_sample_size = ? WHERE id = ?').run(newTotalSampleSize, taskId);
        task.total_sample_size = newTotalSampleSize;
      }
      let sampleValues = Array.isArray(b.sampleValues) ? b.sampleValues : [];
      while (sampleValues.length < n) sampleValues.push(null);
      const measureTime = b.measureTime || new Date().toISOString().slice(0, 19).replace('T', ' ');
      const status = b.status === undefined ? 0 : parseInt(b.status, 10);
      if (status !== 0 && status !== 1) { errors.push(`子组${groupNo}: status 应为 0 或 1`); continue; }
      try {
        db.prepare(`
          INSERT INTO measurement_groups (task_id, group_no, measure_time, sample_values, operator, remark, enabled, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(taskId, groupNo, measureTime, JSON.stringify(sampleValues.slice(0, n)), b.operator || '', b.remark || '', 1, status);
        inserted.push(groupNo);
      } catch (e) {
        errors.push(`子组${groupNo}: ${e.message}`);
      }
    }
    if (inserted.length) recomputeMeasurementStatus(taskId);
    return ok(res, { inserted, errors }, '批量导入完成');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

// 更新一条子组
router.put('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const b = req.body || {};
    const updates = [];
    const vals = [];
    if (b.measureTime !== undefined) { updates.push('measure_time = ?'); vals.push(b.measureTime); }
    if (b.sampleValues !== undefined) { updates.push('sample_values = ?'); vals.push(JSON.stringify(Array.isArray(b.sampleValues) ? b.sampleValues : [])); }
    if (b.operator !== undefined) { updates.push('operator = ?'); vals.push(b.operator); }
    if (b.remark !== undefined) { updates.push('remark = ?'); vals.push(b.remark); }
    if (b.enabled !== undefined) { updates.push('enabled = ?'); vals.push(b.enabled ? 1 : 0); }
    if (b.status !== undefined) {
      const status = parseInt(b.status, 10);
      if (status !== 0 && status !== 1) return fail(res, 400, 'status 应为 0（正常）或 1（异常）');
      updates.push('status = ?'); vals.push(status);
    }
    if (!updates.length) return fail(res, 400, '无有效更新');
    vals.push(id);
    db.prepare(`UPDATE measurement_groups SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
    if (db.prepare('SELECT changes()').get()['changes()'] === 0) return fail(res, 404, '记录不存在');
    const row = db.prepare('SELECT task_id AS taskId, enabled FROM measurement_groups WHERE id = ?').get(id);
    if (row && row.enabled === 1) recomputeMeasurementStatus(row.taskId);
    return ok(res, null, '更新成功');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

// 删除一条子组
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    db.prepare('DELETE FROM measurement_groups WHERE id = ?').run(id);
    if (db.prepare('SELECT changes()').get()['changes()'] === 0) return fail(res, 404, '记录不存在');
    return ok(res, null, '已删除');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

module.exports = router;
