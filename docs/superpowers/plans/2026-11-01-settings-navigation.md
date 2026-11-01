# 설정 화면 탐색 구현 계획

> **작업자 안내:** 구현 단계별 진행에는 `superpowers:executing-plans`를 사용한다. 각 단계는 체크박스로 관리한다.

**목표:** 데스크톱과 모바일에서 설정을 범주별로 찾을 수 있게 하고, 모바일 일정 불가일 입력과 푸시 알림 토글을 개선한다.

**구조:** `/schedule/settings`와 기존 설정 API를 유지한다. 선택한 범주를 관리하는 클라이언트 탐색 컴포넌트에서 두 상세 패널을 계속 마운트해 범주를 바꿔도 작성 중인 값이 보존되게 한다. 푸시 알림 구독과 저장 로직은 `PushReminderSettings`에 두고, 기존 버튼을 접근 가능한 제어형 스위치로 교체한다.

**기술:** Next.js App Router 16.4.3, React 19, TypeScript, 기존 CSS, Node 테스트 러너, PostCSS 파서, Playwright.

**설계 문서:** `docs/superpowers/specs/2026-11-01-settings-navigation-design.md`

## 공통 제약

- `package.json`에 선언된 Node `>=24 <25`와 pnpm을 사용한다.
- 기존 코드 스타일을 지킨다. trailing comma와 불필요한 빈 줄을 피하고, 구조분해 props는 가능한 한 줄로 쓴다.
- `/schedule/settings`, API 계약, 저장 데이터, 알림 권한·구독 동작을 유지한다.
- 기존 서버 동작이 확인하기 전에는 DB 저장이나 푸시 설정 성공으로 안내하지 않는다.
- 코드 수정 전에 `node_modules/next/dist/docs/`의 Next.js 16.4.3 관련 문서를 읽는다.

## 특히 확인할 조건

- 320~390px 폭에서 시작일·종료일 입력이 잘리거나 가로 넘침을 만들지 않는다. CSS/소스 테스트와 모바일 브라우저 확인으로 검증한다.
- 모바일에서 상세 → 목록 → 상세로 이동해도 저장 전 편집값이 남는다. 상세 컴포넌트를 유지하고 선택 표시 동작을 검증한다.
- 브라우저 알림 권한을 거부하거나 닫으면 토글이 켜지지 않고 복구 안내를 보여준다. 토글 상태 계약을 검사하고, 권한을 제어할 수 있으면 브라우저에서 확인한다.
- 지원하지 않는 브라우저는 현재 안내를 유지한다. VAPID 키가 없을 때 켜기 요청이 성공처럼 보이지 않고 기존 설정 오류를 보여준다.
- 저장이나 구독 요청 실패 시 알림이 켜졌다고 잘못 표시하지 않으며, 요청 중에는 중복 조작을 막는다. 소스 검사와 가능한 브라우저 오류 흐름으로 확인한다.

---

### Task 1: 설정 범주 탐색과 불가일 입력 반응형 처리

**파일:**
- 생성: `src/components/settings-navigation.tsx`
- 수정: `src/app/schedule/settings/page.tsx`
- 수정: `src/components/availability-settings.tsx`
- 수정: `src/app/globals.css`
- 테스트: `src/lib/availability-settings-ui.test.mjs`
- 테스트: `src/lib/responsive-event-form.test.mjs`

**인터페이스:**
- 사용: `AvailabilitySettings({ userId }: { userId: string })`; `PushReminderSettings({ userId }: { userId: string })`.
- 제공: `SettingsNavigation({ userId }: { userId: string })`. 선택 범주는 `schedule` 또는 `reminders`다.

- [x] **1단계: 범주 탐색·모바일 날짜 입력 실패 테스트 작성**
  두 범주의 이름, 모바일 상세 목록 복귀 조작, 마지막 선택 범주 유지, 기존 설정 패널 연결을 검사한다. `(max-width: 480px)`에서 불가일 폼이 고정 최소 너비 없이 한 열을 쓰는지 검사한다.
