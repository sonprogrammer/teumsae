---
name: teumsae-backend
description: 틈새의 인증, DB 스키마·RLS, 일정 API, 시간 계산, 빈 시간 검색 또는 일정 등록 확인을 변경할 때 사용한다.
---

# 틈새 백엔드

소유권, 시간, 저장 여부는 서버와 DB에서 결정한다. 관련 코드를 바꾸기 전에 승인된 이슈나 디자인과 `docs/spec.md` §5, §7.3, §8을 읽는다. 확정된 요구사항과 명세의 제안 기본값을 구분한다.

## 기본 명령

저장소 루트에서 `nvm use`로 `.nvmrc` 버전의 Node를 선택하고 pnpm을 사용한다. 의존성이 없거나 lockfile이 바뀐 경우에만 `pnpm install --frozen-lockfile`을 실행한다.

| 목적 | 명령 |
| --- | --- |
| 자동 테스트 | `pnpm test` |
| 타입 검사 | `pnpm typecheck` |
| 린트 | `pnpm lint` |
| 프로덕션 빌드 | `pnpm build` |

SQL 검증은 Supabase 로컬 프로젝트 설정(`supabase/config.toml`)과 로컬 DB가 이미 준비된 경우에만 수행한다. 현재 저장소에는 설정 파일이 없으므로 설정을 임의로 만들거나 원격 DB를 대상으로 명령하지 않는다. 로컬 스택이 구성된 뒤 DB 변경 검증이 작업 범위라면 다음을 사용한다.

```sh
supabase start
supabase migration up --local
supabase db lint --local --fail-on error
supabase test db
```

`supabase test db`는 `supabase/tests`에 DB 테스트가 있을 때 실행한다. 원격 DB를 바꾸는 `supabase db push`, `supabase migration up --linked` 또는 `--db-url` 사용은 사용자가 해당 원격 적용을 명시적으로 승인한 경우에만 한다. `supabase db reset`은 로컬 데이터도 삭제하므로 기본 검증 명령에 포함하지 않는다.

## 데이터 경로 확인

## SQL 작성 규칙

- PostgreSQL 예약어를 테이블·컬럼 별칭으로 사용하지 않는다. 특히 `window`는 SQL 예약 키워드이므로 `as window`, `window.column` 형태를 절대 작성하지 않는다.
- 시간대 테이블 별칭은 `availability_window`, `schedule_window`처럼 의미가 분명한 이름을 사용한다.
- 새 마이그레이션을 만들거나 수정한 뒤 예약어 별칭 검사를 실행한다: `rg -n -i '\bas\s+window\b|\bwindow\.' supabase/migrations`.
- 이 검사는 공백·대소문자 차이도 잡아야 하며 결과가 없어야 한다. 기존 컬럼·테이블 이름에 포함된 단어(예: `weekly_availability_windows`)는 별칭이 아니므로 검사 대상과 구분한다.

| 작업 | 서버의 책임 |
| --- | --- |
| 조회 | 검증된 인증에서 소유자를 결정하고 본인 범위 조회와 RLS를 적용한다. 개인 응답을 공유 캐시에 두지 않는다. |
| 시간 계산 | Asia/Seoul 기준으로 날짜를 해석하고 합의된 활동 시간·길이를 적용한다. 일정 구간을 `[시작, 종료)`로 보고 겹침을 판단하며, 구체적인 시각은 확정적인 코드로 계산한다. |
| 등록 준비 | AI 출력과 클라이언트의 후보 ID를 신뢰하지 않는다. 검색 결과, 소유자, 만료, 설정 버전을 검증하고 일정 대신 등록 제안을 만든다. |
| 확인·변경 | 실제 저장 경로에서 소유권, 시간 규칙, 현재 충돌을 다시 확인한다. 재시도와 동시 요청을 안전하게 처리한 뒤 저장 성공을 알린다. |

예: 같은 제안의 확인 요청 두 개가 동시에 도착해도 DB 트랜잭션은 일정 하나와 재사용 가능한 결과만 만들어야 한다. 버튼 비활성화만으로는 이를 보장할 수 없다.

스키마, 권한 부여, 높은 권한의 클라이언트를 바꿨다면 실제 DB에서 익명 사용자와 다른 계정의 접근 차단을 확인한 뒤에만 격리를 주장한다. 비밀키는 서버에만 두고 로그·커밋·클라이언트 번들에 넣지 않는다. 실제 DB 검사를 못 했다면 통과가 아니라 미검증으로 보고한다.
