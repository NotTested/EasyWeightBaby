# 회원님? — 운동관리 웹앱

현재 진행: A1~A5 기반 검증, B1~B3 화면·PWA·오프라인 안내·업데이트, C1 종목·C2 루틴·C3 운동 시작/재진입·C4 실제 세트 입력·C5 좌우/마지막 RIR·C6 유산소/메모/운동 종료·C7 입력 초안/복구 완료. D1 Notion 이관 미리보기 완료. D2 검토 이력·기록 구분·테스트 DB dry-run 완료. D3 명시적 매핑·저장 그래프 dry-run 완료. D4 검토 자료·대상 추적 준비 완료. D5 기간 조회·이전 실제 수행 비교 완료. E1 Docker 운영 패키징 완료. E2 DSM HTTPS 설정·배포 점검 도구·로컬 HTTPS 설치 검증 완료, 실제 NAS/실물 기기 검증 대기. E3 백업·격리 복원 도구 검증 완료, NAS 스케줄·외부 사본 설정 대기. E4 운영 점검 도구·업데이트/장애 대응 절차 준비 완료, 실제 NAS 적용 대기. 다음은 F1 자연어 규칙 파서다. 운영 점검은 [E4 문서](docs/29-operations-and-updates.md), 백업·복원은 [E3 문서](docs/28-backup-and-restore.md), NAS HTTPS·설치는 [E2 문서](docs/27-nas-https-installation.md), Docker 실행은 [E1 문서](docs/26-docker-production.md), 최신 상태는 [작업 진행표](docs/07-work-tracker.md), 조회·비교는 [D5 문서](docs/25-history-and-comparison.md), 원본 검토 자료는 [D4 문서](docs/24-import-review-packet.md), 이관 대상 검증은 [D3 문서](docs/23-import-target-dry-run.md), 이관 검토·구분은 [D2 문서](docs/22-import-review-and-record-kind.md), 이관 미리보기는 [D1 문서](docs/21-notion-import-preview.md), 초안·복구는 [C7 문서](docs/20-workout-drafts.md), 유산소·종료는 [C6 문서](docs/19-cardio-and-completion.md), 좌우·RIR은 [C5 문서](docs/18-sides-and-rir.md), 실제 세트는 [C4 문서](docs/17-actual-sets.md), 시작·재진입은 [C3 문서](docs/16-workout-start.md), 루틴은 [C2 문서](docs/15-weekly-routines.md), 종목은 [C1 문서](docs/14-exercise-management.md)를 따른다. 실행은 [로컬 DB](docs/08-local-database.md)·[인증 검증](docs/09-auth-verification.md)·[운영 실행](docs/10-production-runtime.md)을 참고한다. 아래의 이전 구현·설치 대기 설명은 내보내기 당시 기록이다.

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
