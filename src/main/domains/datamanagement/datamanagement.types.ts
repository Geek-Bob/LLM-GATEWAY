/**
 * datamanagement domain 类型派生文件。
 *
 * 仅通过 type alias 从 `shared/types.ts` 派生跨进程共享类型，
 * 禁止在 domain 内重新定义同名 interface（见 `backend/31-domain-modeling.md`）。
 *
 * 路径说明：从 `domains/datamanagement/` 到 `shared/types.ts` 需向上三层。
 */
export type ClearDataInput = import('../../../shared/types').ClearDataInput
export type ClearDataResult = import('../../../shared/types').ClearDataResult
