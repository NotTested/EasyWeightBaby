# 개발·테스트 DB 실행 (A3)

작업 경로: `/workspace/EasyWeightBaby`. 실제 자격증명은 Git에서 제외된 `.env`에만 저장한다. 다음은 로컬 개발용이며 NAS 운영 스택이 아니다.

```bash
cd /workspace/EasyWeightBaby
python scripts/init-dev-env.py
docker compose -f compose.dev.yaml up -d --wait
npm run db:deploy
npm run test:db
```

관리형 클라우드에서는 먼저 플랫폼 Docker 런타임 지침에 따라 로컬 소켓을 확인한다. 이번 환경에서 실제 사용한 Docker 명령 접두사는 다음과 같다. 다른 Docker context나 원격 데몬을 변경하지 않는다.

```bash
env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH docker --host=unix:///var/run/docker.sock compose -f compose.dev.yaml up -d --wait
```

개발 DB는 127.0.0.1:5432/member, 테스트 DB는 127.0.0.1:5433/member_test이다. 컨테이너·비밀번호·영구 볼륨을 분리했다. 컨테이너 healthy뿐 아니라 Prisma를 통한 실제 저장·조회·수정·삭제로 검증한다.

환경 초기화 스크립트는 기존 .env를 덮어쓰지 않는다. .env가 이미 있으면 이름과 설정 상태만 확인해 필요한 항목을 보완하고 값을 로그에 출력하지 않는다. 기존 볼륨을 사용하는 상태에서 비밀번호만 새로 생성하면 DB 비밀번호가 바뀌지 않아 접속이 실패하므로 .env를 보존한다. `down -v`는 데이터를 삭제하므로 일상적인 종료 명령으로 사용하지 않는다. 중지는 `docker compose -f compose.dev.yaml stop`, 다시 시작은 `up -d --wait`를 사용한다.

`npm run test:db`는 TEST_DATABASE_URL이 없으면 실패하며 DB 이름이 _test로 끝나고 개발 DB와 다른지 검사한다. 테스트 DB에 마이그레이션을 적용하고 고유한 테스트 사용자·운동·임시 스키마만 생성 후 제거한다. 기존 사용자의 기록을 전체 삭제하거나 DB를 reset하지 않는다.

A3에서 개발·테스트 마이그레이션, 반복 적용, CRUD, 트랜잭션 롤백, 외래키, 비-public schema 옵션을 확인했다. 테스트 출력은 상위 테스트 1개+하위 5개로 총 6개 통과다. 개발 DB와 Prisma 스키마 차이도 없었다. HTTP health API, 인증 흐름, 실제 운영 빌드 및 NAS 복구 검증은 이 결과에 포함되지 않는다.

이미지 검증 당시 digest: `postgres@sha256:858bb5e98eed02eb8cafbcdc007f9a65d1b613972028944a8ec2133ccaf80d27`. 현재 Compose는 개발용 17-bookworm 태그를 사용한다. 운영 이미지 버전·digest 고정은 E1에서 진행한다.
