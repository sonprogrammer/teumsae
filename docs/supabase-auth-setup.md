# 카카오 로그인 연결 점검

카카오 로그인은 Supabase Auth의 Kakao 공급자로 연결한다. 이 문서의 콘솔 설정은 손 대표님이 직접 수행하며 REST API 키와 Client Secret 값은 채팅이나 저장소에 넣지 않는다. 현재 PR의 자동 검사는 실제 카카오 계정 로그인과 두 계정 간 DB 격리를 검증하지 않는다.

1. Kakao Developers에서 앱을 만들고 **카카오 로그인**을 켠다. Client Secret을 활성화한다.
2. Supabase Dashboard → Authentication → Providers → Kakao에서 표시되는 **Callback URL**을 복사해 Kakao Developers의 **Redirect URI**에 등록한다. 이 주소는 Supabase의 `https://<project-ref>.supabase.co/auth/v1/callback` 형식이다. 앱의 `/auth/callback` 주소를 카카오 콘솔에 등록하지 않는다.
3. Kakao Developers의 **REST API 키**를 Supabase Kakao 공급자의 Client ID에, **Client Secret**을 Client Secret에 입력하고 공급자를 활성화한다. 이 비밀값은 앱의 `.env.local`에 넣을 필요가 없다.
4. Supabase Dashboard → Authentication → URL Configuration에서 로컬 Site URL을 `http://localhost:3000`으로 설정하고 Redirect URLs에 `http://localhost:3000/auth/callback`을 추가한다. 배포 시에는 배포 도메인의 `/auth/callback`도 추가한다. 앱은 이 경로에서 인증 코드를 세션으로 교환한다.
5. 카카오 계정의 이메일 제공에 의존하지 않을 경우 Supabase Authentication 설정에서 **Allow users without an email**을 켠다. 이메일을 필수로 사용할 계획이면 카카오 동의 항목의 이메일 제공과 검수 조건을 확인한다.
6. 공개 Supabase 프로젝트 URL과 publishable key는 로컬 `.env.local`에 둔다. 변수 이름은 `.env.example`을 따른다. 값은 저장소나 PR에 올리지 않는다. `supabase/migrations/202610270001_auth_foundation.sql` 적용 상태를 확인한다.
7. 서로 다른 두 카카오 계정으로 로그인한다. 각 계정의 `events`와 `user_settings`가 상대 계정에서 조회되지 않고, 브라우저의 직접 테이블 쓰기가 거부되는지 확인한다.
8. 새로고침 후 로그인 유지, 로그아웃 후 `/schedule` 직접 접근 차단, 인증 거부 또는 만료된 코드의 오류 안내를 확인한다.

실제 일정 생성 API를 열기 전에 시간 제약·활동 시간·과거 일정 금지와 소유권을 서버 경로에서 함께 검증해야 한다.
