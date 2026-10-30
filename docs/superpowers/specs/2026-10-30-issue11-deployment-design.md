# 이슈 11 배포 설계

- 상태: 손 대표님 승인
- 기준일: 2026-10-30
- 범위: GitHub 이슈 #11 — 금요일 실사용 배포·README·시연 자료 마무리

## 의도와 목표

틈새의 핵심 일정 흐름을 배포 주소에서 직접 확인하고, 검증된 결과와 현재 제한을 README 및 짧은 시연 자료로 남긴다. 로그인·일정 저장·AI 응답이 실제로 동작하는 배포 가능한 첫 버전을 만드는 것이 목표다.

## 접근 방식

1. **Vercel CLI로 Preview 배포 후 Production 배포 (선택)**: 현재 계정에 프로젝트가 없고 Git 연동도 없으므로 Preview 검증 전에 자동 Production 배포가 시작되지 않도록 feature worktree에서 CLI로 Preview를 배포한다. 핵심 흐름 확인과 PR 병합 뒤 최신 `main`에서 Production 배포한다.
2. 바로 Production 배포: 단계가 짧지만 리다이렉트·환경변수 설정 오류가 즉시 공개 사용자에게 영향을 줄 수 있어 선택하지 않는다.

## 결정된 설계

- Vercel project가 이미 연결되어 있으면 자동 Preview를 사용한다. 현재 Vercel 계정에는 `teumsae` project가 없고 repository link도 없으므로, 새 project 생성 여부를 확인한 뒤 안전한 Preview 배포 경로를 정한다. Preview 확인 전 Git 자동 배포를 연결하지 않아 `main`이 먼저 Production으로 배포되는 일을 막는다.
- Vercel 환경변수는 Vercel 설정에 등록한다. 앱에 필요한 이름은 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `GROQ_API_KEY`, 선택값 `GROQ_MODEL`이다. 값은 저장소나 문서에 기록하지 않는다.
- 로그인 버튼은 현재 브라우저 origin의 `/auth/callback`을 `redirectTo`로 전달하고, 이 경로에서 Supabase 세션을 교환한다. Supabase Redirect URLs에는 Preview와 Production 각각의 `/auth/callback`을 허용한다. Preview 주소가 바뀌면 Vercel 팀 도메인에 한정된 wildcard를 사용하고 Production callback은 정확한 URL로 등록한다. Site URL은 Production origin으로 둔다. Kakao 개발자 설정의 OAuth redirect URI는 Supabase의 Kakao provider callback을 사용하므로 앱 도메인으로 바꾸지 않고 기존 연결이 유효한지 확인한다.
- Preview와 Production은 손 대표님이 지정한 현재 Supabase 프로젝트를 사용한다. 따라서 Preview 검증으로 생성된 일정·대화·대기 제안이 같은 DB에 기록되고 실제 AI 요청량도 소비한다. 임시 데이터 생성과 정리 여부를 체크리스트에 포함한다.
- 현재 앱은 Kakao 로그인 중심이며 이메일 로그인을 제공하지 않는다. 이슈의 “확인 메일” 항목은 이메일 확인 메일 발송으로 해석하지 않고 Kakao 로그인 및 배포 주소 리다이렉트 확인으로 대체한다.
- Preview 검증을 통과한 뒤 Production 배포를 준비한다. Production 공개 직전에는 배포 결과와 검증 증거를 손 대표님께 제시하고 최종 공개를 확인받는다.
- README에는 로컬 실행법, 환경변수 이름, 핵심 흐름, 구현 범위·제한, 검증 결과를 기록한다. 별도 시연 순서 문서에는 대표 요청, 예상되는 화면 흐름, 실제 확인 결과만 기록한다.

## 범위 밖

- 새 Supabase 프로젝트 생성, DB 스키마·인증 제공자 변경, 서비스 기능 추가.
- 커스텀 도메인 구매, 새로운 OAuth 제공자 도입.
- 운영 비밀값을 채팅·파일·Git에 전달하거나 기록.
- 확인하지 않은 결과를 통과했다고 README나 시연 자료에 기재.

## 남은 구현 판단

2026-10-31 기준 CLI 인증은 되어 있으나 현재 선택된 계정의 프로젝트 목록에 `teumsae`가 없고 저장소에도 local project link가 없다. 새 Vercel project 생성은 손 대표님 확인 후 진행한다. 프로젝트가 준비되면 feature worktree에서 `vercel deploy`로 Preview를 배포하고 `--prod`는 사용하지 않는다. Preview/Production 환경변수 값은 손 대표님이 대시보드에서 직접 입력한다.

## 구현 참고

- Vercel Preview/Production 배포: https://vercel.com/docs/git
- Vercel 환경변수 범위: https://vercel.com/docs/environment-variables
- Supabase 로그인 리다이렉트 설정: https://supabase.com/docs/guides/auth/redirect-urls
