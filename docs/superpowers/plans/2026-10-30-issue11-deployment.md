# 이슈 11 배포 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preview에서 틈새의 배포 핵심 흐름을 확인한 뒤 Production 배포를 준비하고, README와 짧은 시연·검증 기록을 남긴다.

**Architecture:** 기존 Next.js App Router 앱과 현재 Supabase·Groq 구성을 유지한다. Preview/Production의 런타임 변수는 Vercel 환경 설정에 보관하고 Supabase URL 설정에 각 배포의 리다이렉트 주소를 등록한다. Preview 검증을 완료한 후 Production을 따로 배포한다.

**Tech Stack:** Next.js App Router, TypeScript, Supabase Auth/PostgreSQL, Groq, Vercel, GitHub PR.

**Spec:** `docs/spec.md` §2.1·§3·§9·§11, `docs/superpowers/specs/2026-10-30-issue11-deployment-design.md`, GitHub Issue #11.

## Global Constraints

- 핵심은 일정 확인 → 빈 시간 검색 → 후보 선택 → 등록 확인 → 실제 저장이다.
- AI가 후보나 일정 저장의 성공 여부를 결정하지 않는다. 저장은 서버·DB 응답으로 확인한다.
- 화면은 로그인한 본인 데이터 기준이며 등록된 일정 기준이라는 제한을 표시한다.
- 비밀값은 저장소·문서·로그·대화에 기록하지 않는다.
- 환경변수 예시는 이름만 기록하고, 실제 값은 Vercel 설정에서 손 대표님이 입력한다.
- 이번 작업은 배포·문서·시연 자료에 한정하며 DB 스키마와 제품 기능을 변경하지 않는다.
- 현재 Supabase 프로젝트를 쓰므로 Preview의 쓰기 검증은 같은 DB에 남길 수 있다. 사전 확인과 정리를 계획한다.
- Production 배포는 Preview 검증 후 진행하고, 공개 전 손 대표님의 최종 확인을 받는다.

## Review Focus

1. Preview 배포가 현재 PR 커밋에서 생성됐고 Preview 환경변수 범위를 사용한다 — 배포 상세의 브랜치·커밋과 Vercel 환경 설정 확인.
2. Supabase Redirect URLs가 Preview 및 Production의 `/auth/callback`을 허용하고 Kakao 로그인 후 Preview origin으로 돌아온다 — 실제 배포 브라우저 로그인 확인.
3. Preview에서 일정 조회·저장·새로고침 복원이 본인 계정 데이터에 반영된다 — 일정 하나 생성 후 재조회하고 불필요한 시험 일정을 정리한다.
4. AI의 후보·등록 확인·확정 결과가 실제 DB 상태와 일치하고 오류·한도 응답이 구분된다 — 대표 질문 실행과 저장 결과 확인.
5. 모바일에서도 핵심 흐름을 완료할 수 있다 — 390px 전후 뷰포트에서 달력·AI 패널 확인.

---

### Task 1: 배포 경로와 환경 설정 준비

**Files:**
- Read: `package.json`, `.env.example`, `src/components/kakao-sign-in-button.tsx`, `src/app/auth/callback/route.ts`
- Read: Vercel CLI 계정 및 프로젝트 목록 (환경변수 값은 읽지 않음)
- Modify: `.gitignore` to keep Vercel local project metadata out of Git

