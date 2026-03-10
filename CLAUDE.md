# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

家庭共学记录 Web App — 记录全家每天的学习情况。移动端优先的 React 单页应用。

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (Vite)
npm run build        # Production build
npm run preview      # Preview production build
```

## Architecture

**React 19 + Vite 7**, CSS Modules for styling. No routing library — tab-based navigation managed by state.

### State Management

All state lives in a single custom hook `src/hooks/useStore.js`. No external state library. Data persists to **localStorage** with 300ms debounced writes. Three storage keys:
- `flt_members` — array of `{id, name, emoji}` member objects
- `flt_data` — flat map keyed by `{memberId}_{YYYY-MM-DD}`, each entry holds `{tasks, notes, readContent, noteContent, ...customContent}`
- `flt_tasks` — array of task objects `{id, key, label, emoji, type}`，支持用户自定义任务

### Task System

任务列表可自定义（增删、改名、换图标）。默认三项：学英语 → 做阅读 → 记笔记。

- 每个任务的文本内容存储在 data 条目的 `${task.key}Content` 字段（如 `readContent`、`noteContent`、`task_12345Content`）
- `type` 字段决定展开区域 UI：`note` 类型显示笔记标签头 + 大文本框，`read`/`custom` 显示普通文本框，`english` 无文本框
- 旧数据兼容：`getPersonData` 读取时自动将 `notes.see/know/do` 合并为 `noteContent`

### Page Structure (tab-based, not routed)

`App.jsx` switches between three views based on `currentTab` index:
- **PersonPage** (tab 0..N-1): Per-member daily check-in — customizable task list, progress ring, expandable task details
- **RankPage** (tab N): Weekly leaderboard across all members
- **SettingsPage** (tab N+1): Member management, task management (with emoji picker), SMS login

### Data Migration

`src/utils/migration.js` runs before React mounts. Handles v1→v2 migration (string member names → object IDs, flat notes → structured notes). Gated by `flt_migrated_v2` localStorage flag.

### Legacy

`src/legacy/family-tracker.html` is the original single-file HTML version (~970 lines). Kept for reference; not used in the React app.

### Supabase Integration (Login-gated Cloud Sync)

**策略**：localStorage 为主数据源，登录后启用 Supabase 云端同步。

- **未登录**：纯 localStorage，所有云端操作被 `syncEnabled` 开关拦截，不发任何 Supabase 请求
- **登录后**：`setSyncEnabled(true)` → 首次登录全量推送本地数据到云端；已有账户则拉取云端数据覆盖本地
- **写入同步**：登录状态下，打卡/成员/任务变更后异步推送（fire-and-forget），文本输入 1 秒防抖
- **登出**：`setSyncEnabled(false)` → 回到纯本地模式，数据保留在 localStorage
- **身份标识**：`household_id`（UUID，存在 localStorage 的 `flt_household_id`），登录后绑定到用户
- **多设备同步**：同一手机号在不同设备登录，自动关联到同一 household

**数据库表**（Supabase project: `wginlfqxxrkfduujwvvo`，region: ap-south-1）：

| 表 | 说明 | 主键 |
|---|------|------|
| `households` | 家庭（数据隔离单元） | `id` (UUID) |
| `members` | 成员 | `(household_id, id)` |
| `tasks` | 任务定义 | `(household_id, id)` |
| `checkins` | 每日打卡（规范化：一条 = 一个成员一天一个任务） | `id` (UUID)，UNIQUE on `(household_id, member_id, date, task_key)` |

**RLS**：已启用，当前使用开放策略（`USING (true)`）。后续可改为 `USING (auth.uid() = user_id)`。

**关键文件**：
- `src/lib/supabase.js` — Supabase 客户端单例
- `src/lib/sync.js` — 全部同步函数（push/pull/format 转换）+ `syncEnabled` 开关
- `src/hooks/useStore.js` — householdId state + 各操作的 sync 调用
- `src/hooks/useAuth.js` — SMS 登录 hook（OTP 发送/验证/状态管理）

**SMS 登录**（阿里云 PNVS + Supabase Edge Functions）：
- `supabase/functions/send-otp/` — 调用阿里云发送验证码
- `supabase/functions/verify-otp/` — 验证码校验 + Supabase 用户创建/登录
- `supabase/functions/_shared/aliyun-signer.ts` — 阿里云 API 签名工具

**环境变量**（Vercel + `.env`）：
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Development Notes

- 使用 `frontend-design` skill 指导 UI 设计
- 通过 Supabase MCP 管理数据库（project ID: `wginlfqxxrkfduujwvvo`）
- Mobile-first: uses safe-area insets, touch swipe for day navigation, no-scale viewport
- CSS custom properties defined in `src/App.css` (--accent, --green, --blue, --purple color system)
- Textarea 统一使用固定高度 + overflow-y scroll（笔记 120px，其他 80px）
- Deployed via GitHub → Vercel（push 自动部署）

### Reverse Proxy (国内访问) — 已完成

**服务器**：香港一号（156.226.177.89），Caddy + sslip.io 自动 SSL

**国内访问地址**：`https://156-226-177-89.sslip.io`

**架构**：
- `/api/*` → strip prefix → `wginlfqxxrkfduujwvvo.supabase.co`（Supabase API）
- 其他请求 → `family-learning-theta.vercel.app`（前端）

**Vercel 环境变量**：`VITE_SUPABASE_URL` = `https://156-226-177-89.sslip.io/api`

### Multi-device Sync (多设备同步)

通过 SMS 登录实现：同一手机号在不同设备登录，自动关联到同一 household 并拉取云端数据。

每个浏览器首次打开仍生成独立的 `household_id`（UUID），登录后绑定到用户账户。

## Roadmap

### 已完成

- [x] React 19 + Vite 7 基础架构
- [x] 成员管理（增删改）
- [x] 自定义任务系统（增删、改名、换图标）
- [x] 每日打卡 + 文本记录
- [x] 周排行榜
- [x] 数据迁移 v1→v2
- [x] Supabase 云端同步（login-gated）
- [x] Vercel 部署 + 环境变量配置
- [x] 反向代理（国内可访问）— 香港一号 Caddy
- [x] 多设备同步（SMS 登录关联 household）
- [x] SMS 登录（阿里云 PNVS + Supabase Edge Functions）

### 后续计划
- [ ] 连续打卡 / 趋势可视化
- [ ] 笔记结构化改进
- [ ] AI 分析学习数据
- [ ] 付费功能（爱发电/Stripe → 微信支付）
