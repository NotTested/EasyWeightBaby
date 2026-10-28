# 회원님? 프로젝트 인계 문서

작성일: 2026-10-27 (Asia/Seoul)

## 바로 이어서 할 일

단계 2의 소스는 작성했지만 의존성 설치와 실행 검증을 완료하지 못했습니다. 새 채팅에서는 기존 코드를 보존하고, 네트워크·패키지 설치와 PostgreSQL 테스트 환경을 확보한 뒤 타입 검사·마이그레이션·인증 통합 테스트부터 진행하세요. 설계부터 다시 시작하거나 현재 상태를 배포 완료로 설명하면 안 됩니다.

이 문서와 RESUME_PROMPT.txt는 이전 대화를 보지 않아도 이어갈 수 있도록 작성한 작업 맥락입니다. 소스의 실제 동작 여부는 검증이 필요합니다.

## 사용자 요구와 결정

- 프로젝트 가칭: ‘회원님?’ 운동관리 웹앱.
- 본인과 친구·동료가 함께 사용. 초대 가입, 개인 운동 기록 기본 비공개.
- 모바일 브라우저 우선. 근력운동·유산소·주간 루틴·마지막 RIR 관리.
- 최종 배포: Synology DS423+, RAM 18GB, Portainer에서 Docker Compose 스택 운영. 이미지 대상 linux/amd64.
- ChatGPT와 연결하고 Notion 등 외부 자료를 가져오는 방법 검토·구현.
- 스택: Next.js/TypeScript, PostgreSQL, Prisma, Better Auth, Zod. OpenAI API·Notion API·후속 MCP.
- 초기에는 앱과 DB를 하나씩 운영하고 Redis는 도입하지 않음.
- 클라우드 Sites 배포가 아닌 사용자의 NAS에서 자체 운영하는 것이 목표.
- 사용자는 단계별 진행을 여러 차례 요청했으며, 반복적인 중단·장시간 도구 대기가 발생한 상태. 진행 상황을 짧게 알리고 실제 결과를 근거로 보고할 것.

## Notion에서 확인한 현행 관리 방식

이 채팅에서는 ChatGPT ‘운동 루틴 관리’ 프로젝트 내부 대화를 직접 열람하지 못했습니다. 연결된 Notion의 아래 자료를 읽고 설계했습니다. 원본은 수정하지 않았고 원본 전체 내보내기·개인 운동 데이터 복제는 하지 않았습니다. 필요하면 새 채팅에서 Notion 연결을 통해 다시 조회하세요.

- 운동 루틴 관리: https://app.notion.com/p/3f9b44ad9e11816fbf1cd1480113df6d
- 운동 종목: https://app.notion.com/p/240dc1ef730b4848aaf8a33b45382d82
- 주간 루틴: https://app.notion.com/p/ed29c16f16044c87aa4df6ea45265bbd
- 운동 세션: https://app.notion.com/p/3dba026d74c440cfbde7571b0f6a0b16
- 수행 기록: https://app.notion.com/p/e0b9130ebb3a4372bea35e2a24aef4c3
- ChatGPT 운동 기록 운영 지침: https://app.notion.com/p/3f9b44ad9e11817aace2de3a0406394f

기존 데이터 소스 ID:

| DB | data source ID |
|---|---|
| 운동 종목 | 839435db-5999-42b1-a4a4-b0e209a9281d |
| 주간 루틴 | 01878e9c-ce22-4eeb-9536-1af21c976b19 |
| 운동 세션 | 506fd09d-d2c6-4a37-9f05-7c0f144f84ab |
| 수행 기록 | c3b5204b-3f6d-4c5c-8ac4-d9b44f491907 |

확인한 기록 규칙:

- 날짜는 Asia/Seoul. 덤벨 중량은 한 개당 kg.
- `RDL 19kgx2 15 15 15 RIR 2` = 루마니안 데드리프트, 덤벨 19kg 2개, 15회 3세트, 마지막 세트 RIR 2.
- 마지막 RIR은 그날 전체가 아니라 해당 종목의 마지막 실제 본세트에 연결. 앞선 세트 RIR은 추정하지 않음.
- 운동 계획과 실제 수행을 분리. 실제와 테스트 데이터를 구분하고 테스트는 실적 통계에서 제외.
- 덤벨 수와 좌우 수행 측수를 구분. 좌우 반복이 다르면 실제 값을 보존하며 이중 계산 금지.
- 기존 Notion은 수행 기록 한 행에 1~4세트 반복, 기본 중량과 2~4세트 변경 중량을 저장. 앱은 개별 세트 행으로 정규화해 가변 세트·중량 변경 지원.
- 운동 중량·반복·RIR뿐 아니라 자세 안정성 등도 고려해 다음 목표를 제안. 루틴을 임의로 수정하지 않음.
- ‘기록 없음’과 ‘실패’, ‘RIR 미입력’과 ‘RIR 0’을 구분.

## 현재 파일과 구현 상태

이전 작업 경로는 `/workspace/member-app`입니다. 새 환경에서는 첨부 ZIP을 풀어 생성되는 `member-app/` 디렉터리를 프로젝트 루트로 사용하세요. 기존 작업공간이 자동으로 이어진다고 가정하지 마세요.

| 영역 | 작성된 내용 | 실제 검증 |
|---|---|---|
| 설계 | 단계별 계획, ERD, 화면, 연동·운영, 개발 실행 문서 | 문서 링크·코드 블록 점검 |
| 프레임워크 | Next.js App Router, TypeScript, 반응형 CSS | 빌드 미실시 |
| 인증 | Better Auth 로그인·서버 세션·로그아웃, 라이브러리 공개 가입 차단 | DB/HTTP 미검증 |
| 초대 | 관리자 발급·목록·취소, 토큰 해시, 이메일 제한·만료, 가입 트랜잭션 | DB/HTTP 미검증 |
| 화면 | 로그인, 초대 가입, 홈, 관리자 초대 화면, 오류 화면 | TSX 타입·브라우저 미검증 |
| DB | Prisma 스키마와 수작업 초기 SQL 마이그레이션 | Prisma 검증·실제 적용 미실시 |
| 소유권 | 인증된 사용자 조건으로 본인 운동일지 목록·상세 조회 | 통합 테스트 미실시 |
| 도구 | 최초 관리자 생성 CLI, 개발 DB Compose, health API | 실행 미검증 |
| 테스트 | 입력 검증 및 인증·초대·소유권 HTTP 통합 테스트 코드 | 의존성 없어 실행 못 함 |

통과한 검사는 Node.js `--check`로 실행한 비-TSX TypeScript 구문 검사, JSON 파싱, 문서 링크·코드 블록 검사입니다. 이는 타입 검사나 앱 실행 검증을 대신하지 않습니다.

없는 항목: node_modules, package-lock.json, 실제 .env, 사용자 계정·DB, 실행된 앱, Dockerfile·운영 Compose·Docker 이미지·실제 배포. `compose.dev.yaml`은 개발 DB 전용입니다.

운동일지 생성, 종목·루틴 관리, 세트 입력, 통계, 자연어 파싱, AI·Notion·MCP 연동은 아직 구현하지 않았습니다. DB의 WorkoutSession은 단계 2 소유권 검증을 위한 최소 모델입니다. 설계 ERD 전체가 스키마에 구현됐다고 가정하지 마세요.

## 핵심 파일 안내

- docs/01-plan.md: 단계와 완료 기준.
- docs/02-data-model.md: 전체 목표 ERD, 마지막 RIR·중량·소유권 규칙.
- docs/03-screens.md: 목표 화면 명세.
- docs/04-integrations-deployment.md: API·AI·Notion·MCP·NAS 운영 설계.
- docs/05-development.md: 실행 절차와 미검증 항목.
- prisma/schema.prisma, prisma/migrations/: 현 단계 스키마·초기 마이그레이션.
- src/lib/auth.ts: Better Auth 설정. APP_URL·BETTER_AUTH_SECRET을 모듈 로드 시 검증.
- src/lib/invitations.ts: 토큰 해시, 초대 선점·사용자/계정 생성 트랜잭션, 가입 요청 제한.
- src/lib/http.ts, access.ts: Origin 검사·입력 제한·인증·관리자·소유권 조건.
- src/app/api/: 인증, 가입, 초대, me, health, 일지 조회 API.
- scripts/create-admin.ts: 대화형 초기 관리자 생성. 관리자 존재 시 중복 생성 거부.
- tests/integration/auth.test.ts: 별도 테스트 DB에서 앱을 띄우는 HTTP 검증.

