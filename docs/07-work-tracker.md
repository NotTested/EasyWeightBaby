# 작업 진행표 및 A1 인계

기준일: 2026-10-27 (Asia/Seoul)

## 현재 위치

- 프로젝트 및 Git 루트: `/workspace/EasyWeightBaby`.
- 소스: 사용자가 제공한 `member-app-export-2026-10-27.zip`.
- 압축의 `member-app/` 하위 파일을 저장소 루트에 복원했다. 별도 중첩 프로젝트나 Git worktree는 만들지 않았다.
- 기존 저장소는 커밋 없는 `work` 브랜치였으며 복원 전 사용자 파일과 변경 사항은 없었다. 원격·브랜치는 변경하지 않았고 커밋·푸시는 하지 않았다.
- 기존 문서에 적힌 `/workspace/member-app`은 이전 환경 경로다. 이 환경의 모든 설치·실행 명령은 `/workspace/EasyWeightBaby`에서 실행한다.
- 기존 HANDOFF 및 EXPORT_MANIFEST는 내보내기 당시 상태를 보존하는 원본이다. 최신 계획은 `06-current-development-plan.md`, 현재 진행 상황은 이 문서를 우선 참고한다.

## 진행표

| 작업 | 상태 |
|---|---|
| A1 소스 복원 및 저장소 정리 | 완료 |
| A2 의존성 설치와 버전 고정 | 완료 |
| A2-S Prisma 보안 업데이트 | 완료 (실제 DB 호환성은 A3/A4에서 검증) |
| A3 개발·테스트 PostgreSQL | 완료 |
| A4 인증·초대·소유권 검증 | 완료 |
| A5 운영 빌드 검증 | 완료 |
| B1 모바일·PC 공통 화면 | 완료 |
| B2 PWA 설치 기반 | 완료 (로컬 HTTPS Chromium 검증; 실물 기기·NAS는 E2) |
| B3 오프라인·업데이트 처리 | 완료 |
| C1~C7 직접 운동 기록 | 대기 |
| D1~D4 이관·조회·비교 | 대기 |
| E1~E4 NAS 운영 | 대기 |
| F1~F5 자연어·AI·MCP | 대기 |

작업 ID의 범위와 완료 기준은 대화에서 정한 단계별 작업 단위를 따른다. 위 묶음은 완료 표시를 줄이기 위한 것으로 여러 작업을 한 번에 수행하라는 의미가 아니다.

## 작성된 구현

- Next.js App Router, TypeScript, 일반 CSS 반응형 화면.
- Better Auth 로그인·로그아웃 및 관리자 초대 발급·취소·초대 가입.
- Prisma 인증 모델과 소유권 검사용 최소 WorkoutSession, 초기 SQL 마이그레이션.
- 본인 운동일지 목록·상세 조회 API, 관리자 생성 CLI, 개발 DB Compose.
- 입력 단위 테스트 및 인증·초대·다른 사용자 접근 차단 HTTP 통합 테스트 소스.

## 미구현 및 미검증

- 종목·루틴·세트·유산소·운동 생성·수정·통계는 미구현.
- PWA manifest·아이콘·서비스 워커·설치 안내는 미구현.
- Notion ZIP/API 가져오기, 자연어·AI·MCP는 미구현.
- 운영 Dockerfile·Compose·NAS 배포·백업 복원은 미구현。
- 패키지 설치·lockfile 생성·Prisma 검증・타입 검사·빌드·DB/HTTP/브라우저 검증은 미실시. 테스트 파일의 존재는 통과를 뜻하지 않는다.
- 목표 문서의 Tailwind/shadcn은 현재 소스에 설치되지 않았다. A2에서 UI 도구 교체를 범위에 넣지 않는다.

## A1 검증

