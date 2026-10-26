# 서비스 탈퇴·정리 재시도·명시적 재가입 계약 v1

구현: 321_auth #76의 구현 커밋 및 PR (완료 보고의 SHA). 스키마는 `007_membership_withdrawal.sql`을 포함한다. 소비 구현: [318 #26](https://github.com/bini59/318_notion_calander/issues/26). 이 문서는 소스에서 구현·테스트한 계약이며 운영 배포 확인을 뜻하지 않는다.

## 인증과 경로

아래 API는 **소비 서비스 서버 전용**이다. 브라우저에 `x-app-secret`을 노출하지 않는다. 모든 요청에 `?client_id=n2c`, 해당 client의 `x-app-secret`, auth의 `sid` 쿠키를 전달한다. 활성 client와 유효한 공통 세션이 필요하며, membership이 없거나 정지·탈퇴 상태여도 아래 본인 확인 및 정리는 가능하다. 사용자 ID는 세션에서만 결정한다. body의 선택적 `userId`, `clientId`, `serviceId`가 본인/인증된 client와 다르면 403이다. client 선택과 secret이 다르면 401이다.

변경 요청은 JSON이며 `csrf` 쿠키와 일치하는 `x-csrf-token`도 필수다. `GET /me`가 세션 검증 후 csrf 쿠키를 발급한다. 소비 서버는 브라우저의 csrf 쿠키·헤더와 Origin을 그대로 전달하고 자신의 외부 변경 엔드포인트에도 같은 CSRF 검증을 적용한다. 브라우저 Origin이 있으면 auth origin 또는 `ALLOWED_ORIGINS`에 등록되어 있어야 한다. secret을 아는 서버가 임의로 csrf 값을 만들어 브라우저 검증을 대신해서는 안 된다. 이 API를 일반 membership을 요구하는 미들웨어 뒤에 두면 탈퇴 후 정리를 할 수 없으므로, 본인 인증 전용 라우트로 분리한다.

| 메서드·경로 | JSON body | 성공 |
| --- | --- | --- |
| `GET /memberships/identity` | 없음 | 200, 본인과 현재 lifecycle; 생성·복구 없음 |
| `POST /memberships/withdraw` | `{"version":0}` | 201, 탈퇴 및 정리 회차 발급 |
| `POST /memberships/cleanup/ack` | `{"version":1,"cleanupId":"<UUID>"}` | 201, 해당 회차 로컬 정리 완료 확인 |
| `POST /memberships/rejoin` | `{"version":1,"consent":true}` | 201, 명시적 재가입 |

공통 응답 예시:

```json
{
  "userId": "<session user UUID>",
  "clientId": "n2c",
  "state": "withdrawn",
  "version": 1,
  "cleanupId": "<withdrawal UUID>",
  "cleanupPending": true
}
```

identity 응답에는 추가로 `"purpose":"membership-lifecycle"`이 있다. 이것은 **본인 확인만** 증명하며 일반 서비스 접근 허가로 사용할 수 없다. `state`는 `absent | active | suspended | withdrawn`. 가입이 없으면 version 0, cleanupId null, cleanupPending false. 재가입하면 version이 증가하고 cleanupId는 null이다. 서비스 접근은 기존 `GET /verify`의 active membership과 앱 인가 규칙으로 결정한다. `/verify`는 탈퇴·정지에 403을 반환하며, 최초 온보딩의 membership null은 기존대로 200이다.

오류는 Nest 표준 JSON(`statusCode`, `message`, `error`)이다. 400은 version이 음수·정수가 아니거나 누락, consent가 정확히 true가 아님, cleanupId 타입 오류. 401은 세션 없음·만료·사용자 삭제·secret 오류·client 비활성. 403은 CSRF 누락·불일치·허용하지 않은 Origin, 사용자/서비스 불일치, 재가입 시 기존 정지 등 제한. 409는 오래된 version, 현재 회차가 아닌 cleanupId, 정리 미완료, 탈퇴하지 않은 상태의 재가입이다. 기본 요청 한도에 의한 429, 일시적 서버 오류는 상태 재조회 후 재시도한다.

