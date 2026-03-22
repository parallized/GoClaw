# GoPlan

GoPlan 是一个基于 Bun Monorepo 的 AI 智能活动规划器 MVP，当前聚焦两个场景：

- 明天跑步路线规划
- 最近一周拍照地点与拍摄建议规划

## 技术栈

- Monorepo：Bun Workspaces
- 前端：React + TypeScript + Vite + UnoCSS
- 后端：Elysia + TypeScript
- 共享契约：`@goplan/contracts`
- 实时能力接入：Open-Meteo、Overpass、OSRM、Nominatim、OpenAI 兼容大模型接口

## 目录结构

- `apps/api`：规划 API、场景引擎、外部能力适配器
- `apps/web`：MVP 前端
- `packages/contracts`：前后端共享类型与 Zod Schema
- `scripts/test-ai.ts`：验证 AI 模型接口可用性

## 快速开始

1. 复制环境变量：`cp .env.example .env`
2. 安装依赖：`bun install`
3. 启动后端：`bun run dev:api`
4. 启动前端：`bun run dev:web`

## 验证

- 类型检查：`bun run typecheck`
- 构建：`bun run build`
- AI 接口探测：`bun run test:ai`

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
- POI Provider：Overpass / OpenStreetMap
- Routing Provider：OSRM
- Geocoding Provider：Nominatim
- Navigation Provider：高德跳转链接生成
- AI Provider：OpenAI 兼容接口

### 无硬编码兜底原则

项目不会返回伪造景点、伪造天气、伪造路线。即使 AI 未配置，也会依赖真实天气与地理数据做确定性规划，而不是返回演示假数据。
