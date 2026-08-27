---
name: release
description: 321_auth (통합 인증 auth 서버) 릴리즈 — production / hotfix 절차. Use when the user wants to ship, deploy, cut a release, bump a version, or "릴리즈 하자".
---

# Release: 321_auth

> 상태: repo 초기화 단계 — git remote와 CI/CD 미설정. 아래는 기본 모델(main=프로덕션, staging 없음)을 기록한 것이며, 실제 CI·배포 수단이 정해지면 이 문서를 갱신한다.

## Production (main)

- 배포 트리거: **main 푸시/머지 → 자동 배포** 원칙(미구축, 확인 필요 — Cloudflare Pages/Workers 등 배포 수단 확정 후 기록).
- 버전: semver. 릴리즈 커밋에서 bump 후 태그.
- 배포 검증: `AUTH_ORIGIN` 헬스체크 + `/login` 200 확인, 프로바이더(Google/Kakao) 실제 로그인 스모크 1회.

## Hotfix

- `main`에서 `hotfix/*` 브랜치 → 수정 → PR → `main`(같은 자동 배포 경로). 태그/역머지 규칙은 CI 구축 후 확정.
