# D3 명시적 이관 매핑과 저장 그래프 dry-run

D1 staging, D2 검토 파일, D3 target 파일을 검증하고 테스트 DB 트랜잭션 안에서 실제 앱 모델에 저장한 뒤 읽어 보고 항상 롤백한다. apply/운영 적재 명령은 없다. 개인 원본은 전부 보류 상태를 유지하며 합성 데이터로 writer를 검증했다.

## 명령

```sh
npm run notion:target -- template STAGING REVIEW NEW_TARGET
npm run notion:target -- validate STAGING REVIEW TARGET
npm run notion:target -- dry-run STAGING REVIEW TARGET TEST_OWNER_ID
```

파일 제한은 staging 64 MiB, 검토/target 각각 8 MiB다. template은 0600으로 새 파일만 만들고 입력에서 target 값을 추정해 채우지 않는다. 검토 완료 행이 있으면 빈 template은 매핑을 작성하기 전까지 검증에 실패한다. validate는 DB에 연결하지 않는다. dry-run은 TEST_DATABASE_URL과 실제 접속 DB 이름이 `_test`인지, 개발 DB와 다른지 확인하며 대상 계정이 미리 존재해야 한다.

canApply는 항상 false다. CLI는 해시·집계만 출력하며 개인 세트/메모 전체를 로그에 출력하지 않는다. 대상 파일의 ownerId·앱 레코드 ID·공용 종목 쓰기·인증 정보·알 수 없는 속성은 허용하지 않는다. 계정은 신뢰된 로컬 운영자가 파일 밖에서 지정한다.

## Target 파일 구조

format=1, stagingHash, manifestHash와 아래 배열을 가진다. 검토 파일은 D2 형식이며, staging 바이트·검토 해시·원본 ID·내용 바인딩을 그대로 검증한다. 모든 reviewed 행은 정확히 한 번 매핑하고 defer 행은 사용할 수 없다. 미확인 ID는 reviewed가 될 수 없다.

| 배열 | 명시할 값 |
|---|---|
| exercises | sourceId, create+fields 또는 merge+intoSourceId, mappingNote |
| routines | key/name, mappingNote, 7일의 weekday/rest/items. 각 항목은 sourceId와 Notion exerciseId, 목표 세트/반복/RIR/각도/메모 |
| sessions | sourceId, title, localDate, recordKind, status, actualNotes, cardio, mappingNote |
| logs | sourceId, sessionSourceId, exerciseSourceId, position, snapshot, benchAngle, notes, rirDecision, mappingNote, sets |

- sourceId/exerciseId/intoSourceId는 32자리 Notion ID다. 새 앱 ID는 트랜잭션 안에서 생성한다. 기존 앱 ID를 이름으로 검색해 재사용하거나 다른 계정의 종목에 연결하지 않는다.
- create는 명시한 Exercise 필드로 **개인 종목**만 만든다. 같은 계정의 정규화된 이름이 이미 있으면 중단한다. 기존 종목을 덮어쓰지 않는다.
- merge는 이번 파일에서 create한 원본 종목을 직접 가리켜야 한다. 자기 참조·순환·중간 merge 체인은 금지한다. 복제 종목은 명시적 merge 또는 보류만 허용한다. 별칭은 create.fields.aliases에 명시한 것만 저장하며 이름이 같다는 이유로 자동 추가하지 않는다.
- D2 validateReview의 기본 복제 종목 보류 규칙은 유지한다. D3 경로에서만 복제 검토를 허용한 뒤 반드시 target의 명시적 merge를 검증한다.
- 루틴의 주간 묶음과 휴식일은 사용자가 배열에 모두 명시한다. 새 루틴/v1을 만들고 참조 종목의 이름·도구를 목표 스냅샷에 보존한다. 원본 루틴 관계·요일은 바꾸지 않는다. 실제 세션에 이 루틴을 임의 연결하지 않는다.
- 세션의 기록 구분/날짜/상태는 staging과 같아야 한다. 실제/테스트/계획을 전환하지 않는다. 시작·종료 시각은 NULL로 두며 사용자의 계정 시간대를 사용한다. 원본에 없는 목표 필드를 실제 로그에 채우지 않는다.
- snapshot은 실제 로그 당시의 name/equipment/execution/measurement를 명시한다. 새 사전의 현재 이름으로 과거 수행 이름을 자동 교체하지 않는다. 세트 검증과 볼륨 계산에도 해당 스냅샷의 장비를 사용한다.
- 세션·종목의 관계 ID와 로그 날짜/기록 구분은 원본과 일치해야 한다. 세션 내 종목 position은 중복할 수 없다.

