/**
 * 为工单 MO-2024-TEST-003 生成三个测试任务及测量数据
 * 使用方法：先启动服务 npm start，再在另一个终端运行 node generate-test-data.js
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

// 生成正态分布样本（同 seed 数据逻辑）
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

// 生成一组测量数据
function buildSubGroups(taskInfo, groupCount, subgroupSize, startGroupNo) {
  const items = [];
  const baseTime = new Date('2026-05-06T08:00:00');
  for (let g = 0; g < groupCount; g++) {
    const groupNo = startGroupNo + g;
    const measureTime = new Date(baseTime.getTime() + groupNo * 30 * 60 * 1000);
    const samples = generateNormalSamples(taskInfo.targetValue, taskInfo.lsl, taskInfo.usl, subgroupSize);
    items.push({
      groupNo,
      measureTime: measureTime.toISOString().slice(0, 19).replace('T', ' '),
      sampleValues: samples,
      operator: '操作员A',
      remark: ''
    });
  }
  return items;
}

// 分批发送批量请求（每批最多 200 组）
async function sendBatches(taskId, allItems, batchSize, token) {
  let totalOk = 0;
  for (let i = 0; i < allItems.length; i += batchSize) {
    const batch = allItems.slice(i, i + batchSize);
    const res = await request('POST', `/api/measurement/task/${taskId}/batch`, batch, token);
    if (res.ok) {
      const okCount = res.data?.data?.inserted?.length || 0;
      totalOk += okCount;
      console.log(`  → 批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(allItems.length / batchSize)}: 成功 ${okCount} 组`);
    } else {
      console.log(`  → 批次 ${Math.floor(i / batchSize) + 1} 失败:`, res.data?.msg);
    }
  }
  return totalOk;
}

async function main() {
  console.log('========== 1. 登录 ==========');
  const loginRes = await request('POST', '/api/auth/login', { username: 'admin', password: '123456' });
  if (!loginRes.ok) {
    console.log('登录失败:', loginRes.data);
    return;
  }
  const token = loginRes.data.data.token;
  console.log('登录成功\n');

  // 检查工单是否已存在
  console.log('========== 2. 检查/创建工单 MO-2024-TEST-003 ==========');
  let workOrderId;
  const woListRes = await request('GET', '/api/work-orders', null, token);
  const existingWO = (woListRes.data?.data || []).find(wo => wo.orderNo === 'MO-2024-TEST-003');
  if (existingWO) {
    workOrderId = existingWO.id;
    console.log('工单已存在，ID:', workOrderId);
  } else {
    const woRes = await request('POST', '/api/work-orders', { orderNo: 'MO-2024-TEST-003' }, token);
    if (!woRes.ok) {
      console.log('创建工单失败:', woRes.data);
      return;
    }
    workOrderId = woRes.data.data.id;
    console.log('工单创建成功，ID:', workOrderId);
  }

  // 定义三个任务
  const tasks = [
    {
      name: '普通数据量',
      groupCount: 200,
      totalSampleSize: 1000,
      taskNo: 'MO-2024-TEST-003-1-001',
      productCode: 'PROD-NORMAL-001',
      productName: '轴承套筒',
      spec: '外径50±0.5',
      unit: 'mm',
      processRouteName: '粗车-精车-磨削',
      processName: '精车加工',
      qualityChar: '外径',
      targetValue: 50,
      usl: 50.5,
      lsl: 49.5
    },
    {
      name: '大数据量',
      groupCount: 1500,
      totalSampleSize: 7500,
      taskNo: 'MO-2024-TEST-003-2-002',
      productCode: 'PROD-LARGE-002',
      productName: '齿轮轴',
      spec: '直径30±0.3',
      unit: 'mm',
      processRouteName: '锻造-热处理-精磨',
      processName: '精磨加工',
      qualityChar: '直径',
      targetValue: 30,
      usl: 30.3,
      lsl: 29.7
    },
    {
      name: '超大数据量',
      groupCount: 5000,
      totalSampleSize: 25000,
      taskNo: 'MO-2024-TEST-003-3-003',
      productCode: 'PROD-ULTRA-003',
      productName: '法兰盘',
      spec: '内径100±1.0',
      unit: 'mm',
      processRouteName: '铸造-车削-钻孔-检验',
      processName: '精车端面',
      qualityChar: '内径',
      targetValue: 100,
      usl: 101.0,
      lsl: 99.0
    }
  ];

  const subgroupSize = 5; // 组内样本量默认值

  for (const task of tasks) {
    console.log(`\n========== 3. 创建任务: ${task.name} (${task.groupCount}组) ==========`);

    // 先检查是否已存在
    const taskListRes = await request('GET', '/api/tasks', null, token);
    const existingTask = (taskListRes.data?.data || []).find(t => t.taskNo === task.taskNo);
    let taskId;
    if (existingTask) {
      taskId = existingTask.id;
      console.log(`任务 ${task.taskNo} 已存在，ID: ${taskId}，将跳过`);
      continue;
    }

    const taskBody = {
      workOrderId,
      taskNo: task.taskNo,
      productCode: task.productCode,
      productName: task.productName,
      spec: task.spec,
      unit: task.unit,
      processRouteName: task.processRouteName,
      processName: task.processName,
      qualityChar: task.qualityChar,
      targetValue: task.targetValue,
      usl: task.usl,
      lsl: task.lsl,
      subgroupSize,
      totalSampleSize: task.totalSampleSize
    };

    const taskRes = await request('POST', '/api/tasks', taskBody, token);
    if (!taskRes.ok) {
      console.log('创建任务失败:', taskRes.data);
      continue;
    }
    taskId = taskRes.data.data.id;
    console.log('任务创建成功，ID:', taskId);

    // 启用任务
    const enableRes = await request('PUT', `/api/tasks/${taskId}/status`, { status: 1 }, token);
    console.log('启用任务:', enableRes.ok ? 'OK' : enableRes.data?.msg);

    // 生成测量数据
    console.log(`  生成 ${task.groupCount} 组测量数据...`);
    const allItems = buildSubGroups(task, task.groupCount, subgroupSize, 1);

    // 批量导入
    console.log(`  开始批量导入（每批 200 组）...`);
    const inserted = await sendBatches(taskId, allItems, 200, token);
    console.log(`  ${task.name} 完成: 成功导入 ${inserted}/${task.groupCount} 组`);
  }

  console.log('\n========== 4. 最终结果验证 ==========');
  const finalTasks = await request('GET', '/api/tasks?workOrderId=' + workOrderId, null, token);
  const taskList = finalTasks.data?.data || [];
  console.log(`工单 MO-2024-TEST-003 下的任务列表:`);
  for (const t of taskList) {
    const mgRes = await request('GET', `/api/measurement/task/${t.id}`, null, token);
    const groupCount = Array.isArray(mgRes.data?.data) ? mgRes.data.data.length : 0;
    console.log(`  ${t.taskNo} | ${t.productName} | 测量组数: ${groupCount} | 状态: ${t.status === 1 ? '启用' : '停用'}`);
  }

  console.log('\n========== 测试数据生成完成 ==========');
}

main().catch(e => console.error('出错:', e.message));
