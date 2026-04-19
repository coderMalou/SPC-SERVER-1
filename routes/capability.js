const express = require('express');
const router = express.Router();
const db = require('../db');
const { ok, fail } = require('../utils/response');
const { auth } = require('../middleware/auth');
const { capability } = require('../services/capability');

router.use(auth);

/**
 * 获取任务的过程能力指标
 * GET /api/capability/task/:taskId
 */
router.get('/task/:taskId', (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId, 10);
    const task = db.prepare('SELECT id, usl, lsl FROM tasks WHERE id = ? AND (deleted IS NULL OR deleted = 0)').get(taskId);
    if (!task) return fail(res, 404, '任务不存在');
    const rows = db.prepare(`
      SELECT sample_values FROM measurement_groups WHERE task_id = ? AND enabled = 1
    `).all(taskId);
    const allValues = [];
    for (const r of rows) {
      const arr = typeof r.sample_values === 'string' ? JSON.parse(r.sample_values || '[]') : (r.sample_values || []);
      arr.forEach(v => { if (typeof v === 'number' && !isNaN(v)) allValues.push(v); });
    }
    const result = capability(allValues, task.usl, task.lsl);
    return ok(res, result);
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

module.exports = router;
