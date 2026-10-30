# 이슈 10 검증 실행 안내

## 일반 E2E

Node 24(`nvm use`)와 pnpm을 사용한다. Playwright 브라우저는 최초 1회 설치한다.

```sh
pnpm exec playwright install chromium
pnpm test:e2e
```

`sample-desktop`·`sample-mobile`은 `/` 샘플 일정으로 후보 선택, 화면에만 반영되는 등록, 새로고침 초기화, 키보드 닫기를 확인한다. 실제 로그인·DB 저장 검증이 아니며 그 차이를 결과에 표시한다.

## 로그인된 UI E2E

실제 앱의 `/schedule`은 유효한 로그인 세션이 필요하다. **전용 테스트 Supabase 프로젝트와 테스트 계정**으로 로컬 개발 서버를 실행한 뒤 세션 파일을 저장한다. 파일은 Git 저장소 바깥 경로를 사용한다.

```sh
pnpm dev
TEUMSAE_E2E_AUTH_STATE=/private/tmp/teumsae-e2e-user-a.json pnpm test:e2e:auth
TEUMSAE_E2E_AUTH_STATE=/private/tmp/teumsae-e2e-user-a.json pnpm test:e2e
```

세션 파일에는 로그인 쿠키가 들어간다. 공유·커밋하지 않는다. 인증 E2E는 일정 조회와 대화 응답을 브라우저에서 통제해, 후보 → 등록 확인 → 저장 완료 표시 → 새로고침 복원을 검증한다. 이 테스트는 DB 쓰기나 실제 AI 요청을 하지 않는다.

## 실제 DB 권한·동시성 검사

실제 이벤트를 만들고 삭제하므로 테스트 프로젝트에서만 실행한다. 테스트 사용자가 소유한 일정 중 이 테스트의 임시 일정 제목과 겹치는 데이터가 없어야 한다. A·B는 서로 다른 테스트 사용자다.

```sh
TEUMSAE_E2E_AUTH_STATE=/private/tmp/teumsae-e2e-user-a.json \
TEUMSAE_E2E_USER_B_STATE=/private/tmp/teumsae-e2e-user-b.json \
TEUMSAE_E2E_ALLOW_DATABASE_WRITES=YES \
pnpm test:e2e
```

이 실행은 A 계정에서 임시 일정을 등록하고 B 계정에서 숨겨지는지 확인한 뒤, A의 두 탭에서 같은 시간을 동시에 등록해 DB가 하나만 허용하는지 확인하고 테스트 일정을 삭제한다. 실패·프로세스 중단 시 임시 일정이 남을 수 있으므로 테스트 캘린더를 확인한다.

## 실제 AI 평가

전용 테스트 DB에 연결된 개발 서버와 그 DB 전용 로그인 세션이 필요하다. 고정 질문 15개가 대화·후보·미확정 등록 제안을 생성하고 Groq 요청을 보낸다. 일정 저장 확인 버튼은 누르지 않는다. 분당 사용량과 DB의 테스트 대화·대기 제안이 늘어나므로 일반 테스트와 분리한다.

```sh
TEUMSAE_EVAL_BASE_URL=http://localhost:3000 \
TEUMSAE_EVAL_AUTH_STATE=/private/tmp/teumsae-e2e-user-a.json \
TEUMSAE_EVAL_ALLOW_DATABASE_WRITES=YES \
pnpm test:ai-eval
```

결과는 `test-results/ai-evaluation-<시간>.json`에 저장한다. 질문·응답 문장, 일정 제목·메모, 인증값은 기록하지 않는다. 결과에는 케이스 ID, 도구 인자 요약·도구 결과 요약, 카드 종류·제안 상태, 토큰 수, 모델, 프롬프트 소스 해시가 들어간다. AI 응답이 불안정할 수 있으므로 실패도 그대로 기록하고 원인을 수정한 뒤 다시 평가한다.

동일 요청의 동시 확인을 실제 AI와 DB로 검증하려면 아래처럼 명시적으로 켠다. 등록 후 테스트 일정은 테스트 계정 달력에서 정리한다.

```sh
TEUMSAE_E2E_AUTH_STATE=/private/tmp/teumsae-e2e-user-a.json \
TEUMSAE_E2E_ALLOW_DATABASE_WRITES=YES \
TEUMSAE_E2E_LIVE_AI=YES \
pnpm test:e2e --project=live-ai-integrity
```

## 검사 결과 기록

- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`: 로컬 고정 검사.
- `pnpm test:e2e`의 sample 프로젝트: 샘플 브라우저 검사.
- authenticated-flow: 로그인 화면 통합 검사, DB 쓰기 없음.
- database-integrity: 실제 테스트 DB 검사, 사용자 격리·동시성.
- `pnpm test:ai-eval`: 실제 AI 평가. 고정 테스트나 CI 결과와 합산하지 않는다.
- Kakao 로그인을 포함한 인증 세션 생성은 실제 브라우저 검증으로 별도 보고한다.
