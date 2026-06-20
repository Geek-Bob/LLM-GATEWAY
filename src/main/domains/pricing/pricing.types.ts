/**
 * Pricing domain 类型定义
 *
 * 复用策略（遵循 CLAUDE.md 核心实体规则）：
 * - `PricingRow`（snake_case db 行）、`PricingInput`（camelCase 入参）已在
 *   `db/provider-pricing.ts` 定义，此处通过 type alias 复用，避免重复定义同名 interface
 * - `PricingResponse` 对外契约对齐 `shared/types.ts` 的 `PricingEntity`，
 *   通过 type alias 派生（不重新定义同名 interface）
 */
import type { PricingRow as DbPricingRow, PricingInput as DbPricingInput } from '../../db/provider-pricing'
import type { PricingEntity } from '../../../shared/types'

/** provider_pricing 表的数据库行（snake_case）— 复用 db 层定义 */
export type PricingRow = DbPricingRow

/** upsert 入参（camelCase）— 复用 db 层定义 */
export type PricingInput = DbPricingInput

/** 对外响应（camelCase），对齐 shared/types.ts 的 PricingEntity */
export type PricingResponse = PricingEntity