- ZIP 경로·심볼릭 링크·기존 파일 충돌을 검사한 후 49개 파일을 복원했다.
- 원본 manifest에 등재된 48개 파일의 크기·SHA-256을 복원 전후 대조했다. 나머지 1개는 manifest 자체다.
- 기존 코드는 수정하지 않고 최신 계획과 이 진행표만 추가했다.
- 개인 운동 원문 ZIP은 저장소로 복사하지 않았다. 실제 `.env`, 비밀키, 계정 및 DB는 생성하지 않았다.

## A2 결과

- Node 24.19.0 / npm 11.9.0으로 설치했다. `.node-version`, packageManager, 정확한 직접 의존성 버전과 package-lock.json을 저장했다.
- Next 16.4.3, React/React DOM 19.3.1, Better Auth 1.7.14, Prisma/Client 6.19.3, TypeScript 5.9.3. 기존 메이저 범위를 유지했다.
- npm 캐시 기본 경로가 쓰기 불가하여 `/workspace/.cache/npm`으로 지정했다. 이후 설치는 `npm ci --cache /workspace/.cache/npm --no-fund`를 사용한다.
- Prisma 6.19.0은 엔진 체크섬 다운로드에서 403이 발생했으나 6.19.3 설치 후 Client 생성이 성공했다. 체크섬·TLS 검증을 해제하지 않았다. 향후 엔진 다운로드용 binaries.prisma.sh 허용 설정은 환경 초안에 저장됐으며 게시와 런타임 적용은 별개다.
- Prisma Client 생성·TypeScript 타입 검사·기존 단위 테스트 1개·Prisma 스키마 검증 통과. 잠금 파일을 사용한 npm ci 재설치도 성공했다.
- 스키마 검증의 DATABASE_URL은 연결 없는 문법 검증용 주소였다. 실제 DB·마이그레이션·인증 HTTP·운영 빌드 검증은 아직 수행하지 않았다.
- 앱 로직과 기존 테스트를 수정하지 않았다. 처음 나온 암묵적 any 오류는 Client 생성 후 해소됐다.

### 보안 후속 A2-S

`npm audit`에는 high 3건이 남는다. 독립 문제 3개가 아니라 deepmerge-ts <8.0.0의 재귀 객체 병합 스택 고갈 문제(GHSA-ggr8-5vv4-36mx)가 @prisma/config와 prisma까지 전파된 결과다. Prisma 6.19.3으로 effect 관련 경고는 해소됐다. Prisma CLI가 production 의존성에도 포함되어 있으므로 운영 설치에도 경고가 남으며 개발 전용이라 단정하지 않는다.

설치된 소스에서 deepmerge는 Prisma 구성 파일을 읽는 경로에 있다. 현재 프로젝트에는 prisma.config 파일이 없고 웹 요청을 해당 경로에 전달하는 코드도 확인되지 않았으나, 취약점이 해결된 것은 아니다. 임의의 메이저 overrides 또는 audit fix --force는 적용하지 않았다.

공식 audit 수정안은 Prisma 7.10.1 이상으로의 메이저 전환이다. A2-S는 Prisma 7 구성·PostgreSQL 어댑터·CLI·테스트 하네스 변경 및 Client 생성·타입·스키마 검증을 다루는 별도 작업으로 분리한다. 실제 DB 호환성은 A3/A4에서 이어서 검증하며, 운영 배포 전 경고를 해소해야 한다.

## A2-S 결과

