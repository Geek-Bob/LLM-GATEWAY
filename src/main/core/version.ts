/**
 * 语义版本比较工具
 *
 * 仅用于更新检查时的版本大小判断（防止远程更旧时误报"有更新"导致降级提示）。
 * 不引入 semver 依赖：electron-updater 版本号均为标准 x.y.z 格式，
 * 分段数值比较已足够，且避免新增直接依赖。
 */

/**
 * 比较两个语义版本号的大小。
 * 仅比较主版本段（x.y.z），忽略预发布后缀（-beta / -rc.1 等）。
 * @param a - 版本字符串 A
 * @param b - 版本字符串 B
 * @returns a>b 返回正数，a<b 返回负数，相等返回 0
 * @example
 * compareVersions('1.0.5', '1.0.4')   // 1
 * compareVersions('1.0.3', '1.0.4')   // -1
 * compareVersions('1.0.4', '1.0.4')   // 0
 */
export function compareVersions(a: string, b: string): number {
  // 去除预发布后缀，只保留主版本段
  const segA = a.split('-')[0].split('.').map((n) => Number.parseInt(n, 10) || 0)
  const segB = b.split('-')[0].split('.').map((n) => Number.parseInt(n, 10) || 0)
  const len = Math.max(segA.length, segB.length)
  for (let i = 0; i < len; i++) {
    const diff = (segA[i] ?? 0) - (segB[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/**
 * 判断 candidate 是否比 current 更新（严格大于）。
 * @param candidate - 远程候选版本
 * @param current - 当前本地版本
 * @returns candidate > current 时为 true
 * @example
 * isNewerVersion('1.0.5', '1.0.4')  // true
 * isNewerVersion('1.0.4', '1.0.4')  // false
 * isNewerVersion('1.0.3', '1.0.4')  // false（远程更旧，不提示更新）
 */
export function isNewerVersion(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0
}
