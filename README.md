# 메이플 수익 관리 - Vercel 배포본

## 배포
1. `schema.sql`을 Supabase SQL Editor에서 실행
2. Supabase Auth에서 Email 로그인을 활성화하고 Site URL을 배포 주소로 설정
3. Vercel 환경변수에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `NEXON_OPEN_API_KEY` 등록
4. GitHub 저장소를 Vercel에 연결해 배포

Vite로 빌드되는 정적 HTML/CSS/JS 사이트입니다. 로그인하지 않으면 기존처럼 localStorage에만 저장됩니다. 로그인하면 사용자별 RLS가 적용된 Supabase 행과 동기화하며 localStorage는 오프라인 캐시로 유지됩니다.

로컬 실행:

```sh
npm install
cp .env.example .env.local
npm run dev
```

`VITE_` 변수는 브라우저 번들에 포함되므로 service role/secret key를 넣지 말고 publishable key만 사용합니다.

## NEXON 스케줄러 연동

- 서버 endpoint: `GET /api/nexon-scheduler`
- 캐릭터 기본정보 endpoint: `GET /api/nexon-character?ocid=...` (`/maplestory/v1/character/basic` 프록시, 30분 서버 캐시)
- Vercel 환경변수 `NEXON_OPEN_API_KEY`는 서버 함수에서만 사용하며 `VITE_` 접두사를 붙이지 않습니다.
- 설정의 `NEXON Open API` 영역에서 메기 캐릭터와 조회할 메이플스토리 캐릭터를 연결합니다.
- 연동·주간 기록 확인 시 캐릭터명, 월드, 레벨, 직업, 이미지를 갱신합니다. 프로필 조회가 실패해도 Scheduler 결과는 계속 저장됩니다.
- NEXON 스케줄러 결과는 기존 localStorage 저장과 Supabase 동기화 흐름을 그대로 사용합니다.
- NEXON Scheduler API는 서버 API Key와 연결된 계정 범위 제한이 있으므로 공개 다중 사용자 환경에서는 일부 사용자의 주간 자동 확인이 제공되지 않을 수 있습니다. 이 경우에도 프로필 조회와 수동 보스 체크는 정상적으로 사용할 수 있습니다.
- 사용자 개인 API Key는 입력받거나 저장하지 않습니다. 공식 사용자 인증 방식이 제공되는 경우 다중 사용자 Scheduler 지원을 재검토합니다.
- API Key 없이도 로컬 저장, 빌드 및 테스트는 정상 동작하며 NEXON 조회만 비활성화됩니다.

Vercel 자동 배포 연결 테스트

GitHub main 브랜치 커밋 테스트