- Prisma CLI/Client/PostgreSQL 어댑터를 7.10.1로 맞추고 잠금 파일을 갱신했다. Prisma CLI는 devDependencies에 둔다.
- DATABASE_URL을 schema.prisma에서 prisma.config.ts로 이동했다. 구성 파일이 .env를 명시적으로 로드한다. 생성·문법 검증에는 DB 연결이 필요 없으며 마이그레이션에는 실제 DATABASE_URL이 필요하다.
- src/lib/prisma-client.ts의 공통 생성 함수에서 @prisma/adapter-pg를 사용한다. 앱·관리자 CLI·통합 테스트가 같은 경로를 사용한다. 기존 URL의 schema=public 옵션을 어댑터 schema 옵션으로 전달해 스키마 의미를 보존한다. TLS 검증을 끄는 설정은 추가하지 않았다.
- Node 지원 범위를 Prisma 7에 맞게 `^22.12.0 || >=24.0.0`으로 조정했다. 이 환경은 .node-version의 24.19.0으로 검증했다.
- Prisma 모델·기존 SQL 마이그레이션·인증/운동 로직은 변경하지 않았다. prisma-client-js 생성기를 유지해 불필요한 생성 경로·모듈 변경을 피했다.
- Client 생성·스키마 검증·타입 검사·기존 단위 테스트 1개 통과. npm audit 결과 취약점 0건. 실제 DB 접근과 인증 HTTP 통합 테스트·운영 빌드는 여전히 미검증이다.
- 이전 A2의 버전 및 audit 결과는 당시 기록이며 현재 상태는 이 절을 따른다.

## A3 결과 (2026-10-28)

- 실제 관리형 Docker 데몬 접근 성공. PostgreSQL 17-bookworm 개발·테스트 컨테이너를 별도 비밀번호·포트·볼륨으로 실행했다. 로컬 포트만 바인딩한다.
- Git 제외 .env에 임의 로컬 비밀번호와 인증 secret을 생성했다(0600). 재실행 시 덮어쓰지 않는 scripts/init-dev-env.py를 추가했다. 실제 값은 문서·로그에 포함하지 않는다.
- 두 DB에 초기 마이그레이션 적용 성공. 개발 migrate deploy와 test:db를 반복해 재적용·재실행 성공을 확인했다.
- DB 스모크 테스트: 대상 DB 확인, 관련 레코드 CRUD, 실패 트랜잭션 롤백, 외래키 차단, non-public 스키마 분리 통과. 상위 1개+하위 5개로 총 6개 pass, fail/skip 0.
- Prisma migrate diff에서 개발 DB와 현재 모델 차이 없음. 타입 검사 통과. 테스트가 만든 사용자·운동·임시 스키마는 제거했다.
- 실행 절차와 데이터 보존 주의는 08-local-database.md에 기록했다. DB 컨테이너는 다음 A4를 위해 실행 상태로 남겼다.

## A4 결과 (2026-10-28)

- 실제 PostgreSQL 테스트 DB로 HTTP 통합 테스트 총 6개(상위 1+하위 5) 통과, fail/skip 0. 비인가 접근·초대 상태·동시 가입·트랜잭션 롤백·로그아웃을 확인했다.
- Chromium 브라우저 테스트 총 3개(상위 1+PC 1280px/모바일 390px) 통과, fail/skip 0. 초대 발급부터 가입·로그인·권한 차단·로그아웃까지 실제 화면에서 검증했다.
- 테스트 DB 미설정 시 HTTP 테스트가 skip하지 않고 실패하도록 보강했다. 개발 DB와 테스트 DB가 동일하면 실행을 거부한다.
- 앱 로직 수정 없이 통과했다. playwright-core 개발 의존성과 tests/browser/auth.test.ts, test:browser 명령을 추가했다. Chromium은 환경의 /usr/bin/chromium을 사용한다.
- 타입 검사 통과, npm audit 취약점 0건. 자세한 재현 방법·범위는 09-auth-verification.md 참조.
- Next dev가 만든 루트 AGENTS.md를 보존했다. 운영 빌드·초기 관리자 CLI·실제 HTTPS/설치형은 아직 미검증이다.

## A5 결과 (2026-10-28)

