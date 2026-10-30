import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migrationUrl = new URL('../../supabase/migrations/202610300002_ai_usage_rate_limit.sql', import.meta.url)

test('AI usage migration keeps only the per-minute request limit', () => {
  const sql = readFileSync(migrationUrl, 'utf8')
  const functionSql = sql.slice(sql.indexOf('create or replace function'), sql.indexOf('revoke all'))
  assert.match(functionSql, /scope\s*=\s*'user_minute'/i)
  assert.match(functionSql, /coalesce\(minute_count,\s*0\)\s*>=\s*3/i)
  assert.doesNotMatch(functionSql, /user_day|project_day|>=\s*(15|100)/i)
  assert.match(sql, /delete from public\.ai_usage where scope in \('user_day', 'project_day'\)/i)
})
