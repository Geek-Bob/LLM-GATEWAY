/**
 * 数据管理业务服务（跨聚合根清空编排器）。
 *
 * 职责：按用户勾选的类别编排业务数据与运行数据的清空。
 * - 业务数据：providers / model_mappings / api_keys / conversations(+messages 级联)，
 *   单事务原子清空，失败 ROLLBACK 整个 clear 失败。
 * - 运行数据：log_stats 两张统计表 + NDJSON 日志文件（resetLogs），分步无事务。
 * - 组合输入：先业务后运行；业务成功后运行失败属部分成功，错误消息需提示
 *   「business data already cleared」，让用户知晓业务数据已不可恢复。
 *
 * 不引用 agentRepo——Agent 表完全不参与清空（见设计文档 8.6 备注）。
 *
 * 事务用法遵循 backend/33-data-access.md：sql.js 无声明性 db.transaction()，
 * 用 db.exec('BEGIN')/db.exec('COMMIT')/db.exec('ROLLBACK') 显式控制，
 * try/catch 中失败 ROLLBACK。
 */

import type { Database } from '../../db/database'
import type { ClearDataInput, ClearDataResult } from '../../../shared/types'
import { createProviderRepository } from '../../db/providers'
import { createModelMappingRepository } from '../../db/model-mappings'
import { createApiKeyRepository } from '../../db/api-keys'
import { createConversationRepository } from '../../db/conversations'
import { createLogStatsRepository } from '../../db/logs-stats'
import { resetLogs } from '../../db/logs-writer'

/**
 * 创建数据管理业务服务
 * @param db - 注入的数据库实例
 * @returns DataManagementService，对外暴露 clear(input) 方法
 */
export function createDataManagementService(db: Database) {
  const providerRepo = createProviderRepository(db)
  const modelMappingRepo = createModelMappingRepository(db)
  const apiKeyRepo = createApiKeyRepository(db)
  const conversationRepo = createConversationRepository(db)
  const logStatsRepo = createLogStatsRepository(db)

  return {
    /**
     * 按勾选类别清空数据。业务数据在单事务中原子清空（失败 ROLLBACK），
     * 运行数据分步清空无事务。组合输入下业务成功后运行失败属部分成功，
     * 错误消息提示业务数据已清空。
     * @param input - 勾选状态（假设已由 IPC 层 Zod 校验，至少一个为 true）
     * @returns 各类别清空结果，未执行的类别 cleared=false
     */
    async clear(input: ClearDataInput): Promise<ClearDataResult> {
      const result: ClearDataResult = {
        business: { cleared: false },
        operational: { cleared: false }
      }

      let businessCleared = false
      if (input.business) {
        await clearBusinessData(db, { providerRepo, modelMappingRepo, apiKeyRepo, conversationRepo })
        result.business.cleared = true
        businessCleared = true
      }

      if (input.operational) {
        try {
          await clearOperationalData({ logStatsRepo })
          result.operational.cleared = true
        } catch (error) {
          // 部分成功：业务已清空不可回滚，错误消息需提示用户
          const reason = error instanceof Error ? error.message : String(error)
          if (businessCleared) {
            throw new Error(`Failed to clear operational data: ${reason} (business data already cleared)`, { cause: error })
          }
          throw new Error(`Failed to clear operational data: ${reason}`, { cause: error })
        }
      }

      return result
    }
  }
}

/** 业务 Repository 集合，用于 clearBusinessData 注入（便于失败注入测试）。 */
interface BusinessRepos {
  providerRepo: ReturnType<typeof createProviderRepository>
  modelMappingRepo: ReturnType<typeof createModelMappingRepository>
  apiKeyRepo: ReturnType<typeof createApiKeyRepository>
  conversationRepo: ReturnType<typeof createConversationRepository>
}

/**
 * 清空业务数据：单事务包裹 4 个表的 clearAll，任一失败 ROLLBACK 并抛业务错误。
 * 事务边界在数据层开启/提交（遵循 backend/33-data-access.md 事务边界规则）。
 */
async function clearBusinessData(db: Database, repos: BusinessRepos): Promise<void> {
  db.exec('BEGIN')
  try {
    await repos.providerRepo.clearAll()
    await repos.modelMappingRepo.clearAll()
    await repos.apiKeyRepo.clearAll()
    await repos.conversationRepo.clearAll()
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to clear business data: ${reason}`, { cause: error })
  }
}

/**
 * 清空运行数据：分步执行统计表清空 + 日志文件清空，无事务包裹。
 * 任一步失败即抛错，已执行步骤不回滚（属可接受中间态，用户重试即可）。
 */
async function clearOperationalData(repos: {
  logStatsRepo: ReturnType<typeof createLogStatsRepository>
}): Promise<void> {
  await repos.logStatsRepo.clearAll()
  resetLogs()
}

export type DataManagementService = ReturnType<typeof createDataManagementService>
