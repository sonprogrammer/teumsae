
<h1>
  <img
    width="72"
    height="60"
    alt="틈새 로고"
    src="https://github.com/user-attachments/assets/309a63d8-6e8c-4612-a3df-e7e2c02bc7dc"
    style="vertical-align: middle; margin-right: 8px;"
    align="bottom";
  />
  틈새 (Teumsae)
</h1>

개인 일정을 바탕으로 빈 시간을 찾고, AI가 준비한 일정 후보를 확인한 뒤 저장하는 개인용 AI 스케줄러입니다.

> **배포 상태:** [Production 배포 완료](https://teumsae-blush.vercel.app/). 실제 로그인·DB·AI 핵심 흐름의 검증 결과는 배포 체크리스트에 기록합니다.

## 주요 흐름

1. 카카오 계정으로 로그인해 내 일정을 확인합니다.
2. AI에게 날짜별 일정이나 빈 시간을 물어봅니다.
3. 제안된 후보를 선택하거나 원하는 시간을 직접 지정합니다.
4. 등록 확인 카드에서 제목·날짜·시간을 확인합니다.
5. 확인을 누르면 서버가 다시 충돌을 확인하고 DB에 저장합니다.

일정 직접 등록·조회·수정·삭제, 주간·월간 달력, 날짜별 일정 목록, 스케줄 가능 시간 설정을 지원합니다. AI는 일정 조회·빈 시간 검색·등록 제안에 사용하며, 실제 시간 계산·권한·충돌 검사·저장 결과는 서버와 DB가 결정합니다.

일정 및 빈 시간 안내는 **이 웹에 등록된 일정과 사용자가 설정한 가능 시간 기준**입니다. 외부 캘린더, 이동·준비 시간, 휴식 시간을 반영하지 않습니다.

## 기술 구성

- Next.js App Router, TypeScript, Tailwind CSS
- Supabase Auth와 PostgreSQL
- Groq Tool Calling
- TanStack Query, Zustand
- Playwright 및 Node.js 테스트
- 배포 대상: Vercel

## 로컬 실행

필요한 버전은 `.nvmrc`의 Node.js 24.22.1과 `package.json`의 pnpm 10.22.0입니다.

```sh
nvm use
pnpm install --frozen-lockfile
pnpm dev
```

환경변수 이름은 [`.env.example`](.env.example)을 참고합니다. 로컬 실행 시 필요한 값은 개발자가 직접 로컬 환경에 설정하세요. 실제 값은 Git에 올리지 말고, `GROQ_API_KEY`는 서버 전용 비밀값으로 유지해야 합니다.

## 검사 명령

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

`pnpm test:e2e`의 기본 샘플 검사는 샘플 화면만 확인하며 실제 로그인이나 DB 저장을 검증하지 않습니다. 로그인·DB·라이브 AI 검사는 별도 테스트 계정과 실행 설정이 필요합니다. 상세 조건은 [`docs/issue-10-test-setup.md`](docs/issue-10-test-setup.md)를 참고하세요. 실제 DB 쓰기 검사는 테스트 데이터가 남을 수 있고 라이브 AI 검사는 사용량을 소비합니다.

## 배포

Vercel Preview·Production 설정, Supabase 리다이렉트 설정, 실제 배포 확인 순서는 [`docs/deployment-checklist.md`](docs/deployment-checklist.md)에 기록합니다. 대표 시연 순서는 [`docs/issue-11-demo-script.md`](docs/issue-11-demo-script.md)를 참고하세요.

배포 완료와 실제 확인 결과를 검증하기 전까지는 완료된 것으로 표시하지 않습니다.

## 범위와 제한

현재 첫 버전은 개인 일정 관리에 초점을 둡니다. MCP 서버, 반복 일정, 외부 캘린더 연동, 팀·수강생 예약, AI를 통한 기존 일정 수정·삭제는 구현 범위에 포함되지 않습니다.

## 검증 이력

- 로컬 기준 검사 (2026-10-30, Node 24.22.1): `typecheck`, `lint`, `test` 111/111, `build` 통과.
- 배포 URL 로그인·실제 DB·AI 흐름: 아직 미실행. Preview와 Production 결과를 배포 후 별도 기록합니다.
