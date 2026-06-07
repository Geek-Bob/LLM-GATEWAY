/**
 * NDJSON 日志系统 + SQLite 预聚合统计
 *
 * 日志存储采用双层架构：
 * 1. 详细日志：以 NDJSON（每行一个 JSON 对象）格式写入文件系统，
 *    每个文件最多 500 行（MAX_LINES），最多保留 20 个文件（MAX_FILES），
 *    超出时自动轮转删除最旧文件。文件名格式 logs-{四位数序号}.ndjson。
 * 2. 预聚合统计：同时将请求指标写入 SQLite 的 request_stats 和
 *    request_stats_provider 表，用于仪表盘快速查询，避免全量扫描 NDJSON。
 *
 * 关键限制：
 * - NDJSON 文件不是数据库，不支持随机写，只能 append
 * - 查询时必须全量读取再过滤，适合小规模本地日志场景
 * - 不在 NDJSON 中存储 API Key 明文（安全要求）
 *
 * 文件拆分：
 * - logs-writer.ts — 写入、轮转、元数据管理
 * - logs-reader.ts — 查询、分页、过滤
 * - logs-stats.ts  — SQLite 预聚合统计
 */

export * from './logs-writer'
export * from './logs-reader'
export * from './logs-stats'
