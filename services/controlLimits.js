/**
 * 控制图控制限计算（PRD 2.3.3 Xbar / X-R / S）
 * 输入：子组均值数组 means、子组极差数组 ranges、子组标准差数组 stdevs、子组大小 n
 */
const { getA2, getD3, getD4, getC4, getB3, getB4 } = require('./coefficients');

function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}
function mean(arr) {
  return arr.length ? sum(arr) / arr.length : 0;
}

/**
 * Xbar 图：CL = overall_mean, UCL/LCL = mean ± A2 * R_bar
 */
function xbarLimits(means, ranges, n) {
  const xBar = mean(means);
  const rBar = mean(ranges);
  const a2 = getA2(n);
  return {
    cl: round(xBar, 4),
    ucl: round(xBar + a2 * rBar, 4),
    lcl: round(xBar - a2 * rBar, 4)
  };
}

/**
 * R 图：CL = R_bar, UCL = D4*R_bar, LCL = D3*R_bar
 */
function rLimits(ranges, n) {
  const rBar = mean(ranges);
  return {
    cl: round(rBar, 4),
    ucl: round(getD4(n) * rBar, 4),
    lcl: round(getD3(n) * rBar, 4)
  };
}

/**
 * S 图：s_bar = mean(stdevs), UCL = B4*s_bar, LCL = B3*s_bar
 */
function sLimits(stdevs, n) {
  const sBar = mean(stdevs);
  return {
    cl: round(sBar, 4),
    ucl: round(getB4(n) * sBar, 4),
    lcl: round(Math.max(0, getB3(n) * sBar), 4)
  };
}

function round(x, d) {
  return Number(Number(x).toFixed(d));
}

/**
 * 从原始子组数据计算 means、ranges、stdevs，再算三张图的限
 * groups: [{ values: [num,...] }, ...]
 */
function computeFromGroups(groups) {
  const means = [];
  const ranges = [];
  const stdevs = [];
  for (const g of groups) {
    const v = g.values.filter(x => typeof x === 'number' && !isNaN(x));
    if (v.length === 0) continue;
    const m = mean(v);
    const r = Math.max(...v) - Math.min(...v);
    const s = Math.sqrt(v.reduce((acc, x) => acc + (x - m) ** 2, 0) / (v.length - 1)) || 0;
    means.push(m);
    ranges.push(r);
    stdevs.push(s);
  }
  const n = groups[0] ? (groups[0].values || []).length : 5;
  const nn = n >= 2 ? n : 5;
  return {
    means, ranges, stdevs,
    xbar: xbarLimits(means, ranges, nn),
    r: rLimits(ranges, nn),
    s: sLimits(stdevs, nn),
    overallMean: round(mean(means), 4),
    overallRange: round(mean(ranges), 4)
  };
}

module.exports = {
  xbarLimits,
  rLimits,
  sLimits,
  computeFromGroups,
  mean,
  round
};
