# SPC 统计过程控制系统 - 后端（毕设轻量版）

基于 PRD 文档 V1.0 的轻量化 Node.js 实现，满足毕业设计需求。工单与任务均在本系统内维护。

## 技术栈

- Node.js + Express
- SQLite（better-sqlite3）
- JWT 登录
- 现有 `mystat.js`（正态性检验、基础统计）可继续使用

## 目录结构

```
├── app.js                 # 入口
├── app.original.js         # 你原来的仅登录版备份
├── config.js               # 配置（端口、JWT、数据库路径）
├── db/
│   └── index.js            # SQLite 连接与建表
├── middleware/
│   └── auth.js             # JWT 校验
├── routes/
│   ├── auth.js             # 登录
│   ├── workOrders.js       # 工单
│   ├── tasks.js            # 任务
│   ├── measurement.js     # 测量数据
│   ├── controlChart.js     # 控制图数据
│   └── capability.js       # 过程能力
├── services/
│   ├── coefficients.js     # 系数表 A2/D3/D4/C4/B3/B4
│   ├── controlLimits.js    # Xbar / R / S 控制限
│   ├── rules.js            # 判异准则
│   └── capability.js       # Cp/Cpk/Pp/Ppk 等
├── utils/
│   └── response.js
├── mystat.js               # 正态性检验等（你原有）
└── data/                   # SQLite 数据库文件目录（自动创建）
```

## 功能说明

### 1. 登录与鉴权
- 账号密码登录，返回 JWT 令牌
- 除登录接口外，其余接口需在请求头携带 `Authorization: Bearer <token>`
- 默认账号：`spc_admin` / `123456`

### 2. 工单管理
- **工单列表**：支持启用/已关闭两种状态，启用工单排在前面
- **新增工单**：手动创建工单号（本系统不对接 MES，工单在本系统维护）
- **关闭工单**：将工单置为已关闭，关闭后任务变为只读
- **启用工单**：已关闭工单可重新启用

### 3. 任务管理
- **任务列表**：按工单筛选、按状态筛选（启用/停止）
- **任务详情**：产品、工序、规格限、组内样本量、总体样本量等
- **新增/编辑任务**：维护产品编码、工序名称、质量特性、USL/LSL、子组大小等
- **任务状态**：启用/停止，停止状态下不参与控制图计算

### 4. 测量数据
- **子组数据**：每个子组包含子组编号、检测时间、样本1～样本n（5～25 个）、操作员、备注
- **单条录入**：手动新增一条子组数据
- **批量录入**：一次提交多条子组数据
- **启用/禁用**：禁用数据不参与控制限和过程能力计算
- **自动计算**：子组均值、极差、标准差由后端根据样本值自动计算

### 5. 控制图
- **Xbar 图**：子组均值控制图，使用 A2 系数计算 UCL/LCL
- **X-R 图**：极差控制图，使用 D3、D4 系数
- **S 图**：标准差控制图，使用 C4、B3、B4 系数
- **判异规则**：支持 4 种准则
  - 单点超限：单点超出 3σ 控制限
  - 连续偏移：连续 9 点在中心线同一侧
  - 递增/递减：连续 6 点递增或递减
  - 交替波动：连续 14 点交替上下
- **异常标注**：返回每个子组的判异结果及整体状态（受控/警告/失控）

### 6. 过程能力
- **Cp**：过程潜能指数，(USL - LSL) / (6σ)
- **Cpk**：过程能力指数，考虑中心偏移
- **Pp / Ppk**：过程性能指数，使用总体标准差
- **不良率 (PPM)**：超出规格限的样本占比
- **西格玛水平**：基于 Cpk 计算
- **能力等级**：A/B/C/D/E 五档划分及改进建议

## 安装与运行

```bash
npm install
npm start
```

默认端口 3456。数据库文件：`./data/spc.db`（首次启动自动建表）。

## 接口说明

除登录外，其余接口均需在请求头携带：`Authorization: Bearer <token>`。

| 模块     | 方法 | 路径 | 说明 |
|----------|------|------|------|
| 登录     | POST | `/api/auth/login` 或 `/login` | body: `{ username, password }` |
| 工单     | GET  | `/api/work-orders` | 列表（启用在前） |
| 工单     | POST | `/api/work-orders` | body: `{ orderNo }` |
| 工单     | PUT  | `/api/work-orders/:id/close` | 关闭工单 |
| 工单     | PUT  | `/api/work-orders/:id/enable` | 启用工单 |
| 任务     | GET  | `/api/tasks` | 列表，query: `workOrderId`, `status` |
| 任务     | GET  | `/api/tasks/:id` | 任务详情 |
| 任务     | POST | `/api/tasks` | 新增 |
| 任务     | PUT  | `/api/tasks/:id` | 更新 |
| 任务     | PUT  | `/api/tasks/:id/status` | body: `{ status: 0\|1 }` |
| 任务     | DELETE | `/api/tasks/:id` | 删除 |
| 测量数据 | GET  | `/api/measurement/task/:taskId` | 子组列表 |
| 测量数据 | POST | `/api/measurement/task/:taskId` | 单条子组 |
| 测量数据 | POST | `/api/measurement/task/:taskId/batch` | 批量 |
| 测量数据 | PUT  | `/api/measurement/:id` | 更新子组 |
| 测量数据 | DELETE | `/api/measurement/:id` | 删除子组 |
| 控制图   | GET  | `/api/control-chart/task/:taskId` | 控制限与判异 |
| 过程能力 | GET  | `/api/capability/task/:taskId` | Cp/Cpk/Pp/Ppk 等 |

## 默认账号

- 账号：`spc_admin`
- 密码：`123456`