- [x] Vercel CLI 로그인은 확인했다. 현재 선택된 계정에 `teumsae` 프로젝트가 없고 저장소에도 local project link가 없다. 새 프로젝트 생성은 손 대표님 확인 후 진행한다.
- [x] 앱의 환경변수 이름만 확인했다: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `GROQ_API_KEY`, `GROQ_MODEL`. 실제 값은 읽지 않았다.
- [x] Preview와 Production 변수 범위를 구분해 문서화했다. 비밀값은 저장소에 추가하지 않는다.
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`를 실행해 배포 전 로컬 결과를 기록했다.

### Task 2: Preview 배포 및 인증 리다이렉트

**Files:**
- External settings: Vercel Preview environment, Supabase Auth URL configuration
- Read: Kakao developer redirect URI and Supabase Kakao provider callback configuration

- [ ] 새 Vercel project가 준비된 뒤 feature worktree에서 `vercel deploy`로 Preview를 만든다. `--prod`는 사용하지 않고 Git 자동 배포 연결은 Preview 확인 전 구성하지 않는다.
- [ ] 손 대표님이 Vercel 설정에 필요한 Preview 값을 직접 입력할 수 있도록 변수 이름·대상 환경·입력 위치를 안내한다. 값은 요청하거나 출력하지 않는다.
- [ ] Supabase Site URL을 Production origin으로 유지하고 Preview·Production 각각의 `/auth/callback` URL을 redirect allowlist에 추가하도록 안내한다. Preview wildcard는 해당 Vercel 팀 도메인으로 제한한다.
- [ ] Kakao OAuth redirect URI가 Supabase provider callback을 가리키는지 확인한다. 불필요하게 앱 Preview 주소로 교체하지 않는다.
- [ ] `docs/deployment-checklist.md`에 주소·환경변수 이름·검증 순서를 기록하되 비밀값과 개인 데이터는 기록하지 않는다.

### Task 3: Preview 흐름 확인 및 시연 자료 작성

**Files:**
- Create: `README.md` (완료)
- Create: `docs/deployment-checklist.md` (완료)
- Create: `docs/issue-11-demo-script.md` (완료)

- [ ] Preview에서 Kakao 로그인과 `/auth/callback` 복귀를 브라우저로 확인한다.
- [ ] 일정 확인, 수동 일정 저장·새로고침 복원, AI 일정 조회, 빈 시간 후보, 후보 선택, 등록 확인, 저장 후 달력 반영을 실제 배포 URL에서 확인한다.
- [ ] 모바일 화면에서 동일 핵심 흐름을 확인한다.
- [ ] Preview는 현재 Supabase DB를 쓰므로 시험용 일정·대화·미확정 제안이 생겼는지 확인하고, 일정은 완료 후 정리한다.
- [x] README에 프로젝트 개요, 실행·검증 명령, 환경변수 이름, 구현 범위·제한, 실제 통과한 기준 검사 결과를 기록했다. 배포 검증은 미실행으로 표시했다.
- [x] 시연 문서에 대표 요청과 확인할 화면 순서를 적었다. 배포 URL 확인은 미실행으로 표시했다.
- [ ] 이슈의 “확인 메일” 항목은 Kakao 로그인/리다이렉트 실제 검증으로 대체했음을 검증 기록에 명시한다.

### Task 4: Production 공개 준비

**Files:**
- External settings: Vercel Production environment, Supabase production Site URL/redirect allowlist
- Update: `README.md`, `docs/deployment-checklist.md`, `docs/issue-11-demo-script.md`

- [ ] Preview 검사 결과와 남은 제한을 요약해 손 대표님께 보여준다.
- [ ] Preview 핵심 흐름이 확인된 후 Production 환경변수 이름·대상 환경을 대조한다. 값은 Vercel 내부 설정에서 확인하고 채팅이나 로그에는 출력하지 않는다.
- [ ] PR 병합과 손 대표님의 최종 공개 확인 뒤, 최신 `main`에서 `vercel --prod`로 Production 배포를 진행한다.
- [ ] Production URL에서 로그인 및 핵심 일정 흐름을 확인하고, Preview와 다른 설정·응답을 구분해 기록한다.
- [ ] README와 시연 자료를 실제 확인 결과로 갱신한다.

## 실행 제한

- 외부 계정·DB·AI 실제 실행은 배포 환경 및 손 대표님의 지정 테스트 계정으로만 한다.
- 손 대표님이 Vercel 환경변수 값을 직접 등록한다. 이 작업은 값에 접근하지 않는다.
- 브라우저 직접 확인은 손 대표님이 수행하며, 결과를 전달받으면 문서화한다.
- Production 배포는 Preview 검증을 보여준 뒤 최종 공개 확인을 받은 후에만 한다.

**Baseline evidence:** `.nvmrc` Node 24.22.1에서 `pnpm typecheck`, `pnpm lint`, `pnpm test` (111/111), `pnpm build` 모두 통과. 의존성은 frozen lockfile로 설치했고 lockfile은 바뀌지 않았다. 실행 중 제한·결정은 `docs/superpowers/ledgers/2026-10-30-issue11-deployment.md`에 기록한다.
