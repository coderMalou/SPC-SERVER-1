const express = require('express');
const router = express.Router();
const db = require('../db');
const { ok, fail } = require('../utils/response');
const { auth } = require('../middleware/auth');
const { computeFromGroups } = require('../services/controlLimits');
const { evaluateRules } = require('../services/rules');

router.use(auth);

/**
 * 获取任务的控制图数据（Xbar/R/S 控制限、子组均值/极差/标准差、判异结果）
 * GET /api/control-chart/task/:taskId
 */
router.get('/task/:taskId', (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId, 10);
    const task = db.prepare(`
      SELECT t.id, t.task_no AS taskNo, t.product_code AS productCode, t.product_name AS productName,
        t.process_name AS processName, t.quality_char AS qualityChar, t.subgroup_size AS subgroupSize,
        t.total_sample_size AS totalSampleSize, t.usl, t.lsl, t.equipment_code AS equipmentCode
      FROM tasks t WHERE t.id = ? AND (t.deleted IS NULL OR t.deleted = 0)
    `).get(taskId);
    if (!task) return fail(res, 404, '任务不存在');

    const rows = db.prepare(`
      SELECT id, group_no AS groupNo, measure_time AS measureTime, sample_values AS sampleValues, enabled
      FROM measurement_groups WHERE task_id = ? AND enabled = 1 ORDER BY group_no
    `).all(taskId);

    const groups = rows.map(r => ({
      id: r.id,
      groupNo: r.groupNo,
      measureTime: r.measureTime,
      values: (typeof r.sampleValues === 'string' ? JSON.parse(r.sampleValues || '[]') : r.sampleValues || []).map(Number).filter(v => !isNaN(v))
    })).filter(g => g.values.length >= 2);

    if (groups.length === 0) {
      return ok(res, {
        task,
        limits: { xbar: null, r: null, s: null },
        series: { means: [], ranges: [], stdevs: [], groupNos: [] },
        rules: { status: '受控', message: '无有效数据', anomalies: [] },
        lastCheck: null
      });
    }

    const result = computeFromGroups(groups);
    const rules = evaluateRules(result.means, result.xbar, { rule1: true, rule2: true, rule3: true, rule4: true });

    const lastCheck = rows.length ? rows[rows.length - 1].measureTime : null;

    return ok(res, {
      task,
      limits: {
        xbar: result.xbar,
        r: result.r,
        s: result.s
      },
      series: {
        means: result.means,
        ranges: result.ranges,
        stdevs: result.stdevs,
        groupNos: groups.map(g => g.groupNo)
      },
      rules: {
        status: rules.status,
        message: rules.message,
        anomalies: rules.anomalies
      },
      overallMean: result.overallMean,
      overallRange: result.overallRange,
      lastCheck
    });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

module.exports = router;
