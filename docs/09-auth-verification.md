# A4 인증·초대 검증 결과

검증일: 2026-10-28 (Asia/Seoul). 경로: `/workspace/EasyWeightBaby`.

## 실행

개발·테스트 DB 시작 절차는 `08-local-database.md`를 따른다. `.env`의 TEST_DATABASE_URL이 실제 테스트 DB를 가리켜야 한다. 두 테스트는 Next 개발 서버의 `.next` 디렉터리를 공유하므로 동시에 실행하지 않는다.

```bash
cd /workspace/EasyWeightBaby
npm run test:integration
npm run test:browser
npm run typecheck
npm audit --cache /workspace/.cache/npm
```

브라우저 검증은 playwright-core와 별도 설치된 Chromium을 사용한다. 이번 환경은 `/usr/bin/chromium`을 사용했다. 다른 환경에서는 CHROMIUM_PATH에 실행 파일 경로를 지정한다. 브라우저가 없으면 실패하며 검증 통과로 처리하지 않는다. 이 프로젝트는 playwright-core만 설치하고 Chromium을 npm 설치 과정에서 자동 다운로드하지 않는다.

## 실제 결과

- HTTP 통합: 상위 1개+하위 5개, 총 6개 pass, fail/skip 0.
- 브라우저: 상위 1개+1280px·390px 시나리오 2개, 총 3개 pass, fail/skip 0.
- 타입 검사 통과. npm audit 취약점 0건.

HTTP는 비로그인 접근·일반 회원의 관리자 API·잘못된 Origin·타인 기록 접근(관리자 포함)·공개 가입 차단·잘못된/만료/취소/이메일 불일치 초대·동시 가입 한 건만 성공·기본 member 역할·로그아웃 세션 무효화·중복 계정 실패 시 초대 사용 롤백을 확인했다.

브라우저는 관리자 로그인→초대 발급→독립 브라우저 컨텍스트에서 가입→회원 로그인→관리자 메뉴 미노출 및 API 403→로그아웃→API 401을 확인했다. 초대 토큰이 fragment에서 입력 필드로 옮겨진 뒤 URL에서 제거되는지, 회원 홈에 가로 넘침이 없는지, 처리 중 pageerror가 없는지도 확인했다. PC·모바일 모두 실제 headless Chromium이며 실물 휴대폰 테스트는 아니다.

각 실행은 임의의 테스트 계정과 인증 비밀값을 사용하고 생성한 계정·초대를 정리한다. 테스트 서버와 브라우저는 종료하며 DB 컨테이너는 유지한다. 비밀번호·초대 토큰·개인 기록 원문을 결과물이나 스크린샷에 저장하지 않았다.

## 변경 범위와 남은 검증

- 앱 로직은 변경할 필요가 없었다.
- HTTP 테스트는 TEST_DATABASE_URL 누락 시 skip 대신 실패하고 개발 DB와 동일한 대상도 거부한다.
- 별도 브라우저 테스트와 npm test:browser 명령을 추가했다.
- Next dev가 생성한 루트 AGENTS.md를 보존했다.
- 운영 빌드·standalone 실행·초기 관리자 CLI·HTTPS 쿠키·설치형 PWA·실제 NAS 배포는 이 결과에 포함되지 않는다. 다음 A5에서 운영 빌드·실행을 확인하고 이후 B단계에서 브라우저·PWA 기반을 확장한다.
