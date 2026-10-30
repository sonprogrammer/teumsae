# 이슈 11 실행 기록

- 브랜치: `feat/issue11-deployment`
- 워크트리: `../teumsae-worktrees/issue-11-deployment`
- 기준 커밋: `6825951` (PR #40 병합 후 `main`)
- Node: `.nvmrc`의 `24.22.1`; nvm은 설치돼 있으나 현재 셸 초기화에 포함되지 않아 `nvm.sh`를 직접 불러 사용함.

## 기준 검사

- `pnpm install --frozen-lockfile`: 통과. lockfile 변경 없음. 기존 pnpm store 패키지 재사용.
- `pnpm typecheck`: 통과. 첫 시도는 샌드박스가 워크트리의 `tsconfig.tsbuildinfo` 쓰기를 거부해 중단됐고, 권한 승인 후 동일 명령 재실행 통과.
- `pnpm lint`: 통과.
- `pnpm test`: 통과, 111/111.
- `pnpm build`: 통과, Next.js 16.4.3 프로덕션 빌드.

## 결정 및 미확인 항목

- Ruling: Preview는 기존 Supabase 프로젝트를 사용한다 — 손 대표님이 새 테스트 프로젝트 대신 현재 프로젝트 DB를 사용한다고 지정함 — 잘못 판단하면 Preview 검증 데이터가 실제 사용자 DB에 기록될 수 있음.
- Ruling: 확인 메일 검사는 Kakao 로그인·리다이렉트 검증으로 대체한다 — 현재 제품은 Kakao 로그인 흐름을 사용함 — 이메일 확인 흐름이 실제로 요구된다면 이 검사는 누락될 수 있음.
- Vercel CLI 인증은 가능하다. 현재 선택된 계정에는 `teumsae` project가 없고 `.vercel/project.json`도 없다. 새 프로젝트 생성은 승인 대기다.
- 리뷰: 독립 문서 리뷰에서 Supabase redirect allowlist에 callback 경로를 명시하라는 지적을 반영해 Preview·Production 각각의 `/auth/callback` 설정을 분명히 했다.
- Vercel: CLI authentication is available; the selected account contains no `teumsae` project and the worktree has no project link. Creating a new external project awaits owner approval. `.vercel/` is ignored in this branch to keep local project metadata out of Git.
- 리뷰: 독립 문서 리뷰에서 접근 방식이 PR Preview와 CLI Preview를 혼용한 점을 지적해, 현재 프로젝트 부재에 맞는 CLI Preview 경로로 통일했다.
