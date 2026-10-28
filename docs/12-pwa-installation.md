# B2 PWA 설치 기반

작성일: 2026-10-28 (Asia/Seoul).

## 구현

- `/manifest.webmanifest`: 안정적인 id·scope·start_url `/`, standalone, 한국어 이름, 테마·배경색.
- public/icons: SVG 원본과 PNG 192/512, 별도 maskable 512, Apple touch 180. 마스크 안전 영역 안에 심볼을 배치했다.
- root layout의 아이콘·Apple 웹앱 메타데이터, viewport-fit 및 theme-color.
- 루트에서 beforeinstallprompt를 보관하고 설정 화면에 설치 동작을 제공한다. 사용자가 누를 때만 브라우저 prompt를 호출하며 취소·실패를 표시한다.
- 지원하지 않거나 이미 설치돼 이벤트가 없으면 브라우저 메뉴 안내를 표시한다. iOS는 Safari 공유 메뉴 안내를 제공한다. 비보안 접속은 HTTPS가 필요하다고 알린다.
- appinstalled 알림과 standalone 실행 모드를 구분해 일반 브라우저 탭에서 설치 직후 ‘앱으로 사용 중’이라고 오표시하지 않는다.
- 설치하지 않아도 동일한 웹 기능을 이용할 수 있고, 제거해도 서버 계정·기록은 삭제되지 않는다고 안내한다.
- 아직 서비스 워커·오프라인 캐시·업데이트 처리는 없다. 현대 Chromium 설치에는 오프라인 지원이 필수는 아니며 B3에서 해당 정책을 추가한다. 현재 앱은 온라인 사용을 전제로 한다.

## 검증 결과

- 운영 build 성공. manifest가 로그인 없이 제공되고 아이콘이 standalone 산출물에도 포함된다.
- Chromium 154.0.8037.57의 실제 창을 Xvfb에서 실행해 로컬 HTTPS로 설치했다. TLS 오류 무시 플래그나 ignoreHTTPSErrors를 사용하지 않았다.
- Playwright+CDP는 manifest·PNG 응답·installability 오류 0건을 확인하고 실제 PWA.install/PWA.launch/PWA.uninstall을 실행했다. 자동화 설치에서는 별도의 사용자 설정인 ‘앱 창으로 열기’를 PWA.changeAppUserSettings로 명시했다. 미디어 표시 모드를 가짜로 바꾸지 않았다.
- 브라우저에서 로그인한 계정이 설치 앱에서도 유지되고, 설정 딥링크·standalone 미디어 모드·설치 앱 상태 표시·종료 후 재실행과 같은 계정을 확인했다. 앱 제거 뒤에도 브라우저의 서버 세션이 유효함을 확인했다.
- HTTPS PWA 테스트 총 3개(상위 1+하위 2) pass, fail/skip 0. headless 초기 검증에서 앱 창 모드를 확인하지 못한 결과는 완료 근거로 사용하지 않았다.
- 운영 테스트에 별도 모의 이벤트로 설치 취소·사용자 클릭 전 prompt 미호출·설치 완료 후 브라우저 안내를 추가했다. 모의 UI 테스트는 실제 설치 검증과 구분한다.
- 최종 타입 검사 통과. 운영 회귀 테스트 총 3개 pass, fail/skip 0(설치 UI 취소 분기 포함).

## 재현

먼저 08-local-database.md의 DB 준비와 `npm run build`가 필요하다. Chromium 실행 경로는 CHROMIUM_PATH로 변경할 수 있다. 다음 기본 명령은 localhost의 보안 컨텍스트 예외를 사용한다. 실제 HTTPS 결과로 보고하지 않는다.

```bash
npm run test:pwa
```

실제 HTTPS·앱 창 검증:

```bash
XVFB_PATH=/workspace/.cache/pwa-xvfb/root/usr/bin/Xvfb python scripts/test-pwa-https.py
```

해당 Xvfb 경로는 이번 클라우드 인스턴스에서 Debian 공식 서명 패키지를 검증 후 추출한 위치다. 다른 환경은 Xvfb 설치 또는 DISPLAY와 Chromium·openssl·certutil을 준비한다. Chromium의 기존 사용자 NSS DB에 임시 CA를 추가·삭제할 쓰기 권한이 필요하다. 권한이 없으면 검증이 실패하며 인증서 검증 해제로 우회하지 않는다.

helper는 localhost 전용 인증서와 단기 테스트 CA를 임시 디렉터리에 생성하고 기존 신뢰를 유지한 채 CA 하나만 임시 추가한다. Node의 기존 추가 CA도 보존한다. 종료 시 테스트 CA·개인키·Xvfb를 정리하며, 테스트는 앱 설치·브라우저 프로필·임시 계정을 제거한다. 검증용 인증서나 실제 .env를 저장소·배포 산출물에 넣지 않는다. 이 인증서는 실제 운영 TLS용이 아니다.

직접 준비한 신뢰 가능한 로컬 인증서로 실행하려면 PWA_HTTPS_CERT_FILE/PWA_HTTPS_KEY_FILE, Node의 CA 신뢰, Chromium의 CA 신뢰를 모두 제공하고 `PWA_HEADFUL=1` 및 DISPLAY를 지정한다. 단순 HTTPS 서버 실행만으로 인증서 신뢰가 검증됐다고 간주하지 않는다.

## 한계 및 다음 작업

Chrome의 실제 설치 메뉴 클릭 UX·Android 실물 기기·Safari 홈 화면 추가·NAS 공인 도메인/HTTPS 배포는 아직 미검증이다. 이번 결과는 로컬 HTTPS Chromium의 실제 프로토콜 설치·앱 창 실행 검증이다. 실물 기기와 운영 주소 검증은 E2에서 반복한다.

다음 B3은 서비스 워커, 오프라인 안내, 업데이트 안내 및 안전한 전환이다. 개인 API·인증·초대 응답은 공용 캐시에 넣지 않는다. 운동 초안 복구는 C7이며 완전 오프라인 동기화를 의미하지 않는다.
