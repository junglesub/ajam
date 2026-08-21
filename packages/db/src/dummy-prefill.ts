import { randomUUID } from "node:crypto";

import {
  getBusinessCalendarWeeks,
  type TimesheetEntryNotionCardDraft
} from "@timesheet/domain";

import { prisma } from "./client";
import {
  ensureNotionSchema,
  upsertNotionCardCache,
  upsertUserNotionConnection,
  type NotionCardCacheRecord
} from "./notion-store";
import { hashPassword } from "./password";
import { ensureApplicationSchema } from "./settings-store";
import {
  addProject,
  ensureTimesheetSchema,
  saveTimesheetDays,
  upsertVacationAllowance,
  type StoredTimesheetDay
} from "./timesheet-store";

export type DummyPrefillOptions = {
  cleanExisting?: boolean;
  month?: number; // 0-11 (0 = January)
  userId?: string;
  withNotion?: boolean;
  year?: number;
};

export type DummyPrefillResult = {
  daysCreated: number;
  month: number;
  notionCardsCreated: number;
  projectsCreated: string[];
  userId: string;
  withNotion: boolean;
  year: number;
};

const SAMPLE_PROJECTS = [
  "aJam Web",
  "BizFlow Platform",
  "Design System",
  "Customer Portal"
];

const DUMMY_NOTION_CARDS: Array<{
  category: string;
  notionPageId: string;
  status: string;
  title: string;
}> = [
  {
    category: "Feature",
    notionPageId: "notion-card-001",
    status: "진행 중",
    title: "리스트 뷰 Notion 카드 연동 및 칩 렌더링"
  },
  {
    category: "Design",
    notionPageId: "notion-card-002",
    status: "완료",
    title: "다크 모드 환경설정 UI 개편"
  },
  {
    category: "Backend",
    notionPageId: "notion-card-003",
    status: "대기",
    title: "월간 AI 번역 및 요약 큐 처리 개선"
  },
  {
    category: "Extension",
    notionPageId: "notion-card-004",
    status: "진행 중",
    title: "Chrome 확장 프로그램 시간 매크로 연동"
  },
  {
    category: "Feature",
    notionPageId: "notion-card-005",
    status: "완료",
    title: "공휴일 및 연차 캘린더 색상 커스텀 지원"
  }
];

const WORK_SCENARIOS = [
  {
    aiTranslation: "Implemented list view layout and permanently displayed Notion cards in desktop mode.",
    content: "리스트 뷰 레이아웃 개선 및 데스크톱 모드 Notion 카드 상시 표시 구현",
    hours: 8,
    projectIndex: 0,
    shortVersion: "리스트 뷰 Notion 카드 상시 노출",
    cardIndices: [0]
  },
  {
    aiTranslation: "Optimized database queries for timesheet export and improved API response caching.",
    content: "타임시트 내보내기 데이터베이스 쿼리 최적화 및 API 응답 캐싱 로직 리팩토링",
    hours: 8,
    projectIndex: 1,
    shortVersion: "타임시트 쿼리 최적화 및 캐싱",
    cardIndices: [2]
  },
  {
    aiTranslation: "Fixed responsive layout bugs in vacation calendar and updated design tokens.",
    content: "휴가 캘린더 반응형 레이아웃 버그 수정 및 디자인 시스템 토큰 적용",
    hours: 8,
    projectIndex: 2,
    shortVersion: "휴가 캘린더 반응형 개선",
    cardIndices: [1, 4]
  },
  {
    aiTranslation: "Developed customer portal dashboard widgets and integrated analytics endpoints.",
    content: "고객 포털 대시보드 위젯 컴포넌트 개발 및 분석 API 엔드포인트 연동",
    hours: 8,
    projectIndex: 3,
    shortVersion: "고객 포털 위젯 개발",
    cardIndices: [3]
  }
];