## 중단 원인과 재개 시 주의

이전 환경은 Node 24.19.0 / npm 11.9.0이었고 Docker CLI는 있었습니다. 환경 서비스는 외부 HTTP 정책이 unrestricted/enforced라고 보고했으나, 명령 샌드박스에서는 프록시 연결과 Docker 소켓 접근이 거부됐습니다.

- 기본 샌드박스 curl: `Failed to connect to proxy port 8080`.
- Docker 소켓: `operation not permitted`.
- npm 오프라인 설치: `ENOTCACHED` (@prisma/client 캐시 없음).
- 네트워크 추가 권한을 요청한 도구 호출이 장시간 대기하다 사용자에 의해 중단됨. 설치 진행이나 자동 승인 심사 거절이 확인된 것은 아님.

같은 권한 요청을 반복해 장시간 대기하지 마세요. 새 환경의 지원되는 네트워크·프록시·권한 상태를 먼저 확인하고, 막히면 정확한 오류와 필요한 실행 환경을 짧게 보고하세요. 보안 검사 해제나 정책 우회는 하지 마세요. 대기 상태를 npm 설치 중으로 보고하지 마세요.

## 재개 순서

1. 이 문서·README·docs/05-development.md·실제 소스·로컬 지침을 읽고 현 상태 확인.
2. 의존성 설치 가능한 환경 확보. package.json의 버전 범위는 아직 호환성 검증 전이므로 지원 버전·보안·Prisma/Better Auth 조합 확인 후 설치하고 lockfile 생성.
3. 개발 PostgreSQL 준비. 별도 `_test` DB도 생성. `.env.example`을 기준으로 로컬 비밀값을 생성하고 실제 값은 인계 문서·로그에 노출하지 않음.
4. `npm run db:generate`, `prisma validate`, `npm run db:deploy`. 수작업 SQL과 Prisma 모델·인증 라이브러리 스키마 일치 확인.
5. `npm run typecheck`, `npm test`, `npm run build`. 빌드에서도 APP_URL·BETTER_AUTH_SECRET·DATABASE_URL 설정이 필요할 수 있음.
6. `TEST_DATABASE_URL=... npm run test:integration`. TEST_DATABASE_URL이 없으면 skipped이므로 통과로 보고하면 안 됨. 이름이 `_test`로 끝나는 DB만 사용.
7. 초기 관리자 CLI와 브라우저에서 로그인·초대·로그아웃을 점검. 문제를 수정하고 단계 2 결과를 보고.
8. 단계 3: 종목 → 주간 루틴 → 운동 시작 → 세트별 기록 → 마지막 RIR → 운동 종료 → 재조회 구현.
9. 기록 비교 → AI → Notion 가져오기 → NAS 운영 이미지/Compose·백업복구 → 후속 MCP 검증 순서로 진행.

통합 테스트는 3197 포트에서 자체 Next 개발 서버를 시작하고 테스트용 사용자만 정리합니다. 패키지 설치 후 실제 실행으로 테스트 하네스 자체도 검증해야 합니다. 관리자도 타인 운동 기록에 접근 불가, 초대 동시 사용 시 1건만 성공, 중복 이메일 실패 시 초대 사용 상태 롤백, 로그아웃 후 세션 무효화가 중요합니다.

## 아직 필요한 운영 정보

NAS에서 기존 실행 중인 서비스, Portainer 상태, 도메인·HTTPS·외부 접속 방식, 최초 사용자 수, AI 비용·키 운영 방식. 이 정보는 로컬 단계 2 검증을 막는 조건이 아니며 실제 배포 전 확인하면 됩니다.

## 내보내기 범위

이 압축 파일은 프로젝트 소스·설계·검증 코드·인계 문서의 스냅샷입니다. 이전 채팅 전체, Notion 원본 데이터, 연결된 앱의 권한, 실행 환경 권한은 자동 이전되지 않습니다. 실제 비밀키·자격증명·DB 백업을 포함하지 않습니다.
