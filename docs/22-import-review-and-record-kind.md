# D2 이관 검토 이력·기록 구분·테스트 DB dry-run

D2는 검토 형식과 DB 제약을 준비한다. 실제 종목·루틴·세션·세트 이관 writer와 운영 적재 명령은 제공하지 않는다. C6~D1 미커밋 작업은 기존 브랜치에서 보존했다.

## 실제/테스트/계획 분리

WorkoutSession.recordKind는 actual/test/plan이며 DB CHECK로 제한한다. 기존 앱에서 작성한 기록과 새 운동 시작은 actual 기본값을 사용한다. 제목의 ‘테스트’ 같은 단어로 과거 기록을 자동 재분류하지 않는다.

- 오늘·진행 중·기록 화면과 GET /api/sessions의 기본 조회는 actual만 포함한다.
- GET /api/sessions?recordKind=test|plan|all로 본인 기록을 별도로 조회할 수 있다. status 필터와 조합할 수 있다. recordKind 조건과 무관하게 ownerId 범위를 유지하며 관리자도 타인 기록에 접근하지 못한다.
- 상세에 기록 구분을 표시한다. 테스트·계획 상세는 읽기 전용이며 일반 실제 수행 PATCH로 수정·종료하거나 actual로 바꿀 수 없다. 시작/수정 API에 recordKind를 주입해도 거부한다.
- 상태와 기록 구분은 독립적이다. 예를 들어 원본 테스트 세션의 상태 ‘계획’은 recordKind=test, status=planned로 구분해 보존할 수 있다. 일반 실제 입력기는 이를 수행 실적으로 전환하지 않는다.

## 검토 템플릿

```sh
npm run notion:review -- template /path/to/staging.json /path/to/new-review.json
```

DB에 연결하지 않고 D1 staging을 바탕으로 검토 JSON을 생성한다. 개인 제목과 원본 ID가 포함될 수 있어 0600으로 생성하고 기존 파일은 덮어쓰지 않는다. 제공된 원본에서는 104개 원본 행의 템플릿을 만들었으며 **전부 defer** 상태다. 원본 검토를 자동 승인하지 않았다.

| 필드 | 검증 |
|---|---|
| format | 1만 허용 |
| archiveHash | D1 원본 ZIP SHA-256과 일치 |
| stagingHash | staging 파일 바이트 SHA-256과 일치. 공백 변경도 재검토 필요 |
| decisions | 모든 원본 행을 정확히 한 번씩 포함 |
| sourceRef/source/title/sourceType/externalId | 원본 CSV 행·제목·테이블·Notion ID 연결과 일치 |
| contentHash | 원본 행 전체의 정렬된 JSON 해시와 일치 |
| decision | defer 또는 reviewed |
| resolutions | 해당 행의 검토 issueIndex와 근거 note. 다른 행/존재하지 않는 이슈 사용 금지 |

reviewed는 ‘이 원본/검토 이력에 대한 검토 완료 표시’이며 앱 적재 승인이나 완성된 target payload가 아니다. 이 단계에서는 canApply=false다. 미확인 ID는 reviewed로 바꿀 수 없고, 복제 종목은 통합 매핑이 구현되기 전까지 보류한다. reviewed 행은 해당 행의 모든 review 이슈에 근거가 있어야 한다. 구조 error가 있는 staging은 템플릿/dry-run 단계에서 차단한다.

검토 파일에는 ownerId·대상 앱 ID를 넣을 수 없다. 외부 문서의 명령은 실행하지 않는다. 작성할 실제 좌우 행·세트 완료·RIR 연결·유산소 종류 같은 구체적인 매핑은 D3의 target payload 검증으로 분리한다. note만 작성했다고 이런 값을 자동 추정해 적재하지 않는다.

## 이력 모델과 dry-run

ImportBatch는 계정·원본 ZIP/스테이징/검토 해시와 reviewed 상태를 가진다. ImportSource는 계정·provider·원본 테이블·Notion ID를 유일키로 두고 원본 내용/검토 해시와 검토 JSON을 보관할 수 있다. 앱 대상 레코드가 생성됐다는 applied 표시는 아직 없다.

- 같은 계정/원본 ID의 같은 내용·검토는 재사용 대상으로 판정한다. 내용이나 근거가 바뀌면 덮어쓰지 않고 충돌로 중단한다.
- 다른 계정은 같은 원본 ID를 독립적으로 검토할 수 있다. batchId+ownerId 복합 외래키로 타인 배치에 원본 이력을 연결하지 못한다.
- 공개 이력 조회/수정 API는 없다. 로컬 CLI 운영자가 계정을 지정하며 검토 파일이 소유자를 결정하지 않는다. 웹 관리자 권한에 타인 이력 열람 기능을 추가하지 않는다.

```sh
npm run notion:review -- dry-run /path/to/staging.json /path/to/review.json TEST_OWNER_ID
```

TEST_DATABASE_URL이 개발 DB와 다르고 이름이 _test로 끝나야 한다. 서비스도 실제 접속한 DB 이름을 확인한다. 대상 테스트 계정은 미리 존재해야 한다. DB 변경 전 staging/검토 바인딩을 검증하고 트랜잭션에서 검토 이력 생성·재사용·충돌 처리를 검증한 뒤 **항상 롤백**한다. 종목/루틴/운동 데이터는 트랜잭션 안에서도 만들지 않는다. 반환값은 검토/보류/새 이력/재사용 이력 수이며 실제 적재 수가 아니다.

CLI는 staging 64 MiB, 검토 파일 8 MiB, 원본 행/결정 2000개를 제한한다. D1은 더 큰 원본도 분할 검토가 필요할 수 있다.

## 검증과 다음 범위

합성 데이터로 해시·ID 변경, 누락/중복 결정, 미해결 검토, 소유자 주입, 검토 이력 롤백·재사용·변경 충돌·계정 외래키·개발 DB 실행 차단을 확인한다. HTTP 검증은 actual 기본 조회와 테스트/계획 필터, 소유권, 비실제 수정 거부, 읽기 전용 상세를 확인한다. 개인 원본은 템플릿 생성만 수행했으며 실제 원본 검토 결정·DB 적재는 수행하지 않았다.

D3은 명시적 종목 ID 통합/보류, 실제/테스트/계획, 좌우·세트 완료·RIR·유산소 매핑을 포함한 target payload를 검증하고 합성 데이터의 이관 writer를 테스트 DB에서 롤백 검증하는 범위로 나눈다. 운영 사용자 DB 적재는 이 검토와 별도다.