## 세트·좌우·RIR

sets는 C4~C6의 중량·덤벨 수·반복·완료·측·본세트/워밍업·실제 RIR에 sourceSlot(원본 1~4 슬롯 번호)을 추가한다. 값/완료 여부는 입력자가 명시하며 슬롯이 채워졌다는 이유로 완료를 추정하지 않는다.

- 채워진 원본 슬롯을 빠짐없이 매핑하고 없는 슬롯을 만들어내지 않는다. 알려진 중량은 보존하고, 단일 행의 알려진 반복도 보존한다. 실제 0은 NULL이나 양수로 바꿀 수 없다.
- 좌우로 분리할 때는 한 슬롯에 왼쪽/오른쪽 각 한 행만 허용한다. 좌우 실제 반복을 각각 명시하고 mappingNote에 근거를 남긴다. 복제된 동일 행이나 양측 동시+한쪽 행의 혼합을 허용하지 않는다. 좌우 대칭을 자동 가정하지 않는다.
- 원본 마지막 RIR을 연결할 때는 rirDecision=preserve-last로 지정한다. 마지막 완료 본세트의 원본 슬롯이 원본 마지막 RIR 후보 슬롯과 같고 값이 같아야 한다. 이전/다른 행에 RIR을 복사할 수 없다.
- 연결이 불명확하면 rirDecision=defer로 보류하고 모든 세트 RIR을 NULL로 둔다. 원본 RIR이 미입력이면 값을 만들지 않는다. 원문은 staging에 남긴다.
- 유산소 종류·분 단위 시간·선택 km 거리·강도·메모·완료는 세션 target에서 명시한다. 완료에는 시간이 필요하다. 자유형 Zone 설명을 보존하며 메모만으로 종류나 완료를 자동 추정하지 않는다.

검증 보고서의 volumeKg는 **actual 세션의 완료 행만** kg×덤벨 개수×해당 행 반복으로 합산한다. 좌우 측수를 다시 곱하지 않는다. bodyweight 외부 중량은 0이며 운동 강도 0을 뜻하지 않는다. 테스트/계획 수행을 실제 실적으로 합산하지 않는다. 종목 간 kg 합계를 동일한 훈련 강도로 해석하지 않는다.

## 트랜잭션과 검증 결과

테스트 DB에 검토 이력 → 개인 종목/통합 매핑 → 루틴/v1/요일/항목 → 세션/실제 로그/세트/유산소를 생성한다. 생성 결과를 다시 읽어 종류·세트·스냅샷·미기록 시각·목표 NULL·실제 볼륨을 확인한 후 의도적으로 롤백한다. 이름 충돌처럼 중간에 실패해도 앞서 만든 검토 이력과 데이터는 모두 롤백한다.

합성 fixture는 원본 ID 8개로 종목 생성 1/복제 통합 1/주간 루틴 1/세션 3(actual/test/plan)/로그 2/세트 3/유산소 1을 검증한다. 왼쪽 10회·오른쪽 8회, RIR 0과 NULL, 실제 0과 미완료를 보존한다. 두 번 실행해도 DB에는 남지 않는다. 다른 계정의 같은 이름은 건드리지 않고 같은 계정의 이름 충돌은 덮어쓰기 없이 실패한다. CLI dry-run도 합성 데이터로 실행한다.

이번 검증: 앱/매핑 단위 11개, DB 8개, D1 파서 7개 통과. 운영 빌드·TypeScript 검사 통과. 웹 화면/API와 DB 스키마는 D3에서 바꾸지 않아 HTTP/브라우저/PWA 전체 회귀를 반복하지 않았다.

실제 원본용 target-template.json은 검토 0/보류 104에 대응하는 빈 배열이며 validate 결과도 같은 수치를 확인한다. 실제 원본의 매핑 값을 대신 승인하거나 적재하지 않았다. 기존 D2 이력은 reviewed 상태만 가지며 영구 적용 ID/target 해시 연결·재적재 처리는 아직 구현하지 않았다. 실제 적재는 이를 보완한 별도 단계에서만 진행한다.
