# 일정 최신 상태 표시 구현 계획

> **실행 방식:** 이 세션에서 직접 구현합니다.

**목표:** 일정 화면에 마지막 확인 시각과 수동 새로고침을 제공하고, 탭 복귀 시 오래된 일정 조회를 갱신한다.

**구조:** `RealSchedule`의 현재 기간 조회만 창 복귀 시 재조회 대상으로 설정한다. Query 캐시의 `dataUpdatedAt`을 화면에 표시하고, 같은 조회의 `refetch`를 버튼과 연결한다. 요청 실패 시 Query가 보유한 기존 데이터를 유지한다.

**기술:** Next.js App Router, React, TanStack Query, Lucide React, Node test runner.

**요구사항:** GitHub issue #68 및 `docs/spec.md` §4~6.

## 전역 제약

- 데이터 조회 범위는 현재 달력의 주/월 범위로 한정한다.
- Realtime 구독과 폴링을 추가하지 않는다.
- 기존 캐시를 새로고침 실패로 지우지 않는다.
- 한국 시간으로 시각을 표시한다.

## 검토할 실패 조건

- 첫 데이터 조회 중에는 잘못된 확인 시각을 표시하지 않는다.
- 기존 데이터가 있는 상태에서 갱신 실패 시 일정 목록과 재시도 경로를 유지한다.
- 연속 클릭으로 중복 요청하지 않는다.
- 모바일 폭에서도 시각과 버튼이 달력 영역을 넘치지 않는다.

---

### 작업 1: 확인 시각 표시와 새로고침 제어

**파일:** `src/components/real-schedule.tsx`, `src/app/globals.css`, `src/lib/schedule-refresh-status.mjs`

**테스트:** `src/lib/schedule-refresh-status.test.mjs`, `src/lib/real-schedule-refresh.test.mjs`

- [x] 확인 시각이 한국 시간으로 표시되고 미조회 상태를 구분하는 테스트를 먼저 추가해 실패를 확인한다.
- [x] 주/월 범위 조회에 `refetchOnWindowFocus: 'always'`를 설정하고 확인 시각을 `dataUpdatedAt`으로 렌더링한다.
- [x] 현재 범위의 `refetch` 버튼을 배치하고, 요청 중 비활성화·아이콘 상태·오류 안내를 구현한다.
- [x] 좁은 모바일 폭 레이아웃과 접근성 이름을 CSS/소스 테스트로 검증한다.

### 작업 2: 검증

- [x] 관련 테스트를 실행해 실패와 통과를 확인한다.
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`를 실행한다.
- [x] 데스크톱·모바일 브라우저 확인 항목을 정리한다. 실제 브라우저/다른 기기 검증은 사용자가 수행할 수 있도록 코드 검사와 구분한다.