- Prisma 생성·Next 16.4.3 운영 빌드·정적 생성·standalone 준비 성공.
- scripts/prepare-standalone.mjs에서 정적 파일 복사 및 산출물의 dotenv 파일 제거. 로컬 원본 .env는 보존했다.
- npm start가 standalone 서버를 사용하도록 변경했고 APP_HOST로 바인딩 주소를 지정한다. 실제 npm start와 DB health 응답 검증 성공.
- 별도 임시 경로로 산출물을 옮겨 서버·DB health·보안 헤더·비인증 접근·Chromium 모바일 로그인·로그아웃 및 정적 JS/CSS를 검증했다. 총 3개 테스트 pass, fail/skip 0. 최종 타입 검사 통과.
- 테스트용 NODE_ENV 타입 오류를 수정했다. 앱 인증·도메인 로직 변경은 없다. Next 자동 타입 설정 변경을 보존했다.
- 자세한 실행 절차와 한계는 10-production-runtime.md를 따른다. 실제 NAS·HTTPS·PWA·관리자 CLI 검증은 완료한 것으로 간주하지 않는다.

## B1 결과 (2026-10-28)

- 공통 AppShell과 오늘·기록·루틴·설정 메뉴를 추가했다. PC 상단/모바일 하단 메뉴, 현재 위치 aria-current, 본문 건너뛰기, 모바일 safe-area 여백을 적용했다. 관리자 초대 화면도 같은 공통 구조를 사용한다.
- 새 화면은 인증 필수이며 설정은 현재 사용자의 계정 정보를 읽기 전용으로 표시한다. 기록·루틴·운동 입력·계정 편집·PWA 설치는 준비 중으로 명시했다. 데이터 모델·API 권한·사용자 원본 기록은 변경하지 않았다.
- Chromium 1280/390/320px에서 초대·인증·키보드 내비게이션·본문 포커스·현재 위치·가로 넘침·비로그인 직접 접근을 확인했다. 브라우저 테스트 총 4개 pass, fail/skip 0.
- 타입 검사 및 운영 빌드 성공. standalone 운영 테스트 총 3개 pass, fail/skip 0. 범위는 11-app-shell.md를 참고한다.
- 구현 범위·재현 방법은 11-app-shell.md에 기록했다.

## B2 결과 (2026-10-28)

- manifest·192/512 PNG·maskable·Apple 아이콘·앱 메타데이터와 설정의 조건부 설치 안내 구현. beforeinstallprompt·취소·실패·appinstalled·standalone 상태를 구분한다.
- Chromium 실제 창+로컬 HTTPS에서 manifest 오류 없음, 설치 가능 조건 오류 0, 실제 프로토콜 설치·앱 창 실행·설정 딥링크·종료 후 재실행 검증. 브라우저와 설치 앱의 로그인 계정 유지, 앱 제거 후 서버 세션 유지도 확인했다. PWA 테스트 총 3개 pass, fail/skip 0.
- TLS 검증을 유지했다. 임시 CA·개인키·브라우저 프로필·테스트 앱·계정·Xvfb를 정리하는 재현 helper를 추가했다.
- 운영 빌드·최종 타입 검사 성공. 운영 회귀 테스트 총 3개 pass, fail/skip 0. 설치 취소·클릭 전 prompt 미호출·설치 직후 일반 탭 안내는 별도 모의 UI 테스트로 구분한다.
- 서비스 워커·오프라인은 아직 구현하지 않았다. Android/iOS 실물 기기와 NAS HTTPS는 후속 범위다. 상세 절차·한계는 12-pwa-installation.md를 따른다.

## B3 결과 (2026-10-28)

- 빌드 ID 기반 worker와 개인 정보 없는 offline.html, 연결 끊김·복구 안내를 추가했다. Cache Storage에는 공용 오프라인 문서만 저장한다. API·인증·RSC·개인 화면은 캐시하지 않는다.
- 새 worker를 waiting으로 두고 사용자 요청 후 전환한다. 폼 입력·자동 완성·초대 코드가 남으면 적용하지 않고, 다른 탭도 자동 새로고침하지 않는다.
- 실제 Chromium 오프라인 탐색·API 실패·재연결, 두 탭의 입력 보존·대기 버전 전환·이전 캐시 정리 및 기존 설치·독립 실행 검증 성공. PWA 테스트 총 5개 pass, fail/skip 0.
- 운영 빌드·타입 검사 통과, 운영 회귀 테스트 3개 pass, fail/skip 0. 생성 worker와 offline 문서가 standalone에 포함되며 dotenv 제외를 유지했다.
- B3는 localhost 보안 컨텍스트에서 검증했다. B2의 HTTPS 검증과 구분한다. 상세 정책·범위·재현 방법은 13-offline-updates.md를 따른다. 운동 초안 복구와 완전한 오프라인 동기화는 미구현이다.

