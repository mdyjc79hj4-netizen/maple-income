# 메이플 수익 관리 - Vercel 배포본

## 배포
1. `schema.sql`을 Supabase SQL Editor에서 실행
2. Supabase Auth에서 Email 로그인을 활성화하고 Site URL을 배포 주소로 설정
3. Vercel 환경변수에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `NEXON_OPEN_API_KEY`, `NEXON_CREDENTIAL_ENCRYPTION_KEY` 등록
4. GitHub 저장소를 Vercel에 연결해 배포

Vite로 빌드되는 정적 HTML/CSS/JS 사이트입니다. 로그인하지 않으면 기존처럼 localStorage에만 저장됩니다. 로그인하면 사용자별 RLS가 적용된 Supabase 행과 동기화하며 localStorage는 오프라인 캐시로 유지됩니다.

로컬 실행:

```sh
npm install
cp .env.example .env.local
npm run dev
```

`VITE_` 변수는 브라우저 번들에 포함되므로 service role/secret key를 넣지 말고 publishable key만 사용합니다. `SUPABASE_SECRET_KEY`와 `NEXON_CREDENTIAL_ENCRYPTION_KEY`는 Vercel 서버 환경변수로만 설정합니다.

## NEXON 스케줄러 연동

- 서버 endpoint: `GET /api/nexon-scheduler`
- 캐릭터 기본정보 endpoint: `GET /api/nexon-character?ocid=...` (`/maplestory/v1/character/basic` 프록시, 30분 서버 캐시)
- Vercel 환경변수 `NEXON_OPEN_API_KEY`는 서버 함수에서만 사용하며 `VITE_` 접두사를 붙이지 않습니다.
- 설정의 `NEXON Open API` 영역에서 메기 캐릭터와 조회할 메이플스토리 캐릭터를 연결합니다.
- 연동·주간 기록 확인 시 캐릭터명, 월드, 레벨, 직업, 이미지를 갱신합니다. 프로필 조회가 실패해도 Scheduler 결과는 계속 저장됩니다.
- NEXON 스케줄러 결과는 기존 localStorage 저장과 Supabase 동기화 흐름을 그대로 사용합니다.
- NEXON Scheduler 요청이 실패해도 캐릭터 프로필 연동과 수동 보스 체크는 유지됩니다. `OPENAPI00004`는 파라미터 오류로 진단하며, 계정 제한으로 추정하지 않고 설정 화면의 상세 진단에서 원본 오류 코드와 분류를 확인합니다.
- 로그인 사용자는 설정에서 개인 NEXON Open API Key를 등록할 수 있습니다. 서버는 `character/list`로 Key를 검증한 뒤 AES-256-GCM으로 암호화하여 `nexon_api_credentials` 테이블에 저장하며, 저장된 Key는 브라우저로 반환하지 않습니다.
- 이번 단계에서 Scheduler는 기존 서버 공용 `NEXON_OPEN_API_KEY`를 계속 사용합니다. 개인 credential을 Scheduler에 적용하는 전환은 별도 단계입니다.
- API Key 없이도 로컬 저장, 빌드 및 테스트는 정상 동작하며 NEXON 조회만 비활성화됩니다.

### 개인 NEXON API Key 저장 설정

1. 업데이트된 `schema.sql`을 Supabase SQL Editor에서 실행해 `public.nexon_api_credentials`를 생성합니다. 이 테이블은 `anon`과 `authenticated`에 직접 권한을 주지 않으며 Vercel 서버 함수만 접근합니다.
2. Vercel에 `SUPABASE_SECRET_KEY`를 등록합니다. 프로젝트가 기존 service role 키를 사용하는 경우에만 `SUPABASE_SERVICE_ROLE_KEY` fallback을 사용할 수 있습니다. 두 값 모두 `VITE_` 접두사를 사용하면 안 됩니다.
3. `NEXON_CREDENTIAL_ENCRYPTION_KEY`에는 32바이트 키의 Base64 값을 등록합니다. 예: `openssl rand -base64 32`. 키를 교체하려면 저장된 credential 재암호화 전략이 먼저 필요합니다.
4. Production과 필요한 Preview 환경에 동일하게 서버 환경변수를 설정한 뒤 다시 배포합니다.

Credential API는 Supabase access token을 `Authorization: Bearer ...`로 검증하며, request body의 사용자 ID는 사용하지 않습니다. `POST /api/nexon-credential`은 Key 검증 및 저장/교체, `GET`은 등록 상태만 조회, `DELETE`는 현재 로그인 사용자의 Key만 삭제합니다.

Vercel 자동 배포 연결 테스트

GitHub main 브랜치 커밋 테스트
