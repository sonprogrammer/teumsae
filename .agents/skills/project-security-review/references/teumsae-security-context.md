# 틈새 보안 리뷰 기준

이 문서는 프로젝트 고유의 경계와 위험 지점을 정리한다. 현재 상태를 보증하는 감사 결과가 아니다. 리뷰 때 실제 파일과 배포 구성을 다시 확인한다.

## 기술과 코드 경로

- 웹: Next.js App Router, TypeScript, React. 정확한 버전은 `package.json`과 `pnpm-lock.yaml`에서 확인한다.
- 인증·DB: Supabase Auth, `@supabase/ssr`, PostgreSQL. 브라우저·서버 클라이언트와 OAuth 콜백은 `src/lib/supabase/`, `src/app/auth/callback/route.ts`에 있다.
- 요청 경계: `src/app/api/**/route.ts`, `src/app/schedule/actions.ts`, `src/proxy.ts`. Proxy matcher는 인증·권한을 대신하지 않는다. 각 데이터 변경 경로를 독립적으로 확인한다.
- 데이터 권한: `supabase/migrations/`의 RLS, grants, RPC·trigger 함수가 기준이다. 코드의 소유자 필터만으로 실제 DB 권한이 검증된 것은 아니다.
- AI: `src/app/api/chat/route.ts`와 `src/lib/assistant-tools.ts`에서 모델 입력·도구 호출을 처리한다. 모델 출력과 도구 인자는 신뢰 경계 밖의 입력으로 취급한다.
- 화면: React Markdown은 `src/components/assistant-panel.tsx`에서 렌더링된다. 렌더러 설정과 링크 URL 처리, 원시 HTML 삽입 여부를 함께 확인한다.

## 프로젝트별 보안 기준

### 인증, 토큰, 세션

- Supabase Auth는 토큰 발급·갱신을 담당하고 `@supabase/ssr`는 앱의 쿠키 세션 저장을 처리한다. 저장 위치와 `HttpOnly`, `SameSite`, `Secure`, 도메인·만료 속성은 앱 설정과 설치된 라이브러리 기본값을 구분해 확인한다.
- `HttpOnly`를 무조건 켜라고 권고하지 않는다. 브라우저 Supabase 클라이언트가 세션을 읽고 갱신하는 구조와 충돌할 수 있으므로 현재 아키텍처와 요구사항을 먼저 확인한다.
- 서버의 사용자 판별은 검증된 claim/user 경로를 확인한다. 클라이언트 전역 상태, 전달된 `userId`, `getSession()`의 사용자 객체만으로 권한을 부여하지 않는다.
- `NEXT_PUBLIC_*`와 Supabase publishable key는 브라우저에서 보이는 값이다. Supabase service-role key, AI 제공자 키 등 비밀값은 서버 경로에만 있어야 한다.

### API, Server Actions, CSRF

- 모든 Route Handler와 Server Action의 입력을 런타임에 검증하고, 상태 변경 경로마다 인증과 리소스 소유권을 확인한다. TypeScript 타입은 런타임 검증이 아니다.
- 쿠키 인증 상태 변경 API의 HTTP 메서드, `SameSite`, Origin/Referer 또는 CSRF token 검증, CORS를 함께 확인한다. `SameSite=Lax`, 로그인 확인, RLS 중 하나만으로 CSRF 방어가 완성됐다고 보지 않는다.
- OAuth callback·redirect 값은 허용된 목적지로 제한한다. 요청 Host에서 생성한 URL을 신뢰할 때는 배포 프록시와 trusted-host 설정도 확인한다.

### Supabase DB와 사용자별 데이터

- 사용자 테이블별 RLS 활성화, 정책의 `auth.uid()` 소유자 제한, 권한 grants를 확인한다. 일정·설정·대화·후보·제안·사용량 데이터의 계정 간 경계를 각각 점검한다.
- `SECURITY DEFINER` 함수는 소유자 결정을 `auth.uid()`에 연결하고, 임의 소유자 ID 입력을 허용하지 않으며, 안전한 `search_path`, 최소 `EXECUTE` grants, 행 단위 소유권 검사를 갖는지 확인한다.
- 브라우저에서 직접 DB를 호출하는 경로와 API를 거치는 경로를 구분한다. 실제 RLS·권한 주장은 테스트 DB에서 익명 사용자와 두 계정으로 확인하기 전에는 미검증으로 분류한다.
- 사용자별 TanStack Query key와 응답 캐시가 계정 경계를 나누고 로그아웃 시 정리되는지 확인한다. 개인 응답이 공유·정적 캐시에 들어가지 않아야 한다.

### XSS, AI 데이터, 로그

- React의 기본 텍스트 이스케이프, Markdown의 원시 HTML 처리, `dangerouslySetInnerHTML`, URL scheme, 직접 DOM sink를 구분해서 검토한다. 문자열 검색만으로 전체 XSS 안전을 확정하지 않는다.
- 일정 제목·메모·대화와 모델 응답은 사용자 제어 데이터다. 모델이 선택한 도구, 날짜·시간, 후보 ID, 소유자를 그대로 권한 근거로 사용하지 않고 서버 데이터와 검증 결과에 묶어야 한다.
- AI/API 오류 로그와 테스트 증거에 일정 제목·메모·대화 원문, 세션 값, 토큰, 키를 남기지 않는다. `.env.local` 내용을 출력하지 않는다.

## 증거 구분

| 증거 | 말할 수 있는 내용 | 이것만으로 말할 수 없는 내용 |
| --- | --- | --- |
| 코드·마이그레이션 검토 | 저장소에 명시된 검사와 정책의 존재 | 배포 응답의 쿠키·헤더, 원격 DB 권한이 실제 적용됐다는 주장 |
| 자동 테스트·모의 API | 해당 코드 경로의 결정론적 동작 | 실제 Supabase RLS, OAuth, 계정 간 격리 |
| 로컬 브라우저·테스트 DB | 관찰한 환경에서의 결과 | 운영 배포·인프라 설정까지 같은 결과라는 주장 |
| 배포 URL·실제 테스트 계정 | 그 시점의 응답 헤더, 쿠키, 계정 결과 | 포괄적인 침투 테스트나 미래 구성의 보증 |