- [x] **2단계: 새 테스트가 실패하는지 확인**
  실행: `node --test src/lib/availability-settings-ui.test.mjs src/lib/responsive-event-form.test.mjs`
  예상: 새 탐색·날짜 레이아웃 검사만 실패한다.
- [x] **3단계: 클라이언트 탐색 컴포넌트와 모바일 날짜 레이아웃 구현**
  접근 가능한 선택 상태를 갖는 범주 메뉴를 추가한다. 데스크톱은 메뉴와 상세를 함께 표시한다. 모바일은 범주 목록에서 시작하고 상세를 열며, 뒤로 가기 조작으로 목록에 복귀한다. 비활성 패널을 접근성 트리에서 숨기되 마운트 상태를 유지해 편집값을 보존한다. 불가일 폼은 모바일에서 전체 너비의 날짜 입력과 읽기 쉬운 추가 순서를 사용한다.
- [x] **4단계: 관련 테스트 통과 확인**
  실행: `node --test src/lib/availability-settings-ui.test.mjs src/lib/responsive-event-form.test.mjs`
  예상: 통과한다.

### Task 2: 접근 가능한 푸시 알림 스위치

**파일:**
- 수정: `src/components/push-reminder-settings.tsx`
- 수정: `src/app/globals.css`
- 테스트: `src/lib/push-reminders.test.mjs`
- 테스트: `src/lib/responsive-event-form.test.mjs`

**인터페이스:**
- 사용: 기존 `enableReminders()`, `disableReminders()`, `settings.enabled`, `pending`, 브라우저 지원·권한 상태.
- 제공: 저장된 `settings.enabled`에 `aria-checked`가 연결된 접근 가능한 `role="switch"` 컨트롤. 처리 중 비활성화한다.

- [x] **1단계: 스위치 의미와 상태 보호 실패 테스트 작성**
  스위치 이름, `settings.enabled`와 연결된 상태, 처리 중 비활성화, 미지원 브라우저·VAPID 누락 시 성공 상태를 가장하지 않는 오류 안내를 검사한다.
- [x] **2단계: 새 테스트가 실패하는지 확인**
  실행: `node --test src/lib/push-reminders.test.mjs src/lib/responsive-event-form.test.mjs`
  예상: 새 스위치 검사만 실패한다.
- [x] **3단계: 기존 버튼을 제어형 스위치로 교체**
  기존 켜기·끄기 함수를 재사용한다. 브라우저 권한 요청, VAPID 검증, 구독 저장·삭제, 알림 시점 설정, 오류 안내를 유지한다. 처리 중 상태를 보여주고 중복 조작을 막는다. 미지원 브라우저는 기존 안내를 유지하며, VAPID가 없으면 기존처럼 켜기 오류를 안내하고 켜진 상태로 표시하지 않는다.
- [x] **4단계: 관련 테스트 통과 확인**
  실행: `node --test src/lib/push-reminders.test.mjs src/lib/responsive-event-form.test.mjs`
  예상: 통과한다.

### Task 3: 전체 검사와 반응형 흐름 확인

**파일:**
- 검증: 설정 탐색, 불가일 입력, 알림 스위치, 관련 테스트.

- [x] **1단계: 프로젝트 검사 실행**
  실행: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`.
  예상: 모두 성공 종료한다.
- [ ] **2단계: 데스크톱·모바일 설정 흐름 확인**
  가능한 경우 인증된 로컬 환경에서 데스크톱 범주 선택, 모바일 목록 → 상세 → 뒤로, 320px·390px 입력 레이아웃, 알림 켜기·끄기, 처리 중 상태, 권한·설정 오류 복구를 확인한다. 인증이나 배포 설정이 없어 확인하지 못한 브라우저 동작은 별도로 보고한다.
  이 작업에서는 실제 계정 설정을 열지 않았으며 인증 브라우저 검증은 실행하지 않았다. 사용자가 로컬 브라우저에서 확인할 항목으로 남긴다.
- [x] **3단계: 변경 파일과 diff 확인**
  실행: `git diff --check` 및 `git status --short`.
  예상: 공백 오류가 없고 설계·계획 및 설정 화면 관련 파일만 변경되어 있다.
