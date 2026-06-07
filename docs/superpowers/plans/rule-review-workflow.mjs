export const meta = {
  name: 'rule-review',
  description: '审查所有规则文件：合并重复、消除歧义、补充示例、消除跨文件冲突',
  phases: [
    { title: 'Phase 1: Review' },
    { title: 'Phase 2: Synthesize' },
    { title: 'Phase 3: Apply' },
    { title: 'Phase 4: Verify' },
  ],
}

const FINDING_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          issue: { type: 'string' },
          category: { type: 'string', enum: ['duplicate', 'vague', 'missing-example', 'contradiction', 'outdated', 'cross-file-dup'] },
          fix: { type: 'string' },
        },
        required: ['file', 'issue', 'category', 'fix'],
      },
    },
  },
  required: ['findings'],
}

// ============================================================
// Phase 1: Review (3 agents in parallel)
// ============================================================
phase('Phase 1: Review')

const [commonFindings, frontendFindings, backendFindings] = await parallel([
  // Agent 1: Common rules
  () => agent(
    `Task: Review common rule files for quality issues.

Files to review:
- .claude/rules/common/00-global.md
- .claude/rules/common/05-engineering.md

Check for EACH file:
1. DUPLICATE rules — same rule stated multiple times within the file
2. VAGUE rules — rules like "禁止直接操作" without specifying what "直接" means or what to do INSTEAD
3. MISSING EXAMPLES — rules that say "do X" but don't show concrete code examples of correct vs incorrect
4. CONTRADICTIONS — rules that conflict with each other within the file
5. CROSS-FILE DUPLICATES — rules that are also stated in other rule files (check against ALL .claude/rules/ files)
6. OUTDATED rules — rules that reference patterns no longer used

Context from code audit:
- "导出函数/类必须有 JSDoc" was followed inconsistently — is the rule specific enough about WHAT the JSDoc should contain?
- "单函数不超过 50 行" was violated 14 times — is the rule clear about how to count lines?
- "布尔值：is/has/can 开头" was violated many times — should there be exceptions?

For each issue found, return structured finding with file/issue/category/fix.
Return as JSON array of findings.`,
    { label: 'review:common', phase: 'Phase 1: Review', model: 'sonnet', schema: FINDING_SCHEMA }
  ),

  // Agent 2: Frontend rules
  () => agent(
    `Task: Review frontend rule files for quality issues.

Files to review:
- .claude/rules/frontend/31-renderer.md
- .claude/rules/frontend/32-component-reuse.md
- .claude/rules/frontend/35-frontend-directory.md
- .claude/rules/frontend/36-frontend-testing.md
- .claude/rules/frontend/37-visual-style.md
- .claude/rules/frontend/38-animation.md

Check for EACH file:
1. DUPLICATE rules — same rule stated in multiple files (especially 31 vs 35, 32 vs 35)
2. VAGUE rules — rules without concrete examples of correct vs incorrect code
3. MISSING EXAMPLES — import path rules, component reuse rules, animation rules
4. CONTRADICTIONS — rules that conflict within or across files
5. CROSS-FILE DUPLICATES — rules covered by another file in more detail
6. OUTDATED rules — references to deprecated patterns

Context from code audit:
- "禁止使用原生 HTML 元素替代 components/ui/" — agents replaced <textarea> but kept <motion.button>; rule unclear about when motion elements are acceptable
- "统一使用 @/ 别名" — agents still used relative paths in 23 places; rule needs stronger enforcement guidance
- "禁止 Tailwind 任意值" — was followed, but the alternative (standard classes) not always clear
- "页面入场使用 pageVariants + childVariants" — agents didn't always apply this; rule needs import path example

For each issue found, return structured finding.
Return as JSON array of findings.`,
    { label: 'review:frontend', phase: 'Phase 1: Review', model: 'sonnet', schema: FINDING_SCHEMA }
  ),

  // Agent 3: Backend rules
  () => agent(
    `Task: Review backend rule files for quality issues.

Files to review:
- .claude/rules/backend/30-layered-architecture.md
- .claude/rules/backend/31-domain-modeling.md
- .claude/rules/backend/32-interface-contracts.md
- .claude/rules/backend/33-data-access.md
- .claude/rules/backend/34-error-handling.md
- .claude/rules/backend/35-security.md
- .claude/rules/backend/36-observability.md
- .claude/rules/backend/37-testing.md

Check for EACH file:
1. DUPLICATE rules — same rule stated in multiple files (especially 30 vs 31 vs 33 for data access)
2. VAGUE rules — rules without concrete examples
3. MISSING EXAMPLES — error message format, Zod schema examples, logger usage examples
4. CONTRADICTIONS — rules that conflict within or across files
5. CROSS-FILE DUPLICATES — rules covered by another file in more detail
6. OUTDATED rules — references to old patterns

Context from code audit:
- 31-domain-modeling.md: factory injection pattern was just rewritten with mode A/B clarification — verify it's clear
- 34-error-handling.md: "Failed to {action} {entity}: {reason}" format was followed by some agents but not others — is the format specific enough?
- 35-security.md: "API Key 只保留后 4 位" — agents still used slice(0, 12) in some places; rule needs exact code example
- 30-layered-architecture.md: import constraints were mostly followed, but proxy/server.ts violated them 4 times — is the constraint table clear enough?
- 33-data-access.md: "业务层禁止导入 db/" — agents didn't know what to do instead; rule needs to reference 31-domain-modeling.md mode A

For each issue found, return structured finding.
Return as JSON array of findings.`,
    { label: 'review:backend', phase: 'Phase 1: Review', model: 'sonnet', schema: FINDING_SCHEMA }
  ),
])

