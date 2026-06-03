/**
 * IPC API 快捷导出
 * 渲染进程统一通过此模块调用主进程能力，而非直接访问 window.electronAPI。
 * 使用方式：import { api } from '@/lib/ipc'
 * 类型声明见 lib/types.ts 中的 Window.electronAPI 接口
 */
export const api = window.electronAPI
