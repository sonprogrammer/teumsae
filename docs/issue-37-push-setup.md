# 이슈 37 푸시 알림 배포 설정

이 문서는 실제 일정 알림을 켜기 전 필요한 배포 설정을 안내합니다. 비밀값은 저장소나 이 문서에 적지 마세요.

## 1. Vercel 환경변수

Vercel 프로젝트 설정의 Production 환경에 다음 변수를 등록하고 재배포합니다.

| 변수 | 용도 |
| --- | --- |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | 브라우저 푸시 구독에 사용하는 공개키 |
| `VAPID_PRIVATE_KEY` | 서버가 푸시를 서명할 때 사용하는 비밀키 |
| `VAPID_SUBJECT` | `mailto:` 연락처 또는 운영자 URL |
| `CRON_SECRET` | Supabase Cron 호출을 보호하는 임의의 긴 토큰 |
| `SUPABASE_SERVICE_ROLE_KEY` | 알림 작업이 구독·발송 대기열에 접근하는 서버 전용 키 |

VAPID 키 쌍은 프로젝트 루트에서 `pnpm exec web-push generate-vapid-keys`로 생성할 수 있습니다. 공개키와 비밀키를 각각 올바른 환경변수에 등록하고, `CRON_SECRET`과 Supabase Vault 토큰에는 같은 임의 토큰을 설정합니다. 실제 값은 코드 리뷰나 채팅에 붙이지 않습니다.

## 2. Supabase Vault

Supabase Dashboard의 Vault에 아래 두 secret을 등록합니다.

| Secret name | 값 |
| --- | --- |
| `teumsae-event-reminder-url` | `https://teumsae-blush.vercel.app/api/cron-event-reminders` |
| `teumsae-event-reminder-token` | Vercel의 `CRON_SECRET`과 같은 값 |

## 3. 데이터베이스 마이그레이션

현재 틈새 Supabase 프로젝트의 SQL Editor에서 아래 순서로 한 번씩 실행합니다.

1. `supabase/migrations/202610310001_push_reminders.sql`: 구독·설정 테이블, 소유자 RLS, 중복 방지 발송 대기열, 매분 Supabase Cron 작업을 만듭니다.
2. `supabase/migrations/202610310002_voice_event_mutations.sql`: 음성 대화에서 일정 수정·삭제를 확인 카드로 만들고, 소유자와 일정 버전을 확인한 뒤에만 반영합니다.
3. `supabase/migrations/202610310003_voice_transcription_rate_limit.sql`: 음성 전사 요청에 사용자별 분당 3회 한도를 따로 적용해 AI 대화 분당 3회 한도와 중복 계산되지 않게 합니다.

음성 인식은 서버의 `GROQ_API_KEY` 환경변수로 Groq Whisper를 호출합니다. 로컬에서는 개발 서버 프로세스에, 배포 미리보기에서는 Vercel 프로젝트의 Preview 환경변수에 설정해야 합니다. 값이 없으면 전사 API가 503을 반환합니다. 키는 `NEXT_PUBLIC_` 변수나 저장소 파일에 넣지 않습니다. 음성은 마이크를 켠 동안 대화 단위로 녹음하며, 약 1.3초 말이 멈추면 자동 전송하고 AI 음성 답변 뒤 다시 듣습니다. 녹음 파일은 저장하지 않습니다. AI 대화와 음성 전사는 각각 사용자별 분당 3회 한도를 사용하므로 한 음성 대화가 두 한도를 중복 소비하지 않습니다. Supabase SQL은 원격 DB에 자동 적용되지 않으며, Vault secret이 아직 없으면 알림 Cron은 호출되지 않습니다.

## 4. 동작 확인

1. Vercel 배포 후 `/schedule/settings`에서 일정 알림을 켜고 브라우저 권한을 허용합니다.
2. 알림 시점을 선택하고 가까운 미래의 일정 하나를 등록합니다.
3. Supabase Dashboard의 Cron 및 `event_reminder_deliveries`에서 실행·발송 상태를 확인합니다.
4. 실제 푸시 수신은 HTTPS 배포에서 설치한 iOS 홈 화면 앱 또는 Android Chrome에서 확인합니다.
5. 마이크 버튼을 한 번 눌러 일정 조회·추가·수정·삭제를 이어서 말하고, 말이 끝날 때마다 자동 전송되는지 확인합니다. AI 음성 답변 뒤 다시 듣고, 마이크 끄기 버튼으로 대화를 종료합니다. 일정 변경은 제안 카드에서 확인해야만 반영됩니다. 스피커 버튼으로 음성 답변을 끄거나 켤 수 있습니다.

로컬에서 PWA 서비스 워커를 확인하려면 Node 24 환경에서 `pnpm build` 후 `pnpm start`로 실행합니다. 개발 모드에서는 오래된 서비스 워커가 화면을 가리는 일을 막기 위해 등록하지 않습니다. 앱이 음성 녹음을 요청할 때 브라우저에서 마이크 권한을 허용해야 합니다.

Vercel Hobby Cron은 하루 한 번만 실행할 수 있어 일정 전 알림에는 사용하지 않습니다. Supabase Cron이 매분 보호된 발송 API를 호출합니다. 매분 실행이어도 기기 네트워크, 브라우저 권한, 푸시 서비스 상태에 따라 전달 시각은 달라질 수 있습니다.
