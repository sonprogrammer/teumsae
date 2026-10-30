# 틈새 저장소 작업 지침

## 작업 범위
- 제품 기준은 `docs/spec.md`다. 확정된 요구사항과 제안을 구분한다.
- 승인된 이슈나 PR의 범위 안에서 작업하고 기존 파일과 Git 변경사항을 보존한다.
- 기능마다 별도 브랜치에서 개발하고 CI가 통과한 PR로 검토한다. `main`에 기능을 직접 추가하지 않는다.
- 코드·문서·스킬을 변경하는 작업은 원본 checkout에서 직접 하지 않는다. 원본 checkout의 현재 브랜치와 변경사항을 보존하고, 저장소 형제 경로 `../teumsae-worktrees/<작업명>`에 전용 worktree를 만들어 작업한다.
- 작업 전 `git status`, `git worktree list`, 브랜치 목록을 확인한다. 같은 작업 브랜치와 worktree가 있으면 상태를 확인해 재사용하고, 경로나 브랜치가 겹치면 덮어쓰거나 강제로 바꾸지 않는다.
- worktree 생성이 막히면 원본 checkout에서 계속 작업하지 않는다. 원인을 보고하고 사용할 수 있는 별도 허용 경로를 확인한다. 사용자의 기존 변경을 stash·삭제·덮어쓰지 않는다.
- 병렬 에이전트가 파일을 수정하면 에이전트별로 별도 worktree를 사용한다. 읽기 전용 조사에는 worktree가 필요하지 않다.
- 샘플 화면 상태와 로그인 계정의 DB 데이터를 구분한다. 샘플 동작을 DB에 저장됐다고 안내하지 않는다.
- AI, MCP, 노트는 해당 작업 범위에 명시된 경우에만 다룬다.

## 프로젝트 스킬
- 일정 UI, 달력, 폼, AI 패널 작업에는 `.agents/skills/teumsae-frontend/SKILL.md`를 사용한다.
- 인증, DB, 시간 계산, API 작업에는 `.agents/skills/teumsae-backend/SKILL.md`를 사용한다.
- 기능 검증 계획이나 PR 리뷰에는 `.agents/skills/teumsae-qa/SKILL.md`를 사용한다.
- 보안 리뷰 요청에는 `.agents/skills/project-security-review/SKILL.md`를 사용한다.
- 작업에 해당하는 스킬만 읽는다. 제품 규칙의 원본은 `docs/spec.md`다.

## 코드 스타일
- 기존 프로젝트 관례를 우선하고 현재 작업에 필요한 구조와 의존성만 추가한다.
- 불필요한 빈 줄과 trailing comma를 피한다.
- 함수·컴포넌트의 구조분해 props 매개변수는 가능한 한 줄로 작성한다.
- 비밀값을 커밋하거나 환경변수 값을 출력하지 않는다.

## 외부 커뮤니케이션
- GitHub 이슈·PR 설명·리뷰·코멘트 등 사용자에게 남기는 글은 한글로 작성하고 Markdown 형식을 사용한다.
- 코드 식별자, 명령어, 파일 경로, 공식 제품명은 필요하면 원문 표기를 유지한다.

## 검증
- 변경에 맞는 검사를 실행한다. 해당하면 `test`, `typecheck`, `lint`, `build`를 실행하고 실제 결과를 보고한다.
- 로컬 검사, GitHub Actions 검사, 실제 서비스 검사를 구분한다. 미실행 검사를 통과했다고 표현하지 않는다.
- 화면을 변경했다면 영향받는 흐름을 데스크톱과 모바일에서 확인한다.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