## 다음 작업: C1

공용·개인 운동 종목과 별칭을 모델링하고 검색·개인 추가·수정·비활성화 흐름을 구현한다. 공용 종목 수정은 관리자만 허용하고 개인 종목은 소유권을 확인한다. 주간 루틴·운동 입력·Notion 데이터 이관을 한 번에 구현하지 않는다.

### B3 시작 전 계획 (기록)

서비스 워커와 오프라인 안내·새 버전 안내·안전한 업데이트 전환을 구현한다. 인증·개인 데이터·초대 토큰은 캐시하지 않는다. 운동 입력과 기기 내 초안 복구는 C단계이며 아직 제공하지 않는다.

### B2 시작 전 계획 (기록)

PWA manifest·아이콘·설치 안내를 구현하고 지원 Chrome의 실제 HTTPS 설치·독립 실행을 검증한다. 외부 HTTPS 환경이 필요하면 현재 환경 기능을 먼저 확인하고 미검증 상태를 구분한다. 오프라인 초안·업데이트 처리는 B3/C7의 범위로 남긴다.

### B1 시작 전 계획 (기록)

모바일·PC 공통 화면 구조와 오늘·기록·루틴·설정 내비게이션을 구현한다. 미구현 기능은 동작한다고 표시하지 않으며 작은 화면과 키보드 조작을 확인한다. PWA 설치는 B2, 오프라인·업데이트는 B3이다.

### A5 시작 전 계획 (기록)

운영 빌드와 프로덕션 실행·응답을 확인하고 재현 가능한 실행 문서를 정리한다. 검증에 필요한 수정만 하고 운동 입력·PWA 구현은 B/C단계로 남긴다.

### A4 시작 전 계획 (기록)

기존 tests/integration/auth.test.ts를 실제 테스트 DB로 실행하고 로그인·초대·소유권·로그아웃 HTTP 검증을 완료한다. 필요하면 브라우저에서 계정 흐름을 확인한다. 운영 빌드는 A5에 남긴다.

### A3 시작 전 계획 (기록)

개발·테스트 PostgreSQL을 분리해 준비하고 기존 마이그레이션을 적용한다. Prisma 7 어댑터의 실제 연결·CRUD·스키마 지정 동작을 확인한다. 인증 HTTP 통합 검증은 A4에서 진행한다. 과거 환경의 네트워크나 Docker 제한을 현재 상태로 가정하지 않는다.

아래는 A2에서 사용한 절차다.

1. 현재 실행 환경과 사용 가능한 Node/npm, 네트워크 정책을 확인한다. 과거 환경의 차단 상태를 현재 상태로 가정하지 않는다.
2. 기존 package.json 버전의 지원·보안·Next/React/Better Auth/Prisma 호환성을 확인한다.
3. 필요한 의존성만 설치하고 package-lock.json으로 버전을 고정한다. TLS·패키지 무결성 검증을 유지한다.
4. Prisma Client 생성과 타입 검사를 실행한다. 발견한 문제는 A2에 필요한 범위에서 수정하고 결과를 기록한다.
5. DB 준비와 인증 통합 테스트는 A3/A4로 남긴다. 외부 권한이나 환경 문제로 검증이 막히면 구체적 오류와 미검증 범위를 남긴다.

클라우드 작업은 이미 격리된 환경이므로 기존 체크아웃을 사용한다. 사용자의 별도 요청 없이 worktree를 만들지 않는다.
