# Supabase Auth 연결 점검

이 문서는 실제 Supabase 프로젝트를 연결할 때 실행한다. 현재 PR의 자동 검사는 실제 계정 생성, 이메일 전송, DB 권한을 검증하지 않는다.

1. Supabase Dashboard의 Authentication → Providers에서 Email 가입과 이메일 확인을 켠다.
2. Authentication → URL Configuration의 Site URL을 테스트할 앱 주소로 설정한다. 로컬 테스트에서는 `http://localhost:3000`, 배포 테스트에서는 배포 URL을 사용한다.
3. Authentication → Email Templates → Confirm signup에서 확인 링크를 다음 형식으로 설정한다. `{{ .ConfirmationURL }}`을 그대로 사용하면 이 앱의 `/auth/confirm` 경로를 거치지 않는다.

   ```text
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
   ```

4. 공개 프로젝트 URL과 publishable key를 로컬의 `.env.local`에 넣는다. 변수 이름은 `.env.example`을 따른다. 값은 저장소나 PR에 올리지 않는다.
5. `supabase/migrations/202610270001_auth_foundation.sql`을 대상 프로젝트에 적용한다. 적용 전후의 DB 상태를 기록하고, 실패하면 마이그레이션을 수정해 다시 검증한다.
6. 서로 다른 두 계정으로 가입·메일 확인·로그인한다. 각 계정의 `events`와 `user_settings`가 상대 계정에서 조회되지 않고, 브라우저 테이블 쓰기가 거부되는지 확인한다.
7. 새로고침 후 로그인 유지, 로그아웃 후 `/schedule` 직접 접근 차단, 만료되거나 잘못된 확인 링크의 오류 화면을 확인한다.

실제 일정 생성 API를 열기 전에 시간 제약·활동 시간·과거 일정 금지와 소유권을 서버 경로에서 함께 검증해야 한다.
