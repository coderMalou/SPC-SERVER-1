/**
 * 判异准则（PRD 2.3.4）
 * 规则1：单点超出3σ控制限
 * 规则2：连续9点落在中心线同一侧
 * 规则3：连续6点递增或递减
 * 规则4：连续14点交替上下变动
 */
function rule1SinglePointOut(means, ucl, lcl) {
  const out = [];
  means.forEach((m, i) => {
    if (m > ucl || m < lcl) out.push({ index: i, length: 1, value: m, rule: '单点超限' });
  });
  return out;
}

function rule2NineSameSide(means, cl) {
  const out = [];
  for (let i = 0; i <= means.length - 9; i++) {
    const slice = means.slice(i, i + 9);
    const above = slice.every(m => m > cl);
    const below = slice.every(m => m < cl);
    if (above || below)
      out.push({ index: i, length: 9, rule: '连续9点中心线同一侧', side: above ? '上' : '下' });
  }
  return out;
}

function rule3SixTrend(means) {
  const out = [];
  for (let i = 0; i <= means.length - 6; i++) {
    const slice = means.slice(i, i + 6);
    let inc = true, dec = true;
    for (let j = 1; j < slice.length; j++) {
      if (slice[j] <= slice[j - 1]) inc = false;
      if (slice[j] >= slice[j - 1]) dec = false;
    }
    if (inc || dec)
      out.push({ index: i, length: 6, rule: '连续6点递增或递减', direction: inc ? '递增' : '递减' });
  }
  return out;
}

function rule4FourteenAlternating(means) {
  const out = [];
  for (let i = 0; i <= means.length - 14; i++) {
    const slice = means.slice(i, i + 14);
    let alt = true;
    for (let j = 1; j < slice.length; j++) {
      const diff = slice[j] - slice[j - 1];
      const prevDiff = j >= 2 ? slice[j - 1] - slice[j - 2] : 0;
      if (prevDiff !== 0 && (diff * prevDiff >= 0)) { alt = false; break; }
    }
    if (alt) out.push({ index: i, length: 14, rule: '连续14点交替上下' });
  }
  return out;
}

/**
 * 汇总判异结果
 * @param {number[]} means 子组均值序列
 * @param {object} limits { cl, ucl, lcl }
 * @param {object} options { rule1, rule2, rule3, rule4 } 是否启用各准则，默认全开
 */
function evaluateRules(means, limits, options = {}) {
  const { rule1 = true, rule2 = true, rule3 = true, rule4 = true } = options;
  const { cl, ucl, lcl } = limits;
  const anomalies = [];
  if (rule1) anomalies.push(...rule1SinglePointOut(means, ucl, lcl));
  if (rule2) anomalies.push(...rule2NineSameSide(means, cl));
  if (rule3) anomalies.push(...rule3SixTrend(means));
  if (rule4) anomalies.push(...rule4FourteenAlternating(means));
  const hasAnomaly = anomalies.length > 0;
  return {
    status: hasAnomaly ? (anomalies.some(a => a.rule === '单点超限') ? '失控' : '警告') : '受控',
    message: hasAnomaly
      ? `异常点数：${anomalies.length}；${anomalies.map(a => a.rule).filter((v, i, arr) => arr.indexOf(v) === i).join('、')}`
      : '过程受控-未发现特殊原因变异',
    anomalies
  };
}

module.exports = {
  rule1SinglePointOut,
  rule2NineSameSide,
  rule3SixTrend,
  rule4FourteenAlternating,
  evaluateRules
};
