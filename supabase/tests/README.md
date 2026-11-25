# 일정 충돌 DB 회귀 테스트

테스트는 격리된 로컬 Supabase PostgreSQL에서 실제 등록 제안 RPC와 확인 RPC를 실행합니다. Docker Desktop, Supabase CLI, `.nvmrc`의 Node.js와 pnpm이 필요합니다.

저장소 루트에서 실행합니다.

```sh
nvm use
pnpm install --frozen-lockfile
supabase start
supabase db reset --local
supabase test db --local
pnpm test
supabase stop
```

`supabase db reset --local`은 로컬 DB만 초기화하고 마이그레이션을 처음부터 적용합니다. 이 테스트에는 합성 일정만 사용하며 테스트 전체를 트랜잭션 롤백합니다. `--linked`나 원격 DB URL을 사용하지 마세요.
