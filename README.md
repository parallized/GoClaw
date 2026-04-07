<div align="center">

**GoClaw: 基于 Bun 的 AI 智能活动规划器**
</br>
<em>An AI-powered Activity Planner MVP based on Bun Monorepo</em>

[![Bun](https://img.shields.io/badge/Bun-Runtime-black?style=flat-square&logo=bun)](https://bun.sh/)
[![React](https://img.shields.io/badge/React-Frontend-61DAFB?style=flat-square&logo=react&logoColor=black)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

</div>

> [!NOTE]
> **GoClaw** 是一个架构清晰、可扩展的智能活动规划系统 MVP，当前聚焦于两个核心生活场景：“明天跑步路线规划”与“最近一周拍照地点建议”。项目严格遵循无硬编码兜底原则，以真实地理与气象数据为基石，结合大模型推理，为你生成确定性、可执行的真实活动计划。

> 💡 **你需要做的**：输入你的偏好与大致意图（如：“明天想去跑步”或“下周想去拍照”）。</br>
> 🗺️ **GoClaw 给你的**：基于当前真实天气预报、高德/OSRM 路线与真实 POI 数据计算出的结构化规划方案。

---

## 🏗 Monorepo 架构与职责栈

系统底层基于领域分离与高度模块化设计：

| 包名 / 目录 | 职责栈 |
|------|-------------|
| `apps/web` | **前端触点**：React + TypeScript + Vite + UnoCSS 驱动的 MVP 前端交互界面 |
| `apps/api` | **后端核心引擎**：Elysia + TypeScript 驱动，负责规划 API、场景运行引擎以及外部能力适配器 |
| `packages/contracts` | **共享协议层**：前后端完全共享的 Zod Schema 与强类型定义，实现端到端类型安全 |
| `scripts/` | **持续集成**：包含 `verify-ai-v1.ts` 等用于验证接口及链路连通性的基础测试脚本 |

---

## ⚙️ 核心设计架构

### 1. 扩展式场景引擎 (Scenario Layer)
后端以场景注册表为核心，解耦业务逻辑与底层基础设施。新增场景（如：爬山、骑行、图书馆）时，只需补充新模块，真正即插即用，且仅需声明：
- 明确的 **输入与输出 Schema**
- 独立的 **规划器实现** (Planner)
- 对应的前端渲染元信息

当前已内置两大场景：
- 🏃‍♂️ `run_tomorrow` (明天跑步路线规划)
- 📸 `photo_week` (近期拍摄地点建议)

### 2. 积木化能力层 (Provider Layer)
将所有外部不稳定性封装至独立 Provider，并提供灵活的后备方案：
- 🌤 **Weather Provider**：Open-Meteo
- 📍 **POI Provider**：优先高德 (Amap Web Service) 进行周边召回，智能回退至 Overpass / OpenStreetMap
- 🗺 **Routing Provider**：OSRM
- 🌍 **Geocoding Provider**：逆地理编码优先高德，兜底无缝回退 Nominatim
- 🔗 **Navigation Provider**：高德直达跳转链接生成
- 🧠 **AI Provider**：兼容泛 OpenAI 标准的大模型辅助决策与结构化接口

> [!TIP]
> **🌟 国内地点服务策略（推荐）**
> - 配置 `AMAP_WEB_SERVICE_KEY`（与可选的 `AMAP_WEB_SERVICE_BASE_URL`）后，系统将优先享受高德 Web 服务更精确的国内解析。
> - **容灾机制**：高德短时受限时，自动降级至备用链路；同样，由于 `Overpass` 存在请求频控，系统内置了节点池循环策略（你也可以通过 `POI_OVERPASS_ENDPOINTS` 注入英文逗号分隔的私有/备用节点列表以提升鲁棒性）。
> - 就算暂时没有任何外置 Key，系统全网公开降级链路仍能保障本地服务平稳启动与调试。

---

## 🛡️ 核心原则：无硬编码兜底 (No Mock Fallbacks)

系统**拒绝返回伪造景点、伪造天气、伪造路线**。即便 AI 模型响应偶尔掉链子或未配置，系统也会尽可能依靠确定性代码与真实物理世界接口获取基准数据实施计算，誓不妥协地给出“真实可用”的方案，而非简单的虚假 Demo 拼凑。

---

## 🚀 快速拉起与验证

请参考项目内的 `.env.example` 标准配置环境变量文件以开启全局链路。

### 安装与启动

```bash
# 1. 环境变量配置
cp .env.example .env

# 2. 挂载所有依赖
bun install

# 3. 极速拉起可观测 API 中枢
bun run dev:api

# 4. 驱动应用控制台界面的呈现
bun run dev:web
```

### 质量检测与类型自检

```bash
# 执行无死角的前后端类型强校验
bun run typecheck

# 多包项目全量构建与输出验证
bun run build

# 自动测试第一视角 AI 对接连通性
bun run test:ai
```
