# 개발 실행과 단계 2 검증

> 최신 실행 정보 (2026-10-27 A2-S): 프로젝트 경로는 `/workspace/EasyWeightBaby`이며 Node 24.19.0 / npm 11.9.0을 사용한다. 의존성은 잠금 파일로 설치한다: `npm ci --cache /workspace/.cache/npm --no-fund`. Prisma는 7.10.1이며 CLI 연결 설정은 `prisma.config.ts`, 런타임 연결은 `src/lib/prisma-client.ts`의 PostgreSQL 어댑터에 있다. `npm run db:generate`, `prisma validate`, 타입 검사와 단위 테스트는 통과했다. A3에서 실제 DB 연결, A4에서 HTTP 통합·PC/모바일 Chromium 인증 흐름을 검증했다. A5에서 운영 빌드와 격리 standalone 실행·브라우저 인증도 검증했다. 실행 방법은 10-production-runtime.md를 따른다. 상세 결과는 08-local-database.md와 09-auth-verification.md를 따른다. 아래의 설치 미완료·Prisma 6 및 과거 경로 관련 내용은 내보내기 당시 기록이며 최신 진행 상태는 `07-work-tracker.md`를 따른다.

## 현재 구현 범위

- Next.js App Router / TypeScript 프로젝트 기반과 모바일 반응형 로그인·가입·홈.
- Better Auth 이메일·비밀번호 로그인, 서버 세션, 로그아웃. 라이브러리의 공개 가입 경로 비활성화.
- 관리자 초대 발급·목록·취소, SHA-256 토큰 해시, 이메일 제한, 만료, 동시 사용 방지.
- 초대 가입에서 사용자·인증 계정 생성과 초대 사용 처리를 하나의 DB 트랜잭션으로 수행.
- 최초 관리자 CLI, Prisma 스키마·SQL 마이그레이션, DB 상태 확인 API.
- 본인 운동일지 조회 API와 관리자도 타인 기록을 조회할 수 없는 소유권 조건.

운동일지 생성·세트 입력은 아직 구현하지 않았습니다. 홈에는 실제 데이터만 표시하며 샘플 실적을 자동 생성하지 않습니다. AI·Notion·실제 NAS 배포도 후속 단계입니다.

## 로컬 개발 준비

Node.js 22 이상, npm, PostgreSQL 17을 준비합니다. Docker가 있으면 `compose.dev.yaml`로 개발 DB만 실행할 수 있습니다. 이 Compose는 NAS 운영용 배포 스택이 아닙니다.

```bash
cd /workspace/member-app
cp .env.example .env
```

`.env`에서 다음을 직접 설정합니다.

- `DATABASE_URL`: 본인 개발 PostgreSQL 연결 주소와 비밀번호.
- `BETTER_AUTH_SECRET`: `openssl rand -hex 32` 등으로 생성한 임의 값. 예제 문자열은 사용할 수 없습니다.
- `APP_URL`: 브라우저에서 접속할 정확한 Origin. 기본 `http://localhost:3000`.

선택적으로 Docker 개발 DB를 실행합니다. Compose는 기본 `.env`를 읽으므로 그 파일에 `POSTGRES_PASSWORD`를 추가하고 DB URL의 비밀번호와 맞춥니다.

```bash
docker compose -f compose.dev.yaml up -d
```

패키지를 설치한 뒤 버전을 잠그는 `package-lock.json`을 보관해야 합니다. 현재 외부 패키지 다운로드가 완료되지 않아 잠금 파일은 생성되지 않았습니다. 최초 설치 후 `npm audit` 결과와 라이브러리 호환성을 검토하고, 이후 설치는 `npm ci`를 사용합니다.

```bash
npm install
npm run db:generate
npm run db:deploy
npm run admin:create
npm run dev
```

관리자 생성은 비밀번호를 표시하지 않는 대화형 터미널에서 실행합니다. 기존 관리자가 있으면 실행을 거부하며, 일반 계정의 임의 관리자 승격 기능은 제공하지 않습니다. 이메일 제한 초대는 메일 인증을 대신하지 않습니다. 이메일 제한 여부와 관계없이 초대 링크를 가진 사람이 사용할 수 있으므로 링크를 안전하게 전달해야 합니다.

브라우저에서 `APP_URL`에 접속하고 관리자로 로그인 → ‘친구 초대’ → 링크 복사 → 가입 순서로 확인합니다. 링크는 서버 요청 로그에 토큰이 남지 않도록 URL fragment를 사용하고 가입 화면에서 주소창의 토큰을 제거합니다. 토큰은 최초 발급 응답에서만 제공하며 다시 조회할 수 없습니다.

## 검증 명령

```bash
npm run typecheck
npm test
npm run build
```

실제 인증·권한 검증에는 별도 PostgreSQL 테스트 DB가 필요합니다. DB 이름은 반드시 `_test`로 끝나야 합니다. 테스트는 해당 DB에 마이그레이션을 적용하고 별도 포트 3197에서 앱을 실행합니다. 운영·개발 DB를 지정하지 마세요.

```bash
TEST_DATABASE_URL='postgresql://member:local-password@localhost:5432/member_test' npm run test:integration
```

테스트는 미인증·비관리자 접근, 다른 사용자의 일지 조회 차단, 공개 가입 차단, 초대 만료·취소·이메일 불일치, 동시 가입의 단일 성공, 중복 계정 가입 시 초대 사용 상태 롤백, 로그아웃 후 세션 무효화를 확인합니다. `TEST_DATABASE_URL`이 없으면 통합 테스트는 실패합니다. 개발 DB와 같은 대상도 거부합니다.

## 이번 환경에서 확인한 결과와 제한

- 설계·소스·마이그레이션 파일 작성 완료.
- 설치 불필요한 TypeScript 파일 구문 검사와 프로젝트 문서·설정 구조 점검 수행.
- 패키지 다운로드 요청이 도구 대기 상태에서 중단됐고, 현재 `node_modules`와 잠금 파일 없음.
- Docker 소켓은 기본 샌드박스에서 접근 거부됨.
- 따라서 Prisma 검증·TypeScript 타입 검사·Next.js 빌드·실제 DB/HTTP 통합 테스트는 아직 통과를 확인하지 못함. TSX 화면의 브라우저 검증도 미실시.
- 위 검증을 완료하기 전 단계 2를 완료나 배포 가능 상태로 표시하지 않음.

다음 작업은 의존성 설치와 DB 연결을 복구한 뒤 마이그레이션·인증·접근 권한 통합 검증을 수행하는 것입니다. 통과 후 단계 3의 종목·루틴·직접 운동 기록으로 넘어갑니다.
