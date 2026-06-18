/**
 * Provider Pricing 数据访问层（Repository 模式）
 *
 * 封装对 `provider_pricing` 表的所有 CRUD 操作。
 * 该表存储每个供应商各模型的百万 tokens 单价，用于仪表板费用计算。
 * 联合主键为 (provider_id, model)，供应商删除时级联清理关联单价记录。
 *
 * 关键设计决策：
 * - upsert 采用 INSERT ... ON CONFLICT(provider_id, model) DO UPDATE，保证幂等
 * - 更新时仅刷新三单价列与 updated_at，created_at 由首次 INSERT 写入后保持不变
 * - 字段命名：入参使用 camelCase，数据库行返回 snake_case，映射在绑定时完成
 * - 通过参数注入 Database 实例，禁止内部调用 getDb()（破坏依赖注入链）
 */

import type { Database } from './database'

/**
 * upsert 入参（camelCase，应用层语义）
 */
export interface PricingInput {
  providerId: number
  model: string
  priceInCached: number
  priceInUncached: number
  priceOut: number
}

/**
 * provider_pricing 表的数据库行（snake_case，原始列名）
 */
export interface PricingRow {
  provider_id: number
  model: string
  price_in_cached: number
  price_in_uncached: number
  price_out: number
  created_at: string
  updated_at: string
}

/**
 * 创建 Pricing Repository 实例
 *
 * @param db - Database 实例（由调用方注入，禁止内部 getDb）
 * @returns Pricing Repository 对象，封装 provider_pricing 表的 CRUD
 */
export function createPricingRepository(db: Database) {
  return {
    /** 列出全部单价行，按 provider_id、model 排序 */
    async list(): Promise<PricingRow[]> {
      return db
        .prepare('SELECT * FROM provider_pricing ORDER BY provider_id, model')
        .all() as unknown as PricingRow[]
    },

    /** 查询指定供应商的全部单价行，按 model 排序 */
    async findByProvider(providerId: number): Promise<PricingRow[]> {
      return db
        .prepare('SELECT * FROM provider_pricing WHERE provider_id = ? ORDER BY model')
        .all(providerId) as unknown as PricingRow[]
    },

    /**
     * 插入或更新单价行（幂等）
     *
     * 同一 (provider_id, model) 重复调用触发 ON CONFLICT 分支：
     * 仅刷新三单价列与 updated_at，created_at 保持首次插入时的值。
     *
     * @param input - 单价入参（camelCase，内部转 snake_case 绑定）
     * @returns 写入后的完整行
     */
    async upsert(input: PricingInput): Promise<PricingRow> {
      db.prepare(`
        INSERT INTO provider_pricing (provider_id, model, price_in_cached, price_in_uncached, price_out)
        VALUES (@providerId, @model, @priceInCached, @priceInUncached, @priceOut)
        ON CONFLICT(provider_id, model) DO UPDATE SET
          price_in_cached = @priceInCached,
          price_in_uncached = @priceInUncached,
          price_out = @priceOut,
          updated_at = datetime('now')
      `).run({
        providerId: input.providerId,
        model: input.model,
        priceInCached: input.priceInCached,
        priceInUncached: input.priceInUncached,
        priceOut: input.priceOut
      })

      // 双位置参数必须以数组传入：Statement.run/get 仅接收单个 params 参数
      const row = db
        .prepare('SELECT * FROM provider_pricing WHERE provider_id = ? AND model = ?')
        .get([input.providerId, input.model]) as PricingRow | undefined
      if (!row) {
        throw new Error('Failed to upsert pricing: record not found after write')
      }
      return row
    },

    /** 删除单条单价行；(providerId, model) 不存在时不报错 */
    async remove(providerId: number, model: string): Promise<void> {
      // 双位置参数以数组传入（同 upsert 内 SELECT 的理由）
      db.prepare('DELETE FROM provider_pricing WHERE provider_id = ? AND model = ?').run([
        providerId,
        model
      ])
    },

    /** 删除指定供应商下全部单价行（供级联辅助）；不存在时不报错 */
    async removeByProvider(providerId: number): Promise<void> {
      db.prepare('DELETE FROM provider_pricing WHERE provider_id = ?').run(providerId)
    }
  }
}

export type PricingRepository = ReturnType<typeof createPricingRepository>
