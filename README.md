# GoClaw

GoClaw 是一个基于 Bun Monorepo 的 AI 智能活动规划器 MVP，当前聚焦两个场景：

- 明天跑步路线规划
- 最近一周拍照地点与拍摄建议规划

## 技术栈

- Monorepo：Bun Workspaces
- 前端：React + TypeScript + Vite + UnoCSS
- 后端：Elysia + TypeScript
- 共享契约：`@goclaw/contracts`
- 实时能力接入：Open-Meteo、Amap Web Service、Overpass、OSRM、Nominatim、OpenAI 兼容大模型接口

## 目录结构

- `apps/api`：规划 API、场景引擎、外部能力适配器
- `apps/web`：MVP 前端
- `packages/contracts`：前后端共享类型与 Zod Schema
- `scripts/verify-ai-v1.ts`：验证 AI `v1` 接口可用性

## 快速开始

1. 复制环境变量：`cp .env.example .env`
2. 安装依赖：`bun install`
3. 启动后端：`bun run dev:api`
4. 启动前端：`bun run dev:web`

## 验证

- 类型检查：`bun run typecheck`
- 构建：`bun run build`
- AI `v1` 接口探测：`bun run test:ai`

## 国内地点服务（推荐）

- 如果配置了 `AMAP_WEB_SERVICE_KEY`，后端会优先使用高德 Web 服务做逆地理编码与周边 POI 搜索。
- 当高德服务出现临时限流或短时不可用时，会自动回退到现有 `Nominatim / Overpass` 链路，尽量保证可用性。
- 如果暂时没有配置高德 Key，系统会继续使用现有公共地点服务，不会影响本地开发启动。
- 可选环境变量：`AMAP_WEB_SERVICE_KEY`、`AMAP_WEB_SERVICE_BASE_URL`。

### 地点服务备用节点

- 默认会按顺序尝试多个 `Overpass` 节点，降低单一公共实例限流或短时不可用导致的失败概率。
- 如需自定义，可通过 `POI_OVERPASS_ENDPOINTS` 传入英文逗号分隔的节点列表。

## 架构说明

### 场景层

后端以可扩展场景注册表为核心，每个场景只声明：

- 输入 Schema
- 输出 Schema
- 规划器实现
- 前端元信息

当前已有：

- `run_tomorrow`
- `photo_week`

后续新增爬山、骑行、图书馆等场景时，只需要补充新的场景模块与输入偏好，而不需要重写整套 API。

### 能力层

后端将天气、POI、路径、地理编码、导航链接、AI 增强拆成独立 Provider：

- Weather Provider：Open-Meteo
- POI Provider：Amap Web Service / Overpass / OpenStreetMap
- Routing Provider：OSRM
- Geocoding Provider：Amap Web Service / Nominatim
- Navigation Provider：高德跳转链接生成
- AI Provider：OpenAI 兼容接口

### 无硬编码兜底原则

项目不会返回伪造景点、伪造天气、伪造路线。即使 AI 未配置，也会依赖真实天气与地理数据做确定性规划，而不是返回演示假数据。