// ============================================================
// Phase 2: Synthesize (1 agent)
// ============================================================
phase('Phase 2: Synthesize')

const allFindings = [
  ...(commonFindings?.findings || []),
  ...(frontendFindings?.findings || []),
  ...(backendFindings?.findings || []),
]

const synthesis = await agent(
  `Task: Synthesize all rule review findings into a concrete fix plan.

Findings from 3 review agents:
${JSON.stringify(allFindings, null, 2)}

Your job:
1. DEDUPLICATE — merge findings that describe the same issue from different angles
2. PRIORITIZE — rank by impact on code quality (high = caused audit failures, medium = inconsistency, low = cosmetic)
3. CROSS-REFERENCE — check if fixes to one file affect another file
4. PRODUCE FIX PLAN — for each file that needs changes, list specific edits:
   - Which rule to add/modify/remove
   - The exact wording of the new/modified rule
   - Concrete code examples (correct vs incorrect)

Group fixes by file. For each file, provide:
- file path
- list of changes (each with: old text → new text, or "ADD" for new rules)

Return as JSON:
{
  "fixes": [
    {
      "file": ".claude/rules/backend/31-domain-modeling.md",
      "changes": [
        { "type": "modify", "old": "...", "new": "..." },
        { "type": "add", "content": "..." }
      ]
    }
  ]
}`,
  { label: 'synthesize', phase: 'Phase 2: Synthesize', model: 'sonnet' }
)

// ============================================================
// Phase 3: Apply (3 agents in parallel)
// ============================================================
phase('Phase 3: Apply')

