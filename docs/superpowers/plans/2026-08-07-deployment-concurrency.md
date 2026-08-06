# Deployment Concurrency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** web 배포와 n8n publish에 독립적인 concurrency 정책을 적용한다.

**Architecture:** 단일 CI workflow와 기존 job 경계를 유지한다. web 배포 job들은 취소 가능한 공통 group을 사용하고 n8n publish job은 취소하지 않는 별도 group을 사용한다.

**Tech Stack:** GitHub Actions YAML

## Global Constraints

- 새 workflow나 dependency를 추가하지 않는다.
- PR 검증 job에는 concurrency를 적용하지 않는다.
- 애플리케이션 build는 실행하지 않는다.

---

### Task 1: 배포 concurrency 분리

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/decisions.md`

**Interfaces:**
- Consumes: 기존 `publish-image`, `request-dca-deploy`, `publish-n8n-node` job
- Produces: `web-deploy-main`, `n8n-publish-main` concurrency group

- [x] **Step 1: web 배포 job에 같은 concurrency group 추가**

`publish-image`와 `request-dca-deploy`에 다음 설정을 추가한다.

```yaml
concurrency:
  group: web-deploy-main
  cancel-in-progress: true
```

- [x] **Step 2: n8n publish job에 별도 concurrency group 추가**

```yaml
concurrency:
  group: n8n-publish-main
  cancel-in-progress: false
```

- [x] **Step 3: 기존 결정 문서 갱신**

`docs/decisions.md`의 `2026-08-07` 항목에 web은 이전 배포를 취소하고 n8n은 실행 중인 publish를 완료한다는 결정을 기록한다.

- [x] **Step 4: 정적 검증**

PowerShell로 각 job 블록의 group과 `cancel-in-progress` 값을 검사하고 `git diff --check` 및 `git diff`를 확인한다. 모든 검사는 exit code 0이어야 한다.

### Task 2: PR 검증 중복 제거

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/decisions.md`

**Interfaces:**
- Consumes: 기존 `push`와 `pull_request` trigger
- Produces: `main` push 및 기본 PR 이벤트별 단일 workflow 실행

- [x] **Step 1: push trigger를 main으로 제한**

```yaml
on:
  push:
    branches: [main]
  pull_request:
```

- [x] **Step 2: 기존 결정 문서 갱신**

`docs/decisions.md`의 `2026-08-07` 항목에 PR 브랜치 push의 중복 검증을 제거한다는 결정을 기록한다.

- [x] **Step 3: 정적 검증**

PowerShell로 `push.branches`가 `main`이고 `pull_request`에 이벤트 확장이 없는지 검사한 뒤 `git diff --check`와 전체 diff를 확인한다.
