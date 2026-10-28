# 클라이언트 상태와 일정 캐시 구현 계획

## 범위
`docs/superpowers/specs/2026-10-28-client-state-cache-design.md`의 결정대로 Zustand와 TanStack Query를 구성하고 실제 일정 읽기 흐름에 적용한다.

## 작업
- [ ] 설치된 TanStack Query 기본 설정과 사용자·기간별 일정 쿼리 키에 대한 실패 테스트를 추가한다.
- [ ] QueryClient 생성기와 일정 query key를 구현하고 캐시 재사용·무효화를 검증한다.
- [ ] Next.js App Router용 QueryClient·Zustand provider를 구성하고 프론트엔드 지침을 갱신한다.
- [ ] 서버 페이지의 일정 조회를 인증 확인만 남기고, 일정 목록을 RLS 적용 브라우저 쿼리로 이동한다.
- [ ] Server Action 성공 후 캐시를 무효화하고 불필요한 경로 재검증·라우터 새로고침을 제거한다.
- [ ] Zustand에 폼 생성·편집 UI 상태를 두고 로그아웃 시 서버 캐시와 함께 초기화한다.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`를 실행하고 네트워크·DB 동작의 제한을 기록한다.
