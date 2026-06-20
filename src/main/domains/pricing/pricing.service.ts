import type { Database } from '../../db/database'
import { createPricingRepository } from '../../db/provider-pricing'
import type { PricingRow } from '../../db/provider-pricing'
import type { PricingInput, PricingResponse } from './pricing.types'

/**
 * 创建单价业务服务
 *
 * 封装 provider_pricing 表的 CRUD，负责数据库行（snake_case）与对外响应
 * （camelCase）之间的转换，并委派给 Repository 完成实际数据访问。
 *
 * 业务错误格式 `Failed to {action} pricing: {reason}` 由 Repository 层抛出
 * （见 db/provider-pricing.ts），service 层不做二次包装，避免消息嵌套
 * （详见 backend/34-error-handling.md 错误传播规则）。
 *
 * @param db - Database 实例（由调用方注入，禁止内部 getDb）
 * @returns Pricing Service 对象
 */
export function createPricingService(db: Database) {
  const repo = createPricingRepository(db)

  return {
    /** 列出全部单价记录，返回 camelCase 响应数组 */
    list: async (): Promise<PricingResponse[]> => {
      const rows = await repo.list()
      return rows.map(pricingRowToResponse)
    },

    /** 查询指定供应商的全部单价记录，按 model 排序 */
    getByProvider: async (providerId: number): Promise<PricingResponse[]> => {
      const rows = await repo.findByProvider(providerId)
      return rows.map(pricingRowToResponse)
    },

    /**
     * 插入或更新单条单价记录（幂等）
     *
     * 同一 (providerId, model) 重复调用触发 ON CONFLICT 分支，
     * 仅刷新三单价列与 updated_at，created_at 保持首次插入时的值。
     *
     * 委派 Repository.upsert 完成写入，并做 snake_case→camelCase 转换。
     * Repository 已在内部抛出 `Failed to upsert pricing: ...` 业务错误，
     * 此处不再二次包装（避免错误消息双层嵌套）。
     *
     * @returns 写入后的完整记录（camelCase）
     */
    upsert: async (input: PricingInput): Promise<PricingResponse> => {
      const row = await repo.upsert(input)
      return pricingRowToResponse(row)
    },

    /** 删除单条单价记录；(providerId, model) 不存在时不报错 */
    remove: async (providerId: number, model: string): Promise<void> => {
      await repo.remove(providerId, model)
    }
  }
}

/**
 * 将数据库层 snake_case PricingRow 转换为 camelCase PricingResponse。
 * 对齐 shared/types.ts 的 PricingEntity（不含 created_at/updated_at）。
 */
function pricingRowToResponse(row: PricingRow): PricingResponse {
  return {
    providerId: row.provider_id,
    model: row.model,
    priceInCached: row.price_in_cached,
    priceInUncached: row.price_in_uncached,
    priceOut: row.price_out
  }
}

export type PricingService = ReturnType<typeof createPricingService>
