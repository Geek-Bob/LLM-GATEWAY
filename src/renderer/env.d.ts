/**
 * 渲染进程环境类型声明
 *
 * - `/// <reference types="vite/client" />`：引用 Vite 内置类型，提供
 *   import.meta.env、CSS module 类型推断、以及静态资源导入的类型支持
 * - `declare module '*.css'`：显式声明 CSS 模块导入的类型，防止 TypeScript
 *   在 import './style.css' 时报 "Cannot find module" 错误
 *
 * 注意：全局 Window 扩展不在此处声明，统一在 lib/types.ts 中与业务类型一起管理。
 */
/// <reference types="vite/client" />

declare module '*.css'
