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
- **SettingsPage** (tab N+1): Member management, task management (with emoji picker), data export/import

### Data Migration

`src/utils/migration.js` runs before React mounts. Handles v1→v2 migration (string member names → object IDs, flat notes → structured notes). Gated by `flt_migrated_v2` localStorage flag.

### Legacy

`src/legacy/family-tracker.html` is the original single-file HTML version (~970 lines). Kept for reference; not used in the React app.

## Development Notes

- 使用 `frontend-design` skill 指导 UI 设计
- 通过 Supabase MCP 管理数据库（`.mcp.json` 已配置，代码尚未接入）
- Mobile-first: uses safe-area insets, touch swipe for day navigation, no-scale viewport
- CSS custom properties defined in `src/App.css` (--accent, --green, --blue, --purple color system)
- Textarea 统一使用固定高度 + overflow-y scroll（笔记 120px，其他 80px）
- Deployed via GitHub → Vercel
