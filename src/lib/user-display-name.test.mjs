import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveUserDisplayName } from './user-display-name.mjs'

test('uses the profile name for the signed-in header', () => {
  assert.equal(resolveUserDisplayName({ name: '가상 사용자', nickname: '다른 이름' }), '가상 사용자')
})

test('falls back when auth metadata has no display name', () => {
  assert.equal(resolveUserDisplayName({}), '내 계정')
  assert.equal(resolveUserDisplayName(null), '내 계정')
})