export async function prefillDummyTimesheetData(
  options: DummyPrefillOptions = {}
): Promise<DummyPrefillResult> {
  await ensureApplicationSchema();
  await ensureTimesheetSchema();

  const now = new Date();
  const targetYear = options.year ?? now.getFullYear();
  const targetMonth = options.month ?? now.getMonth();
  const withNotion = Boolean(options.withNotion);
  const cleanExisting = options.cleanExisting !== false;

  // Resolve or create user
  let targetUserId = options.userId;
  if (!targetUserId) {
    const adminUser = await prisma.user.findFirst({
      where: { role: "ADMIN" }
    });
    if (adminUser) {
      targetUserId = adminUser.id;
    } else {
      const firstUser = await prisma.user.findFirst();
      if (firstUser) {
        targetUserId = firstUser.id;
      } else {
        const created = await prisma.user.create({
          data: {
            passwordHash: hashPassword("1234"),
            role: "ADMIN",
            username: "admin"
          }
        });
        targetUserId = created.id;
      }
    }
  }

  // Ensure projects
  for (const name of SAMPLE_PROJECTS) {
    await addProject({ name, userId: targetUserId });
  }

  // Ensure vacation allowance
  await upsertVacationAllowance({
    days: 15,
    userId: targetUserId,
    year: targetYear
  });

  // Handle Notion setup if requested
  if (withNotion) {
    await ensureNotionSchema();

    // 1. Mock connection if absent
    await upsertUserNotionConnection({
      accessToken: "secret_dummy_token_for_test_environment",
      connection: {
        ajamLastUpdateProperty: { id: "p_updated", name: "aJam Last Update", type: "last_edited_time" },
        analysisConfigVersion: 1,
        authType: "internal_token",
        availableHoursProperty: { id: "p_avail", name: "Available Hours", type: "number" },
        categoryProperty: { id: "p_cat", name: "Category", type: "select" },
        databaseId: "dummy-notion-db-id",
        dataSourceId: "dummy-notion-ds-id",
        dataSourceName: "aJam Tasks",
        dateMappingMode: "separate_properties",
        doneStatusValues: ["완료", "Done"],
        endDateProperty: { id: "p_end", name: "End Date", type: "date" },
        lastWorkedDateProperty: { id: "p_worked", name: "Last Worked", type: "date" },
        notionApiVersion: "2022-06-28",
        sourceInput: "https://notion.so/dummy-timesheet-db",
        startDateProperty: { id: "p_start", name: "Start Date", type: "date" },
        statusProperty: { id: "p_status", name: "Status", type: "status" },
        titleProperty: { id: "p_title", name: "Name", type: "title" },
        workDayCountProperty: { id: "p_days", name: "Work Days", type: "number" },
        workHoursProperty: { id: "p_hours", name: "Work Hours", type: "number" }
      },
      userId: targetUserId
    });

    // 2. Cache mock Notion cards
    const monthPrefix = `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}`;
    const cacheRecords: NotionCardCacheRecord[] = DUMMY_NOTION_CARDS.map((card) => ({
      archived: false,
      category: card.category,
      endDate: `${monthPrefix}-28`,
      lastEditedTime: new Date().toISOString(),
      notionPageId: card.notionPageId,
      rawPropertiesJson: JSON.stringify(card),
      stale: false,
      startDate: `${monthPrefix}-01`,
      status: card.status,
      title: card.title,
      url: `https://notion.so/${card.notionPageId}`
    }));

    await upsertNotionCardCache({
      analysisConfigVersion: 1,
      cards: cacheRecords,
      userId: targetUserId
    });
  }

  // Get business calendar dates for the target month
  const calendarWeeks = getBusinessCalendarWeeks(targetYear, targetMonth);
  const businessDateKeys: string[] = [];
  for (const week of calendarWeeks) {
    for (const cell of week) {
      if (cell) {
        businessDateKeys.push(cell.dateKey);
      }
    }
  }

  // Clean existing entries in target month if requested
  if (cleanExisting && businessDateKeys.length > 0) {
    const minDate = businessDateKeys[0];
    const maxDate = businessDateKeys[businessDateKeys.length - 1];

    if (minDate && maxDate) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "TimesheetEntry" WHERE "userId" = ? AND "dateKey" BETWEEN ? AND ?`,
        targetUserId,
        minDate,
        maxDate
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM "TimesheetDay" WHERE "userId" = ? AND "dateKey" BETWEEN ? AND ?`,
        targetUserId,
        minDate,
        maxDate
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM "Vacation" WHERE "userId" = ? AND "dateKey" BETWEEN ? AND ?`,
        targetUserId,
        minDate,
        maxDate
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM "WorkEntryNotionCard" WHERE "userId" = ? AND "dateKey" BETWEEN ? AND ?`,
        targetUserId,
        minDate,
        maxDate
      );
    }
  }

  // Build realistic StoredTimesheetDay records
  const daysToSave: StoredTimesheetDay[] = [];

  for (let index = 0; index < businessDateKeys.length; index += 1) {
    const dateKey = businessDateKeys[index];
    if (!dateKey) continue;

    // Leave the last 2 business days empty as MISSING for realistic testing
    if (index >= businessDateKeys.length - 2) {
      continue;
    }

    // Vacation scenario on 5th business day (e.g. Full day 연차)
    if (index === 4) {
      daysToSave.push({
        aiRewriteRequested: false,
        dateKey,
        entries: [
          {
            aiTranslation: "",
            clientId: randomUUID(),
            content: "",
            holidayName: "",
            hours: 8,
            id: "",
            kind: "VACATION",
            notionCards: [],
            project: "",
            sortOrder: 0,
            vacationName: "연차",
            vacationStatus: "CONFIRMED"
          }
        ],
        holidayName: "",
        shortVersion: ""
      });
      continue;
    }

    // Mixed scenario on 10th business day (4h work + 4h 반차)
    if (index === 9) {
      const scenario = WORK_SCENARIOS[0]!;
      const notionCards: TimesheetEntryNotionCardDraft[] = withNotion
        ? [
            {
              allocatedHours: 4,
              allocationMode: "auto",
              category: DUMMY_NOTION_CARDS[0]!.category,
              endDate: `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-28`,
              notionPageId: DUMMY_NOTION_CARDS[0]!.notionPageId,
              source: "manual",
              startDate: `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-01`,
              status: DUMMY_NOTION_CARDS[0]!.status,
              title: DUMMY_NOTION_CARDS[0]!.title
            }
          ]
        : [];

      daysToSave.push({
        aiRewriteRequested: false,
        dateKey,
        entries: [
          {
            aiTranslation: scenario.aiTranslation,
            clientId: randomUUID(),
            content: scenario.content,
            holidayName: "",
            hours: 4,
            id: "",
            kind: "WORK",
            notionCards,
            project: SAMPLE_PROJECTS[scenario.projectIndex]!,
            sortOrder: 0,
            vacationName: "",
            vacationStatus: "CONFIRMED"
          },
          {
            aiTranslation: "",
            clientId: randomUUID(),
            content: "",
            holidayName: "",
            hours: 4,
            id: "",
            kind: "VACATION",
            notionCards: [],
            project: "",
            sortOrder: 1,
            vacationName: "반차",
            vacationStatus: "CONFIRMED"
          }
        ],
        holidayName: "",
        shortVersion: scenario.shortVersion
      });
      continue;
    }

    // Split multi-work scenario on 7th business day (4h Project A + 4h Project B)
    if (index === 6) {
      const scenarioA = WORK_SCENARIOS[0]!;
      const scenarioB = WORK_SCENARIOS[1]!;

      const notionCardsA: TimesheetEntryNotionCardDraft[] = withNotion
        ? [
            {
              allocatedHours: 4,
              allocationMode: "auto",
              category: DUMMY_NOTION_CARDS[0]!.category,
              endDate: `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-28`,
              notionPageId: DUMMY_NOTION_CARDS[0]!.notionPageId,
              source: "manual",
              startDate: `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-01`,
              status: DUMMY_NOTION_CARDS[0]!.status,
              title: DUMMY_NOTION_CARDS[0]!.title
            }
          ]
        : [];

      const notionCardsB: TimesheetEntryNotionCardDraft[] = withNotion
        ? [
            {
              allocatedHours: 4,
              allocationMode: "auto",
              category: DUMMY_NOTION_CARDS[1]!.category,
              endDate: `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-28`,
              notionPageId: DUMMY_NOTION_CARDS[1]!.notionPageId,
              source: "manual",
              startDate: `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-01`,
              status: DUMMY_NOTION_CARDS[1]!.status,
              title: DUMMY_NOTION_CARDS[1]!.title
            }
          ]
        : [];

      daysToSave.push({
        aiRewriteRequested: false,
        dateKey,
        entries: [
          {
            aiTranslation: scenarioA.aiTranslation,
            clientId: randomUUID(),
            content: scenarioA.content,
            holidayName: "",
            hours: 4,
            id: "",
            kind: "WORK",
            notionCards: notionCardsA,
            project: SAMPLE_PROJECTS[scenarioA.projectIndex]!,
            sortOrder: 0,
            vacationName: "",
            vacationStatus: "CONFIRMED"
          },
          {
            aiTranslation: scenarioB.aiTranslation,
            clientId: randomUUID(),
            content: scenarioB.content,
            holidayName: "",
            hours: 4,
            id: "",
            kind: "WORK",
            notionCards: notionCardsB,
            project: SAMPLE_PROJECTS[scenarioB.projectIndex]!,
            sortOrder: 1,
            vacationName: "",
            vacationStatus: "CONFIRMED"
          }
        ],
        holidayName: "",
        shortVersion: `${scenarioA.shortVersion} / ${scenarioB.shortVersion}`
      });
      continue;
    }

    // Normal work day scenario (8h)
    const scenario = WORK_SCENARIOS[index % WORK_SCENARIOS.length]!;
    const notionCards: TimesheetEntryNotionCardDraft[] = [];

    if (withNotion) {
      const cardIndices = scenario.cardIndices;
      const hoursPerCard = 8 / cardIndices.length;

      for (const cardIndex of cardIndices) {
        const card = DUMMY_NOTION_CARDS[cardIndex % DUMMY_NOTION_CARDS.length]!;
        notionCards.push({
          allocatedHours: hoursPerCard,
          allocationMode: "auto",
          category: card.category,
          endDate: `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-28`,
          notionPageId: card.notionPageId,
          source: "manual",
          startDate: `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-01`,
          status: card.status,
          title: card.title
        });
      }
    }

    daysToSave.push({
      aiRewriteRequested: false,
      dateKey,
      entries: [
        {
          aiTranslation: scenario.aiTranslation,
          clientId: randomUUID(),
          content: scenario.content,
          holidayName: "",
          hours: 8,
          id: "",
          kind: "WORK",
          notionCards,
          project: SAMPLE_PROJECTS[scenario.projectIndex]!,
          sortOrder: 0,
          vacationName: "",
          vacationStatus: "CONFIRMED"
        }
      ],
      holidayName: "",
      shortVersion: scenario.shortVersion
    });
  }

  // Persist all days in batch
  await saveTimesheetDays({
    days: daysToSave,
    userId: targetUserId
  });

  return {
    daysCreated: daysToSave.length,
    month: targetMonth + 1,
    notionCardsCreated: withNotion ? DUMMY_NOTION_CARDS.length : 0,
    projectsCreated: SAMPLE_PROJECTS,
    userId: targetUserId,
    withNotion,
    year: targetYear
  };
}
