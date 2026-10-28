# A5 운영 빌드·실행 검증

검증일: 2026-10-28 (Asia/Seoul). Node 24.19.0 / Next.js 16.4.3 / Prisma 7.10.1.

## 로컬 실행

DB와 .env 준비는 08-local-database.md를 따른다. 기존 비밀값과 DB 볼륨은 보존한다.

```bash
cd /workspace/EasyWeightBaby
npm ci --cache /workspace/.cache/npm --no-fund
npm run db:deploy
npm run build
npm start
```

`npm start`는 Node의 `--env-file-if-exists=.env`로 로컬 환경을 읽고 standalone 서버를 실행한다. 배포 환경은 .env 없이 환경변수로 주입할 수 있다. 기본 바인딩은 0.0.0.0:3000이고 APP_HOST와 PORT로 변경한다. APP_URL은 브라우저에서 사용하는 정확한 Origin과 일치해야 한다. 실제 운영 주소에는 HTTPS가 필요하며 이번 테스트의 localhost HTTP는 로컬 예외다.

```bash
APP_HOST=127.0.0.1 PORT=3200 APP_URL=http://localhost:3200 npm start
```

실행 후 내부 요청으로 `/api/health`의 HTTP 200과 `{"status":"ok"}`를 확인한다. 이는 DB 연결을 확인하지만 모든 앱 동작을 대신하지 않는다. 이 문서의 localhost는 내부 검증용이며 외부 접속 링크가 아니다.

## standalone 산출물

빌드 명령은 Prisma 생성→Next 운영 빌드→scripts/prepare-standalone.mjs를 실행한다. Next 기본 동작에서 빠지는 `.next/static`과 존재하는 경우 `public`을 `.next/standalone`에 추가한다. Next가 복사한 루트 dotenv 파일은 산출물에서 제거한다. 원본 로컬 .env는 변경하거나 삭제하지 않는다. 서버 비밀값은 런타임에 주입하며 산출물에 포함하지 않는다.

프로젝트 없이 실행하는 배포 단위는 `.next/standalone`의 내용이다. 해당 디렉터리에서 환경변수를 주입한 뒤 `HOSTNAME=0.0.0.0 PORT=3000 node server.js`로 시작한다. Prisma CLI·마이그레이션 작업은 이 런타임 산출물의 역할이 아니며 NAS 배포 단계에서 별도 작업으로 구성한다.

## 검증 결과

```bash
npm run build
npm run test:production
npm run typecheck
```

- 최종 build 명령 전체 성공. 타입 검사와 정적 페이지 생성·standalone 준비 포함.
- 운영 테스트는 산출물을 임의의 /tmp 디렉터리로 복사하고 그 디렉터리에서 서버를 시작한다. 테스트 DB와 매 실행 임의 인증 secret을 주입하므로 프로젝트의 .env에 의존하지 않는다.
- 총 3개 테스트(상위 1+하위 2) pass, fail/skip 0. DB health·보안 헤더·비인증 API 401·홈 로그인 리다이렉트를 확인했다.
- 실제 Chromium 390px에서 운영 정적 JS/CSS 응답·hydration·로그인·본인 확인 API 200·관리자 API 403·로그아웃 후 401을 확인했다. pageerror와 정적 자원 실패 없음.
- 별도로 실제 `npm start` 명령을 3200 포트에서 실행해 DB health 응답 성공 후 종료했다.
- 첫 테스트 코드의 NODE_ENV 타입 오류를 수정하고 최종 빌드·운영 테스트·타입 검사를 통과했다.
- 테스트 계정·서버·브라우저·임시 산출물은 정리했다. 개발·테스트 DB는 유지한다. Next가 갱신한 tsconfig.json 및 next-env.d.ts는 생성된 타입 경로를 포함한 상태로 보존한다.

dev·브라우저·운영 빌드 테스트는 .next를 공유하므로 빌드와 next dev를 동시에 실행하지 않는다. next dev 검증 뒤에는 배포 전 다시 build한다.

## 이번 범위 밖

Docker 운영 이미지·실제 NAS 배포·HTTPS 쿠키·PWA 설치·백업 복구·최초 관리자 CLI의 대화형 실행은 아직 검증하지 않았다. 이번 결과는 현재 클라우드 인스턴스의 Node standalone 실행 검증이며 NAS 배포 완료를 뜻하지 않는다. 다음 B1은 모바일·PC 공통 내비게이션과 화면 구조 작업이다.
