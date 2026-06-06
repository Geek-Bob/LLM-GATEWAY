# 铁律补充（CLAUDE.md 铁律未覆盖的细节）

## 命名约定
- 组件/类：PascalCase → `UserProfile`、`DataLoader`
- 函数/变量：camelCase → `getUserById`、`isLoading`
- 常量：UPPER_SNAKE_CASE → `API_BASE_URL`、`MAX_RETRY`
- 布尔值：is/has/can 开头 → `hasPermission`、`canEdit`
- 文件名：组件用 PascalCase（`UserCard.tsx`），工具用 camelCase（`formatDate.ts`）

## 注释要求
- 导出函数/类必须有 JSDoc（参数说明 + 返回值 + 示例）
- 包含魔法数字的计算逻辑必须注释说明含义
- 复杂业务规则必须注释说明"为什么"

❌ 禁止：
const price = item.value * 1.1 + item.bonus - item.discount;

✅ 正确：
// 基础价格 + 10% 增值税 + 奖励积分 - 折扣
const price = item.value * 1.1 + item.bonus - item.discount;

## 错误处理
- 异步操作必须有 try-catch，catch 中必须记录日志 + 重新抛出
- 禁止空 catch（`catch {}`）和只打印不处理（`catch(e) { console.log(e) }`）
- 错误信息必须包含上下文（操作名 + 关键参数）

❌ 禁止：
catch (e) { console.log(e); return null; }

✅ 正确：
catch (error) {
  logger.error('Failed to fetch user', { userId, error });
  throw new DatabaseError('User query failed', { cause: error });
}

## 焦点操控
- 任何 `window.focus()` / `document.activeElement.blur()` 等手动焦点操控 workaround（根因是 `confirm()`，禁止用补丁掩盖问题）
- `confirm()` 的详细说明：Electron 无边框窗口（`frame: false`）下，原生确认框会夺走 webContents 焦点且不归还，导致所有页面输入框永久失焦（需 Alt+Tab 切换才能恢复）。删除确认等场景直接执行操作，不做二次确认；如需确认 UI，用 Radix AlertDialog 组件