## 상태와 호환성

탈퇴는 membership 행을 삭제하지 않는다. `withdrawn_at`과 정리 회차를 보존하고, 기존 role 및 관리 상태(active/suspended)는 별도로 유지한다. 외부 membership 조회와 포털은 탈퇴를 표시한다. 탈퇴한 admin membership은 admin 자격으로 인정하지 않는다. 최초 membership이 없어도 탈퇴 요청은 tombstone을 생성해 이후 자동 생성을 막는다.

- active → 탈퇴(version + 1, cleanupPending true) → 정리 ack → 명시적 재가입(version + 1).
- suspended → 탈퇴는 가능하고 정리는 가능하지만 재가입은 403. 관리자가 정지를 해제해도 탈퇴는 유지되며, 정리 완료와 별도 재가입 동의가 필요하다. role 변경도 탈퇴를 취소하지 않는다.
- OAuth 콜백, `/verify`, 일반 `POST /memberships`의 ensure는 INSERT/ON CONFLICT DO NOTHING이므로 탈퇴를 해제하지 않는다. 일반 생성 API의 기존 `{ok:true}`는 이미 탈퇴한 경우에도 유지되며 활성 자격을 의미하지 않는다.
- `auto_provision=true`의 최초 로그인/검증 자동 가입은 유지된다. false의 최초 온보딩도 유지된다. **탈퇴 유지를 위해 n2c의 auto_provision을 false로 전환할 필요는 없다.** 신규 사용자에게도 온보딩 동의를 요구하려면 별도 제품 결정과 설정 전환이 필요하다.
- 기존 행의 초기 lifecycle version은 0이며 기존 상태와 설정 값은 변경하지 않는다. 로컬 구현은 SQLite 기준이다. 실제 운영 DB 종류·버전·배포 SHA·n2c의 auto_provision/Origin 설정은 이번 작업에서 확인하거나 변경하지 않았다. 배포 담당자는 운영 DB와 이 브랜치의 마이그레이션 호환성을 먼저 확인해야 한다.

## 소비 서비스 처리 순서와 부분 실패

1. 사용자에게 삭제 범위와 최종 확인을 표시한다. 취소하면 변경 요청을 보내지 않는다. 서버는 identity로 본인을 확인하고 version을 읽는다. 브라우저가 보낸 사용자 ID를 삭제 대상으로 사용하지 않는다.
2. 소비 서비스 DB에서 `(clientId,userId)` 단위로 **모든 인스턴스가 공유하는 잠금/직렬화**를 획득한다. 탈퇴·정리·재가입뿐 아니라 데이터 생성·변경, 피드 발급과 정리 worker도 이 경계를 지켜야 한다. 탈퇴 전 이미 허가된 요청은 배출하고 신규 쓰기를 차단한다. auth의 확인과 소비 DB 변경은 분산 트랜잭션이 아니다.
3. 확인 시 읽은 version으로 withdraw를 호출한다. auth는 `BEGIN IMMEDIATE`로 같은 membership 전이를 직렬화한다. 성공 응답을 얻기 전에는 로컬 삭제를 시작하지 않는다. auth 실패는 완료로 표시하지 않는다.
4. 성공한 `(userId,version,cleanupId)`를 소비 DB에 영속화한다. 서비스 이용·기존 피드 URL을 차단하고, Notion 연결/로컬 설정/캐시 등 소비 서비스 범위의 데이터를 멱등 삭제한다. 공통 사용자나 다른 서비스 데이터, Notion 원본을 삭제하지 않는다.
5. 로컬 삭제가 실패하면 cleanupPending 상태를 남긴다. 재로그인 후에도 일반 `/verify`는 403이므로 identity 전용 경로로 본인을 확인해 **같은 회차만** 정리 재시도한다. 본인 확인으로 로컬 사용자 행이나 구독을 자동 생성해서는 안 된다.
6. 로컬 삭제와 관련 worker가 모두 완료된 뒤 cleanup/ack를 보낸다. ack 응답 유실 시 동일 version/cleanupId로 재시도해도 안전하다. ack만으로 membership이 활성화되지는 않는다. 로컬 삭제를 마치기 전에 ack하지 않는다.
7. 별도 화면의 명시적 재가입 동의가 있을 때, 같은 잠금 안에서 identity를 재조회하고 cleanupPending false를 확인한 뒤 rejoin을 호출한다. 성공한 새 version을 소비 DB에 저장한 다음 새 데이터·새 피드를 만든다. 응답 유실 시 identity로 active와 새 version을 확인한다. stale 재가입 재요청은 409이며 새 동의로 해석하지 않는다.

