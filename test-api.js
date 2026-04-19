/**
 * 接口测试脚本：先启动服务 npm start，再在另一个终端运行 node test-api.js
 */
const BASE = 'http://localhost:3456';

async function request(method, path, body = null, token = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body && (method === 'POST' || method === 'PUT')) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  console.log('========== 1. 登录 ==========');
  const loginRes = await request('POST', '/api/auth/login', { username: 'spc_admin', password: '123456' });
  if (!loginRes.ok) {
    console.log('登录失败:', loginRes.data);
    return;
  }
  const token = loginRes.data.data.token;
  console.log('登录成功, token 已保存\n');

  console.log('========== 2. 新建工单 ==========');
  // 加上时间戳避免重复
  const ts = Date.now().toString().slice(-6);
  const woRes = await request('POST', '/api/work-orders', { orderNo: `MO-TEST-${ts}` }, token);
  console.log(woRes.ok ? '工单创建成功' : '工单可能已存在或失败', woRes.data);
  const workOrders = (await request('GET', '/api/work-orders', null, token)).data.data;
  // 获取刚刚创建的那个工单（按ID倒序取第一个）
  const workOrderId = Array.isArray(workOrders) && workOrders[0] ? workOrders[0].id : 1;
  console.log('当前工单 ID:', workOrderId, '\n');

  console.log('========== 3. 新建任务 ==========');
  const taskBody = {
    workOrderId,
    // 加上随机数避免任务号重复
    taskNo: `TASK-${ts}-${Math.floor(Math.random() * 1000)}`,
    productCode: 'P001',
    productName: '测试产品',
    processName: '车削',
    qualityChar: '直径',
    targetValue: 10,
    usl: 10.2,
    lsl: 9.8,
    subgroupSize: 5,
    totalSampleSize: 200
  };
  const taskRes = await request('POST', '/api/tasks', taskBody, token);
  console.log(taskRes.ok ? '任务创建成功' : '失败', taskRes.data);
  const tasks = (await request('GET', '/api/tasks', null, token)).data.data;
  const taskId = Array.isArray(tasks) && tasks[0] ? tasks[0].id : 1;
  console.log('当前任务 ID:', taskId, '\n');

  console.log('========== 4. 添加测量数据（5 个子组） ==========');
  for (let g = 1; g <= 5; g++) {
    // 引入随机扰动，模拟真实测量波动
    const noise = () => (Math.random() - 0.5) * 0.05; 
    const samples = (g === 5
      ? [20, 20, 20, 20, 20]
      : [
        10 + g * 0.1 + noise(), 
        9.9 + g * 0.1 + noise(), 
        10.1 + noise(), 
        10.0 + noise(), 
        9.95 + g * 0.05 + noise()
      ]).map(v => Number(v.toFixed(3))); // 保留3位小数

    const addRes = await request('POST', `/api/measurement/task/${taskId}`, {
      groupNo: g,
      measureTime: new Date().toISOString().slice(0, 19).replace('T', ' '),
      sampleValues: samples,
      operator: 'test'
    }, token);
    console.log('子组', g, addRes.ok ? 'OK' : addRes.data);
  }
  const mgRes = await request('GET', `/api/measurement/task/${taskId}`, null, token);
  const abnormalCount = Array.isArray(mgRes.data?.data) ? mgRes.data.data.filter(x => x.status === 1).length : 0;
  console.log('测量异常条数（期望 >= 1）:', abnormalCount);
  console.log('');

  console.log('========== 5. 获取控制图数据 ==========');
  const chartRes = await request('GET', `/api/control-chart/task/${taskId}`, null, token);
  if (chartRes.ok && chartRes.data.data) {
    const d = chartRes.data.data;
    console.log('Xbar 控制限:', d.limits && d.limits.xbar);
    console.log('判异状态:', d.rules && d.rules.status, d.rules && d.rules.message);
  } else {
    console.log('控制图接口:', chartRes.data);
  }
  console.log('');

  console.log('========== 6. 获取过程能力 ==========');
  const capRes = await request('GET', `/api/capability/task/${taskId}`, null, token);
  if (capRes.ok && capRes.data.data) {
    console.log('Cp:', capRes.data.data.cp, 'Cpk:', capRes.data.data.cpk);
    console.log('Pp:', capRes.data.data.pp, 'Ppk:', capRes.data.data.ppk);
    console.log('PPM:', capRes.data.data.ppm);
  } else {
    console.log('过程能力接口:', capRes.data);
  }

  console.log('\n========== 7. 逻辑删除任务并验证不可见 ==========');
  const delRes = await request('DELETE', `/api/tasks/${taskId}`, null, token);
  console.log(delRes.ok ? '删除成功' : '删除失败', delRes.data);
  const t1 = await request('GET', `/api/tasks/${taskId}`, null, token);
  console.log('任务详情（期望 404）:', t1.status, t1.data && t1.data.msg);
  const m1 = await request('GET', `/api/measurement/task/${taskId}`, null, token);
  console.log('测量列表（期望 404）:', m1.status, m1.data && m1.data.msg);
  const c1 = await request('GET', `/api/control-chart/task/${taskId}`, null, token);
  console.log('控制图（期望 404）:', c1.status, c1.data && c1.data.msg);
  const p1 = await request('GET', `/api/capability/task/${taskId}`, null, token);
  console.log('过程能力（期望 404）:', p1.status, p1.data && p1.data.msg);

  console.log('\n========== 8. 恢复任务并验证数据仍在 ==========');
  const restoreRes = await request('PUT', `/api/tasks/${taskId}/restore`, {}, token);
  console.log(restoreRes.ok ? '恢复成功' : '恢复失败', restoreRes.data);
  const t2 = await request('GET', `/api/tasks/${taskId}`, null, token);
  console.log('任务详情（期望 200）:', t2.status);
  const m2 = await request('GET', `/api/measurement/task/${taskId}`, null, token);
  console.log('测量列表条数（期望 >= 5）:', Array.isArray(m2.data && m2.data.data) ? m2.data.data.length : 0);

  console.log('\n========== 测试结束 ==========');
}

main().catch(e => console.error('请求出错:', e.message));
