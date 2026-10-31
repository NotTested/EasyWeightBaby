# E1 Docker 운영 패키징

작성일: 2026-10-29. 대상은 Synology DS423+의 linux/amd64와 Docker Compose v2다. 실제 NAS 배포·공개 HTTPS·실물 Chrome 설치는 E2에서 확인한다.

## 이미지 만들기

저장소 루트에서 실행한다. Dockerfile의 Node 및 PostgreSQL 베이스는 digest로 고정했다. 앱 이미지는 standalone 서버만 포함하고, 마이그레이션·관리자 생성은 별도 tools 이미지에서 실행한다.

```sh
docker build --platform linux/amd64 --target tools -t member-app-tools:20261029 .
docker build --platform linux/amd64 --target runner -t member-app:20261029 .
```

빌드에는 실제 DB·인증 비밀키가 필요하지 않다. 공개된 빌드용 자리표시자만 사용하며 런타임에 파일 비밀키로 대체한다. `.env`, 개인 자료, 로컬 캐시·인증 파일은 빌드 컨텍스트에서 제외한다. 프록시 CA가 필요한 클라우드에서는 BuildKit `--secret id=proxy_ca,src="$CODEX_PROXY_CERT"`를 추가한다. CA는 빌드 단계의 secret mount로만 읽는다. 이 환경의 buildx 설정은 `BUILDX_CONFIG=/workspace/.cache/member-buildx`를 사용했다.

검증 이미지의 Node는 24.22.2, npm은 11.19.1, PostgreSQL은 17.11이다. npm의 의존성 설치 스크립트 승인 경고와 별개로 Prisma Client를 명시적으로 생성하고 실제 컨테이너 마이그레이션으로 확인한다. 레지스트리 푸시는 하지 않았다. NAS에는 두 이미지를 전달하거나 같은 소스로 빌드하고, 검증한 버전 태그를 사용한다.

## NAS 설정 준비

`docker/production.env.example`을 운영 경로의 설정 파일로 복사하고 이미지 이름, 공개 HTTPS 원점, 비밀키 파일의 절대 경로를 채운다. 설정 파일에는 비밀키 값 대신 경로만 넣는다. 파일 비밀키 예시는 다음과 같다.

```sh
mkdir -p .secrets
chmod 700 .secrets
(umask 077; openssl rand -hex 32 > .secrets/db-password)
(umask 077; openssl rand -hex 48 > .secrets/auth-secret)
```

두 파일의 소유 UID/GID를 앱 실행 계정에 맞추고 권한을 0600으로 유지한다. `APP_UID`/`APP_GID`는 그 숫자 값이다(기본 1000:1000). NAS의 별도 UID도 사용할 수 있다. Compose 파일 secret은 호스트 파일 권한을 따르므로 앱·도구가 읽을 수 있어야 한다. 생성한 파일을 터미널에 출력하거나 Git에 넣지 않는다.

`APP_URL`은 `https://workout.example.com`처럼 경로 없는 외부 접속 원점이다. localhost의 HTTP는 로컬 검증에만 허용된다. 앱은 root 실행·누락된 비밀키·잘못된 공개 원점을 거부한다.

## 실행과 관리

다음 명령의 설정 파일 경로는 실제 운영 경로로 바꾼다.

```sh
docker compose --env-file /absolute/path/production.env -f compose.prod.yaml config --quiet
docker compose --env-file /absolute/path/production.env -f compose.prod.yaml up -d --wait
docker compose --env-file /absolute/path/production.env -f compose.prod.yaml ps -a
docker compose --env-file /absolute/path/production.env -f compose.prod.yaml --profile tools run --rm tools admin
```

DB healthy → 일회성 `migrate deploy` 성공 → 앱 시작 순서다. 관리자 생성은 대화형 터미널에서 기존 CLI로 입력한다. 비밀번호를 명령줄 인자로 전달하지 않는다. 일반 실행에서 tools 프로필은 시작하지 않는다. Swarm/Portainer Stack의 조건부 시작 동작은 이 Compose 검증과 같다고 가정하지 않는다.

앱·도구는 non-root, 읽기 전용 루트 파일시스템, 임시 `/tmp`, capability 제거로 실행한다. 기본 공개 포트는 NAS의 `127.0.0.1:3000`이며 DB 포트는 공개하지 않는다. DB는 내부 네트워크와 named volume을 사용하고 로그는 회전한다. 컨테이너 방식의 역방향 프록시는 loopback에 직접 연결할 수 없으므로 E2에서 프록시 배치에 맞게 네트워크를 정한다. 외부 접속은 유효한 인증서의 HTTPS 프록시를 통해 제공한다.

`/api/health`는 DB 연결 상태만 확인한다. 이미지 교체 전에는 백업과 마이그레이션 호환성을 검토한다. `down` 후에도 DB volume은 남는다. 운영에서 `down -v`를 실행하지 않는다. 기존 PostgreSQL volume의 비밀번호는 secret 파일 교체만으로 바뀌지 않으므로 별도 DB 비밀번호 변경 절차가 필요하다. 인증 secret 교체는 기존 로그인 쿠키를 무효화한다. 백업·복원 자동화는 E3 범위다.

## 검증

```sh
npm run test:docker
```

기본 이미지 태그는 `member-app:e1`, `member-app-tools:e1`이며 `E1_APP_IMAGE`/`E1_TOOLS_IMAGE`로 바꿀 수 있다. 로컬 Docker와 Chromium이 필요하다. 테스트는 UUID로 분리한 합성 DB·임시 secret을 만들고 다음을 확인한다.

- amd64, non-root, 이미지에 실제 환경 비밀키 미포함, standalone과 서비스 워커 포함, 별도 UID의 코드 접근.
- DB 포트 비공개, 마이그레이션과 재실행, 앱 health·미인증 차단.
- 실제 브라우저 로그인·화면 hydration·manifest·워커 응답.
- 컨테이너 재생성 후 DB·로그인 유지, 런타임 인증 secret 교체 후 이전 쿠키 거부.

종료 시 테스트 자신의 UUID 프로젝트와 합성 volume만 정리한다. 개발·테스트·운영 DB는 건드리지 않는다. 실제 관리자 계정 생성의 대화형 입력, NAS HTTPS·휴대폰/PC 설치·재실행은 별도 현장 검증 대상이다.
