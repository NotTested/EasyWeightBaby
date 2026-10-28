# 회원님? — 운동관리 웹앱

현재 진행: A1~A5 기반 검증과 B1~B3 화면·PWA·오프라인 안내·업데이트 완료. 다음은 C1 운동 종목 관리다. 최신 상태는 [작업 진행표](docs/07-work-tracker.md), 설치 검증은 [B2 문서](docs/12-pwa-installation.md), 오프라인·업데이트 정책은 [B3 문서](docs/13-offline-updates.md)를 따른다. 실행은 [로컬 DB](docs/08-local-database.md)·[인증 검증](docs/09-auth-verification.md)·[운영 실행](docs/10-production-runtime.md), 화면 구성은 [B1 문서](docs/11-app-shell.md)를 참고한다. 아래의 이전 구현·설치 대기 설명은 내보내기 당시 기록이다.

친구·동료와 함께 사용하는 모바일 우선 운동관리 웹앱의 설계 문서입니다.

다른 채팅에서 재개할 때는 [인계 문서](HANDOFF.md)를 먼저 읽고 [재개 메시지](RESUME_PROMPT.txt)를 사용하세요.

- 운영 환경: Synology DS423+, RAM 18GB, Portainer, linux/amd64 이미지
- 핵심 흐름: 루틴 선택 → 운동 기록 → 이전 수행 비교 → 다음 목표 확인
- 입력 방식: 직접 입력 + 자연어 기록 초안
- 연동: Notion 가져오기, OpenAI API, 후속 MCP 연결
- 현재 단계: 설계 초안 및 계정·초대·DB 기반 소스 작성. 의존성 설치와 DB 통합 검증 대기. Docker 이미지 빌드·실제 NAS 배포 전입니다.

## 문서

1. [단계별 작업계획과 기술 선택](docs/01-plan.md)
2. [ERD와 데이터 규칙](docs/02-data-model.md)
3. [화면·사용 흐름 명세](docs/03-screens.md)
4. [연동·권한·NAS 운영 설계](docs/04-integrations-deployment.md)
5. [개발 실행과 단계 2 검증](docs/05-development.md)

## 설계 근거

사용자가 제공한 요구와 연결된 Notion 자료를 검토했습니다. ChatGPT 프로젝트 내부 대화는 직접 열람하지 않았습니다. 아래 페이지는 외부 원본이며, 이 작업에서는 수정하지 않았습니다.

- [운동 루틴 관리](https://app.notion.com/p/3f9b44ad9e11816fbf1cd1480113df6d)
- [운동 종목](https://app.notion.com/p/240dc1ef730b4848aaf8a33b45382d82)
- [주간 루틴](https://app.notion.com/p/ed29c16f16044c87aa4df6ea45265bbd)
- [운동 세션](https://app.notion.com/p/3dba026d74c440cfbde7571b0f6a0b16)
- [수행 기록](https://app.notion.com/p/e0b9130ebb3a4372bea35e2a24aef4c3)
- [ChatGPT 운동 기록 운영 지침](https://app.notion.com/p/3f9b44ad9e11817aace2de3a0406394f)

Notion에서 확인한 기존 규칙과 앱을 위한 새 설계 제안은 각 문서에서 구분합니다. 문서 작성일: 2026-10-23.