await parallel([
  // Apply common rules
  () => agent(
    `Task: Apply rule fixes to common rule files.

Fix plan from synthesis:
${JSON.stringify(synthesis, null, 2)}

Files to modify:
- .claude/rules/common/00-global.md
- .claude/rules/common/05-engineering.md

For each file:
1. Read the current content
2. Apply ALL fixes from the synthesis that target this file
3. Ensure:
   - No duplicate rules remain
   - All rules have concrete examples where needed
   - Frontmatter is preserved
   - Markdown formatting is consistent

If a fix references code examples, write them as:
\`\`\`typescript
// ✅ 正确
...

// ❌ 错误
...
\`\`\`

Only modify files that have fixes in the synthesis. If a file has no fixes, skip it.
Run npx tsc --noEmit after all changes.`,
    { label: 'apply:common', phase: 'Phase 3: Apply', model: 'sonnet' }
  ),

  // Apply frontend rules
  () => agent(
    `Task: Apply rule fixes to frontend rule files.

Fix plan from synthesis:
${JSON.stringify(synthesis, null, 2)}

Files to modify:
- .claude/rules/frontend/31-renderer.md
- .claude/rules/frontend/32-component-reuse.md
- .claude/rules/frontend/35-frontend-directory.md
- .claude/rules/frontend/36-frontend-testing.md
- .claude/rules/frontend/37-visual-style.md
- .claude/rules/frontend/38-animation.md

For each file:
1. Read the current content
2. Apply ALL fixes from the synthesis that target this file
3. Ensure:
   - No duplicate rules remain
   - Cross-file references are accurate (e.g., "see 35-frontend-directory.md" links to correct file)
   - All rules have concrete examples where needed
   - Frontmatter is preserved

Only modify files that have fixes in the synthesis.`,
    { label: 'apply:frontend', phase: 'Phase 3: Apply', model: 'sonnet' }
  ),

  // Apply backend rules
  () => agent(
    `Task: Apply rule fixes to backend rule files.

Fix plan from synthesis:
${JSON.stringify(synthesis, null, 2)}

Files to modify:
- .claude/rules/backend/30-layered-architecture.md
- .claude/rules/backend/31-domain-modeling.md
- .claude/rules/backend/32-interface-contracts.md
- .claude/rules/backend/33-data-access.md
- .claude/rules/backend/34-error-handling.md
- .claude/rules/backend/35-security.md
- .claude/rules/backend/36-observability.md
- .claude/rules/backend/37-testing.md

For each file:
1. Read the current content
2. Apply ALL fixes from the synthesis that target this file
3. Ensure:
   - No duplicate rules across files (if 30 and 33 both cover data access, keep it in one place and cross-reference)
   - All "禁止" rules have a corresponding "正确做法" with code example
   - Error message format has concrete examples
   - Security rules have exact code patterns (not just "脱敏")
   - Frontmatter is preserved

Only modify files that have fixes in the synthesis.`,
    { label: 'apply:backend', phase: 'Phase 3: Apply', model: 'sonnet' }
  ),
])

// ============================================================
// Phase 4: Verify (1 agent)
// ============================================================
phase('Phase 4: Verify')

const verifyResult = await agent(
  `Task: Verify all rule files are consistent and well-structured.

Read ALL 16 rule files:
- .claude/rules/common/00-global.md
- .claude/rules/common/05-engineering.md
- .claude/rules/frontend/31-renderer.md
- .claude/rules/frontend/32-component-reuse.md
- .claude/rules/frontend/35-frontend-directory.md
- .claude/rules/frontend/36-frontend-testing.md
- .claude/rules/frontend/37-visual-style.md
- .claude/rules/frontend/38-animation.md
- .claude/rules/backend/30-layered-architecture.md
- .claude/rules/backend/31-domain-modeling.md
- .claude/rules/backend/32-interface-contracts.md
- .claude/rules/backend/33-data-access.md
- .claude/rules/backend/34-error-handling.md
- .claude/rules/backend/35-security.md
- .claude/rules/backend/36-observability.md
- .claude/rules/backend/37-testing.md

Check:
1. NO duplicate rules across files (same rule in multiple places)
2. ALL "禁止" rules have "正确做法" with code example
3. ALL cross-file references are valid (file exists)
4. NO contradictions between files
5. ALL frontmatter is present and correct
6. CONSISTENT formatting (## headings, - bullets, code blocks)

Return a verification report:
- PASS if all checks pass
- FAIL with list of remaining issues`,
  { label: 'verify', phase: 'Phase 4: Verify', model: 'sonnet' }
)

return {
  status: 'completed',
  findings: allFindings.length,
  verification: verifyResult,
}
