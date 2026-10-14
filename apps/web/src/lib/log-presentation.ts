import type { VisibleOperationLog } from "@timesheet/db/operational-logs";

export function formatUnreadBadge(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  if (count >= 100) return "99+";
  return String(Math.floor(count));
}

const COMPONENT_LABELS: Record<string, string> = {
  ai: "AI",
  auth: "인증",
  db: "DB",
  holiday: "공휴일",
  http: "HTTP",
  notion: "Notion",
  server: "서버",
  timesheet: "업무 기록"
};

const OPERATION_LABELS: Record<string, string> = {
  api: "조회",
  apply_cleanup: "정리 적용",
  batch: "일괄 작업",
  candidates: "후보 조회",
  cleanup: "정리",
  client_init: "초기화",
  connection_saved: "연결 저장",
  connection_test: "연결 테스트",
  delete: "삭제",
  delete_action: "삭제",
  fallback: "대체 조회",
  gemini_api: "API 요청",
  json_import: "가져오기",
  list: "조회",
  login: "로그인",
  maintenance: "점검",
  month: "월별 조회",
  save: "저장",
  save_action: "저장",
  save_many: "일괄 저장",
  scheduled_cleanup: "예약 정리",
  scheduled_user: "사용자별 정리",
  session: "세션",
  startup: "시작",
  test_api: "키 테스트",
  unhandled_error: "처리되지 않은 오류",
  webhook_event: "웹훅",
  webhook_request: "웹훅 수신"
};

const RESULT_LABELS: Record<string, string> = {
  cache_fallback: "캐시로 표시",
  cache_hit: "캐시로 표시",
  completed: "완료",
  created: "생성됨",
  defaulted: "기본값 적용",
  destroyed: "종료됨",
  duplicate: "중복으로 건너뜀",
  empty_fallback: "빈 목록으로 표시",
  failed: "실패",
  ignored: "건너뜀",
  initialized: "시작됨",
  processed: "처리됨",
  received: "수신됨",
  rejected: "거절됨",
  responded: "응답됨",
  skipped: "건너뜀",
  started: "시작됨",
  verified: "확인됨"
};

const LEVEL_LABELS: Record<string, string> = {
  error: "오류",
  info: "정보",
  warn: "경고"
};

export function formatLogSummary(log: VisibleOperationLog): string {
  const component = COMPONENT_LABELS[log.component] ?? "기타";
  const operation = OPERATION_LABELS[log.operation] ?? "처리";
  const result = RESULT_LABELS[log.result] ?? "처리됨";
  const level = LEVEL_LABELS[log.level] ?? log.level;
  const status = typeof log.metadata.status === "number" ? ` (상태 ${log.metadata.status})` : "";
  return `${component} ${operation} ${result} · ${level}${status}`;
}
