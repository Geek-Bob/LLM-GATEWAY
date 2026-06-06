# 焦点操控（Electron 特有）

## 禁止
- 任何 `window.focus()` / `document.activeElement.blur()` 等手动焦点操控 workaround
- `confirm()` / `alert()` / `window.confirm()` / `window.alert()`

## 原因
Electron 无边框窗口（`frame: false`）下，原生确认框会夺走 webContents 焦点且不归还，导致所有页面输入框永久失焦（需 Alt+Tab 切换才能恢复）。

## 替代方案
- 删除确认等场景直接执行操作，不做二次确认
- 如需确认 UI，用 Radix AlertDialog 组件
