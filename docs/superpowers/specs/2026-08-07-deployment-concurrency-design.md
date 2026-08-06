# Deployment Concurrency Design

## Goal

web 배포와 n8n package publish가 서로 취소하지 않으면서, 같은 종류의 배포만 직렬화한다.

## Design

- 기존 `.github/workflows/ci.yml`과 job 구성을 유지한다.
- `publish-image`와 `request-dca-deploy`는 같은 `web-deploy-main` group을 사용하고 `cancel-in-progress: true`로 설정한다. 새 web 배포가 준비되면 진행 중이거나 대기 중인 이전 web 배포를 대체한다.
- `publish-n8n-node`는 별도 `n8n-publish-main` group을 사용하고 `cancel-in-progress: false`로 설정한다. 실행 중인 npm publish는 끝까지 완료하고 다음 publish는 대기한다.
- concurrency는 배포 job에만 적용한다. PR의 `verify-image`와 `verify-n8n-node`는 기존 동작을 유지한다.
- `push` 검증은 `main`에서만 실행하고 PR 검증은 기본 `opened`, `synchronize`, `reopened` 이벤트를 사용한다. PR 브랜치 push에서 `push`와 `pull_request` 검증이 중복 실행되지 않게 한다.

## Verification

- 세 배포 job에 기대한 group과 취소 정책이 선언됐는지 정적 검사한다.
- workflow trigger가 `main` push와 기본 PR 이벤트만 사용하는지 정적 검사한다.
- workflow diff를 확인해 job 조건, permissions, steps가 바뀌지 않았는지 검토한다.
- 설정 변경만 수행하므로 애플리케이션 build는 실행하지 않는다.
