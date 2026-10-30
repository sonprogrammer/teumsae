# Vercel 배포 및 실제 확인 체크리스트

이 문서는 이슈 #11의 Preview 검증과 이후 Production 배포를 위한 실행 기록입니다. 실제 확인이 끝나지 않은 항목은 체크하지 않습니다. 비밀값, 쿠키, 개인 일정 제목은 이 문서에 적지 않습니다.

## 배포 전

- [ ] Vercel project가 준비되고 `feat/issue11-deployment` 브랜치의 Preview 주소를 생성했다.
- [ ] Preview 환경변수가 등록되어 있다. 실제 값은 Vercel 설정에서만 관리한다.
  - [ ] `NEXT_PUBLIC_SUPABASE_URL`
  - [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - [ ] `GROQ_API_KEY` (서버 전용 비밀값)
  - [ ] `GROQ_MODEL` (선택, 미설정 시 앱 기본 모델 사용)
- [ ] Supabase Auth URL Configuration의 Site URL은 Production 사이트 주소로 설정되어 있다.
- [ ] Supabase Redirect URLs에 Preview와 Production의 callback 경로가 허용되어 있다: 각 주소의 `/auth/callback`. Preview 호스트가 바뀌면 해당 Vercel 팀 도메인으로 범위를 제한한 wildcard를 설정한다.
- [ ] Kakao 개발자 설정의 OAuth redirect URI가 Supabase Kakao provider callback을 가리킨다.
- [ ] 현재 Supabase 프로젝트를 Preview와 Production에서 공유한다는 점을 확인했다. Preview 테스트 데이터도 이 프로젝트에 생성된다.

로그인 버튼은 현재 브라우저 origin의 `/auth/callback`을 `redirectTo`로 전달합니다. Supabase Redirect URLs에는 Preview callback과 Production callback을 각각 허용해야 합니다. Preview URL이 달라지는 경우 해당 Vercel 팀 도메인 범위의 wildcard 패턴을 사용하고, Production callback은 정확한 주소로 등록합니다. Kakao provider의 OAuth callback은 별도 설정이며 Supabase Kakao provider callback을 가리킵니다. [Supabase Redirect URLs 문서](https://supabase.com/docs/guides/auth/redirect-urls)를 참고합니다.

## Preview 배포 확인

Preview 주소: (배포 후 입력)
커밋: (배포 후 입력)
확인 일시: (확인 후 입력)
검증자: 손영진

- [ ] Preview가 `feat/issue11-deployment` 브랜치의 의도한 커밋에서 생성되었다.
- [ ] 로그인 전 랜딩 화면과 `/auth`가 열린다.
- [ ] 카카오 로그인 후 `/schedule`로 돌아오고 로그인 세션이 유지된다.
- [ ] 실제 일정이 조회된다.
- [ ] 테스트 일정을 직접 등록한 뒤 새로고침해도 보인다.
- [ ] AI로 일정 조회를 요청하면 일정 카드와 응답이 일치한다.
- [ ] 빈 시간을 요청하면 일정·가능 시간 설정을 기준으로 후보가 나온다.
- [ ] 후보를 골라 등록 확인 카드를 만들고, 확인 후 일정이 저장된다.
- [ ] 저장된 일정이 달력·목록에 나타나고 새로고침 후에도 유지된다.
- [ ] 실패·한도 초과 응답이 저장 성공으로 오인되지 않는다.
- [ ] 모바일 화면에서 일정 확인, AI 입력, 후보 선택, 등록 확인을 할 수 있다.
- [ ] 테스트를 위해 만든 임시 일정과 미사용 제안 데이터를 확인하고 정리했다.

결과: (통과/실패/미실행 및 간단한 근거를 입력)

## Production 배포

- [ ] Preview 검증 결과를 손 대표님이 확인했다.
- [ ] Production 환경에 필요한 변수가 등록되어 있다. 실제 값은 Vercel 설정에서만 확인한다.
  - [ ] `NEXT_PUBLIC_SUPABASE_URL`
  - [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - [ ] `GROQ_API_KEY` (서버 전용 비밀값)
  - [ ] `GROQ_MODEL` (선택, 미설정 시 앱 기본 모델 사용)
- [ ] Production Site URL은 운영 origin이고 Redirect URLs에 정확한 `https://<production-host>/auth/callback`이 허용되어 있다.
- [ ] Production 배포 전 손 대표님의 공개 확인을 받았다.
- [ ] Production URL에서 카카오 로그인과 핵심 흐름을 다시 확인했다.
- [ ] README의 배포 상태와 실제 검증 결과를 갱신했다.

Production URL: (배포 후 입력)
커밋: (배포 후 입력)
확인 일시: (확인 후 입력)
결과: (통과/실패/미실행 및 근거를 입력)

## 이메일 확인 안내

현재 앱은 카카오 로그인을 사용하며 이메일 로그인/이메일 인증 흐름은 제공하지 않습니다. 따라서 이번 배포 검증에서는 이메일 확인 메일 발송 대신 카카오 로그인과 앱 callback 리다이렉트를 확인합니다. 인증 방식이 바뀌면 이 체크리스트도 갱신해야 합니다.
