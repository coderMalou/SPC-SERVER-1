/**
 * 错误与边界测试：不按“正常流程”走，专门测各种错误和非法输入。
 * 先启动服务 npm start，再运行 node test-api-errors.js
 * 通过条件：接口返回的 HTTP 状态码和错误信息符合预期，而不是崩掉或返回 200。
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

function assert(name, condition, detail = '') {
  const pass = condition;
  console.log(pass ? '[PASS]' : '[FAIL]', name, detail || '');
  return pass;
}

async function main() {
  let passed = 0;
  let failed = 0;

  // ---------- 登录：错误输入 ----------
  console.log('\n--- 登录 ---');
  let r = await request('POST', '/api/auth/login', {});
  if (assert('登录空 body 应 400', r.status === 400, `得到 ${r.status}`)) passed++; else failed++;

  r = await request('POST', '/api/auth/login', { username: 'spc_admin' });
  if (assert('登录缺密码应 400', r.status === 400, `得到 ${r.status}`)) passed++; else failed++;

  r = await request('POST', '/api/auth/login', { username: 'wrong', password: 'wrong' });
  if (assert('错误账号密码应 401', r.status === 401, `得到 ${r.status}`)) passed++; else failed++;

  r = await request('POST', '/api/auth/login', { username: 'spc_admin', password: '123456' });
  if (!r.ok || !r.data.data || !r.data.data.token) {
    console.log('[FAIL] 正确账号应返回 token', `得到 ${r.status}`);
    failed++;
  } else {
    console.log('[PASS] 正确账号应返回 token');
    passed++;
  }
  const token = r.data.data ? r.data.data.token : null;

  // ---------- 无 token 访问需鉴权接口 ----------
  console.log('\n--- 鉴权 ---');
  r = await request('GET', '/api/work-orders');
  if (assert('无 token 访问工单列表应 401', r.status === 401, `得到 ${r.status}`)) passed++; else failed++;

  r = await request('GET', '/api/tasks');
  if (assert('无 token 访问任务列表应 401', r.status === 401, `得到 ${r.status}`)) passed++; else failed++;

  r = await request('GET', '/api/control-chart/task/1', null, 'invalid-token');
  if (assert('错误 token 应 401', r.status === 401, `得到 ${r.status}`)) passed++; else failed++;

  if (!token) {
    console.log('[SKIP] 无 token，跳过后续需登录的测试');
    console.log('\n合计:', passed, '通过', failed, '失败');
    return;
  }

  // ---------- 工单：错误输入 ----------
  console.log('\n--- 工单 ---');
  r = await request('POST', '/api/work-orders', { orderNo: '' }, token);
  if (assert('工单号为空应 400', r.status === 400, `得到 ${r.status}`)) passed++; else failed++;

  r = await request('POST', '/api/work-orders', { orderNo: 'ERR-TEST-UNIQUE' }, token);
  const first = r.status;
  r = await request('POST', '/api/work-orders', { orderNo: 'ERR-TEST-UNIQUE' }, token);
  if (assert('重复工单号应 400', r.status === 400, `得到 ${r.status}`)) passed++; else failed++;

  r = await request('PUT', '/api/work-orders/99999/close', null, token);
  if (assert('关闭不存在的工单应 404', r.status === 404, `得到 ${r.status}`)) passed++; else failed++;

  r = await request('PUT', '/api/work-orders/99999/enable', null, token);
  if (assert('启用不存在的工单应 404', r.status === 404, `得到 ${r.status}`)) passed++; else failed++;

  // ---------- 任务：错误输入 ----------
  console.log('\n--- 任务 ---');
  r = await request('POST', '/api/tasks', {}, token);
  if (assert('任务缺 workOrderId 应 400', r.status === 400, `得到 ${r.status}`)) passed++; else failed++;

  r = await request('POST', '/api/tasks', { workOrderId: 99999, productName: 'x' }, token);
  if (assert('任务使用不存在的工单应 404', r.status === 404, `得到 ${r.status}`)) passed++; else failed++;

  const woRes = await request('POST', '/api/work-orders', { orderNo: 'ERR-WO-TASK' }, token);
  const wid = woRes.data.data && woRes.data.data.id;
  if (wid) {
    r = await request('POST', '/api/tasks', {
      workOrderId: wid, productName: 'x', usl: 9, lsl: 10
    }, token);
    if (assert('USL <= LSL 应 400', r.status === 400, `得到 ${r.status}`)) passed++; else failed++;
  }

  r = await request('GET', '/api/tasks/99999', null, token);
  if (assert('获取不存在的任务应 404', r.status === 404, `得到 ${r.status}`)) passed++; else failed++;

  // ---------- 测量数据 / 控制图 / 过程能力：不存在的 taskId ----------
  console.log('\n--- 测量与控制图 ---');
  r = await request('GET', '/api/measurement/task/99999', null, token);
  if (assert('不存在的任务取测量数据应 200 且返回空列表', r.status === 200 && Array.isArray(r.data.data), `得到 ${r.status}`)) passed++; else failed++;

  r = await request('POST', '/api/measurement/task/99999', { groupNo: 1, sampleValues: [1,2,3,4,5] }, token);
  if (assert('向不存在的任务加数据应 404', r.status === 404, `得到 ${r.status}`)) passed++; else failed++;

  r = await request('GET', '/api/control-chart/task/99999', null, token);
  if (assert('不存在的任务控制图应 404', r.status === 404, `得到 ${r.status}`)) passed++; else failed++;

  r = await request('GET', '/api/capability/task/99999', null, token);
  if (assert('不存在的任务过程能力应 404', r.status === 404, `得到 ${r.status}`)) passed++; else failed++;

  console.log('\n========== 合计:', passed, '通过', failed, '失败 ==========');
}

main().catch(e => console.error('运行出错:', e));