탈퇴 중복 요청은 현재 withdrawn version 또는 그 직전 version이면 **같은 receipt**를 반환한다. 이미 정리를 ack한 중복 탈퇴도 cleanupPending을 다시 켜지 않는다. 재가입 이후 과거 version의 탈퇴·ack·재가입은 409로 막힌다. 새로운 탈퇴 회차는 새로운 cleanupId를 발급한다. 409를 받았다고 최신 version으로 파괴적 작업을 자동 재발행하지 말고 상태를 다시 읽어 사용자 의도를 확인한다.

소비 서비스의 정리 작업은 잠금 획득 **후** auth identity와 저장한 회차가 같은 withdrawn 상태인지 확인해야 한다. cleanupPending false이면 이미 끝난 회차로 처리하고 삭제를 다시 수행하지 않는다. worker 중복·지연 배달도 같은 규칙을 따른다. 재가입과 정리는 동일 잠금으로 직렬화하고, 만료형 잠금은 fencing token으로 오래된 worker의 쓰기를 거부해야 한다. auth의 버전 검증은 소비 DB에 이미 실행 중인 삭제를 중단할 수 없다. 이 소비 서비스 잠금/회차 검증 없이 auth ack만으로 새 데이터 보호를 보장할 수 없다.

세션이 만료되면 공통 로그인으로 재인증한다. 콜백은 탈퇴를 유지하므로 identity를 통해 정리를 이어갈 수 있다. 공통 사용자가 삭제되면 세션 인증은 401이며 기존 전체 계정 삭제 큐 소비가 로컬 정리를 담당한다.

## 이벤트·전체 계정 삭제 경계

이 버전은 **서비스별 삭제 이벤트를 발행하지 않는다**. 서비스 탈퇴는 `/deletions` 큐에 넣지 않으며 소비 서비스가 동기적으로 조정하고 실패를 영속 재시도한다. 따라서 서비스별 큐 소비/ack는 없고 위 cleanup/ack만 있다. 과거 서비스 삭제 이벤트가 새 가입 데이터를 지우는 경로를 만들지 않는다.

전체 계정 관리 목적지는 auth origin의 `/client` (기존 공개 목적지 `https://auth.bini59.dev/client`)이다. `POST /account/delete`는 공통 사용자, 연결 로그인 수단, 모든 서비스 membership을 제거하고 전체 세션을 해지하며 프로필 이미지를 정리하므로 서비스별 탈퇴에 호출하면 안 된다. 기존 `GET /deletions?client_id=...&since=...`와 `POST /deletions/:userId/ack`는 그대로 유지된다. 각 서비스 secret으로 미확인 전체 계정 삭제를 소비하고 로컬 삭제 후 서비스별 ack한다. 실패한 건을 건너뛰는 since 전진을 피하고, 중복 폴링과 ack를 멱등 처리한다.

전체 계정 삭제의 서비스 로컬 삭제는 각 서비스의 큐 동기화 시 수행되는 비동기 작업이다. 즉시 모든 로컬 데이터 삭제를 보장한다고 안내하지 않는다. 공통 사용자 재생성은 새 UUID이며 이전 UUID의 전체 삭제 이벤트와 구분된다. Notion 원본 삭제는 auth가 수행하지 않는다.
