/**
 * 过程能力指标（PRD 2.4.7）
 * Cp, Cpk, Pp, Ppk, 不良率(PPM), 西格玛水平
 */
const { mean, round } = require('./controlLimits');

function stdevSample(arr) {
  if (!arr || arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

function stdevPopulation(arr) {
  if (!arr || arr.length < 1) return 0;
  const m = mean(arr);
  const variance = arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

/**
 * 从全部个体数据计算
 * @param {number[]} allValues 所有样本值（扁平）
 * @param {number} usl 上规格限
 * @param {number} lsl 下规格限
 */
function capability(allValues, usl, lsl) {
  const vals = allValues.filter(x => typeof x === 'number' && !isNaN(x));
  if (vals.length < 2) {
    return { cp: 0, cpk: 0, pp: 0, ppk: 0, ppm: 0, sigmaLevel: 0, message: '数据不足' };
  }
  const mu = mean(vals);
  const sigma = stdevSample(vals);   // 组内/过程标准差估计
  const S = stdevPopulation(vals);  // 总体标准差

  const cp = (usl - lsl) / (6 * sigma) || 0;
  const cpu = (usl - mu) / (3 * sigma) || 0;
  const cpl = (mu - lsl) / (3 * sigma) || 0;
  const cpk = Math.min(cpu, cpl);

  const pp = (usl - lsl) / (6 * S) || 0;
  const ppu = (usl - mu) / (3 * S) || 0;
  const ppl = (mu - lsl) / (3 * S) || 0;
  const ppk = Math.min(ppu, ppl);

  const outOfSpec = vals.filter(x => x > usl || x < lsl).length;
  const ppm = round((outOfSpec / vals.length) * 1e6, 0);

  // 西格玛水平：Cpk 对应的 Z，近似 Z ≈ 3*Cpk
  const sigmaLevel = round(3 * cpk, 2);

  return {
    cp: round(cp, 4),
    cpk: round(cpk, 4),
    pp: round(pp, 4),
    ppk: round(ppk, 4),
    ppm,
    sigmaLevel,
    mean: round(mu, 4),
    sigma: round(sigma, 4),
    totalN: vals.length,
    outOfSpec
  };
}

module.exports = { capability, stdevSample, stdevPopulation };
