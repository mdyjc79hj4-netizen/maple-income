# 메이플 수익 관리 - Vercel 배포본

## 배포
1. `schema.sql`을 Supabase SQL Editor에서 실행
2. Supabase Auth에서 Email 로그인을 활성화하고 Site URL을 배포 주소로 설정
3. Vercel 환경변수에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` 등록
4. GitHub 저장소를 Vercel에 연결해 배포

Vite로 빌드되는 정적 HTML/CSS/JS 사이트입니다. 로그인하지 않으면 기존처럼 localStorage에만 저장됩니다. 로그인하면 사용자별 RLS가 적용된 Supabase 행과 동기화하며 localStorage는 오프라인 캐시로 유지됩니다.

로컬 실행:

```sh
npm install
cp .env.example .env.local
npm run dev
```

`VITE_` 변수는 브라우저 번들에 포함되므로 service role/secret key를 넣지 말고 publishable key만 사용합니다.

Vercel 자동 배포 연결 테스트

GitHub main 브랜치 커밋 테스트
