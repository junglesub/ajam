"use client";

import { useMemo, useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { Database, Save, TestTube2 } from "lucide-react";

import type { NotionPropertyDescriptor } from "@timesheet/db";
import { Badge, Button, Input } from "@timesheet/ui";

import { toPropertyDescriptor, type NotionConnectionPanelProps, type NotionSchemaProperty } from "./types";

type PropertyKey =
  | "ajamLastUpdateProperty"
  | "titleProperty"
  | "statusProperty"
  | "categoryProperty"
  | "startDateProperty"
  | "endDateProperty"
  | "workHoursProperty"
  | "workDayCountProperty"
  | "availableHoursProperty"
  | "lastWorkedDateProperty";

const propertyLabels: Array<{ key: PropertyKey; label: string; optional?: boolean; types: string[] }> = [
  { key: "titleProperty", label: "제목", types: ["title", "rich_text"] },
  { key: "statusProperty", label: "상태", types: ["status", "select"] },
  { key: "categoryProperty", label: "분류", optional: true, types: ["multi_select", "select", "status", "rich_text"] },
  { key: "startDateProperty", label: "시작 날짜", types: ["date"] },
  { key: "endDateProperty", label: "완료 날짜", optional: true, types: ["date"] },
  { key: "workHoursProperty", label: "업무 기간 시간", optional: true, types: ["number"] },
  { key: "workDayCountProperty", label: "작업일수 필드", optional: true, types: ["number"] },
  { key: "availableHoursProperty", label: "가용 시간 필드", optional: true, types: ["number"] },
  { key: "lastWorkedDateProperty", label: "마지막 작업일 필드", optional: true, types: ["date"] },
  { key: "ajamLastUpdateProperty", label: "aJam 업데이트 시간 필드", optional: true, types: ["date"] }
];

function getInitialPropertyId(property: NotionPropertyDescriptor | null | undefined): string {
  return property?.id || property?.name || "";
}

function buildInitialSchemaProperties(connection: NotionConnectionPanelProps["connection"]): Record<string, NotionSchemaProperty> {
  const descriptors = [
    connection?.titleProperty,
    connection?.statusProperty,
    connection?.categoryProperty,
    connection?.startDateProperty,
    connection?.endDateProperty,
    connection?.workHoursProperty,
    connection?.workDayCountProperty,
    connection?.availableHoursProperty,
    connection?.lastWorkedDateProperty,
    connection?.ajamLastUpdateProperty
  ].filter((property): property is NotionPropertyDescriptor => Boolean(property?.name));

  return Object.fromEntries(
    descriptors.map((property) => [
      property.id || property.name,
      {
        id: property.id || property.name,
        name: property.name,
        type: property.type
      }
    ])
  );
}

export function NotionConnectionPanel({
  connection,
  onConnectionSaved,
  onMessage,
  saveConnectionAction,
  testDataSourceAction
}: NotionConnectionPanelProps) {
  const [token, setToken] = useState("");
  const [sourceInput, setSourceInput] = useState(connection?.sourceInput ?? connection?.dataSourceId ?? "");
  const [dataSourceName, setDataSourceName] = useState(connection?.dataSourceName ?? "");
  const [doneStatusValues, setDoneStatusValues] = useState(connection?.doneStatusValues.join(", ") ?? "완료, Done");
  const [dateMappingMode, setDateMappingMode] = useState(connection?.dateMappingMode ?? "separate_properties");
  const [propertyIds, setPropertyIds] = useState<Record<PropertyKey, string>>({
    ajamLastUpdateProperty: getInitialPropertyId(connection?.ajamLastUpdateProperty),
    availableHoursProperty: getInitialPropertyId(connection?.availableHoursProperty),
    categoryProperty: getInitialPropertyId(connection?.categoryProperty),
    endDateProperty: getInitialPropertyId(connection?.endDateProperty),
    lastWorkedDateProperty: getInitialPropertyId(connection?.lastWorkedDateProperty),
    startDateProperty: getInitialPropertyId(connection?.startDateProperty),
    statusProperty: getInitialPropertyId(connection?.statusProperty),
    titleProperty: getInitialPropertyId(connection?.titleProperty),
    workDayCountProperty: getInitialPropertyId(connection?.workDayCountProperty),
    workHoursProperty: getInitialPropertyId(connection?.workHoursProperty)
  });
  const [schemaProperties, setSchemaProperties] = useState<Record<string, NotionSchemaProperty>>(() => buildInitialSchemaProperties(connection));
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const propertyOptions = useMemo(
    () =>
      Object.values(schemaProperties).sort((left, right) =>
        (left.name ?? "").localeCompare(right.name ?? "", "ko-KR")
      ),
    [schemaProperties]
  );
  const hasSchema = propertyOptions.length > 0;

  function updateProperty(key: PropertyKey, event: ChangeEvent<HTMLSelectElement>) {
    setPropertyIds((current) => ({ ...current, [key]: event.target.value }));
  }

  function descriptorFor(key: PropertyKey): NotionPropertyDescriptor | null {
    const id = propertyIds[key];
    const property = propertyOptions.find((option) => option.id === id);

    return toPropertyDescriptor(property, id);
  }

  function testDataSource() {
    const dataSourceId = sourceInput.trim();

    if (!dataSourceId || (!token.trim() && !connection?.hasToken)) {
      setError("토큰과 데이터 소스 ID를 입력해 주세요. 기존 토큰이 있으면 토큰은 비워도 됩니다.");
      return;
    }

    setError("");
    startTransition(async () => {
      try {
        const schema = await testDataSourceAction({ dataSourceId, token: token.trim() || undefined });
        setSchemaProperties(schema.properties);
        setDataSourceName(schema.name || schema.id);
        onMessage("Notion 데이터 소스 스키마를 불러왔습니다.");
      } catch (testError) {
        setError(testError instanceof Error ? testError.message : "Notion 연결을 확인하지 못했습니다.");
      }
    });
  }

  function saveConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const dataSourceId = sourceInput.trim();

    if (!dataSourceId) {
      setError("데이터 소스 ID를 입력해 주세요.");
      return;
    }

    setError("");
    startTransition(async () => {
      try {
        const saved = await saveConnectionAction({
          accessToken: token.trim() || undefined,
          connection: {
            ajamLastUpdateProperty: descriptorFor("ajamLastUpdateProperty"),
            analysisConfigVersion: (connection?.analysisConfigVersion ?? 1) + 1,
            authType: "internal_token",
            availableHoursProperty: descriptorFor("availableHoursProperty"),
            categoryProperty: descriptorFor("categoryProperty"),
            databaseId: connection?.databaseId ?? "",
            dataSourceId,
            dataSourceName: dataSourceName || dataSourceId,
            dateMappingMode,
            doneStatusValues: doneStatusValues
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
            endDateProperty: descriptorFor("endDateProperty"),
            notionApiVersion: connection?.notionApiVersion ?? "2026-03-11",
            sourceInput: dataSourceId,
            startDateProperty: descriptorFor("startDateProperty"),
            statusProperty: descriptorFor("statusProperty"),
            titleProperty: descriptorFor("titleProperty"),
            lastWorkedDateProperty: descriptorFor("lastWorkedDateProperty"),
            workDayCountProperty: descriptorFor("workDayCountProperty"),
            workHoursProperty: descriptorFor("workHoursProperty")
          }
        });
        setToken("");
        onConnectionSaved(saved);
        onMessage("Notion 연결 설정을 저장했습니다.");
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "Notion 연결 설정을 저장하지 못했습니다.");
      }
    });
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-slate-950 text-white">
            <Database aria-hidden="true" className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-950">Notion 연결</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">사용자별 데이터 소스와 필드 매핑</p>
          </div>
        </div>
        {connection?.hasToken ? <Badge tone="green">토큰 저장됨</Badge> : <Badge tone="gray">토큰 없음</Badge>}
      </div>

      {error ? <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

      <form className="grid gap-4 p-5" onSubmit={saveConnection}>
        <label className="grid gap-2 text-sm font-bold text-slate-700">
          내부 integration token
          <Input
            autoComplete="off"
            onChange={(event) => setToken(event.target.value)}
            placeholder={connection?.hasToken ? "비워두면 기존 토큰 유지" : "secret_..."}
            type="password"
            value={token}
          />
        </label>

        <label className="grid gap-2 text-sm font-bold text-slate-700">
          데이터 소스 ID
          <Input onChange={(event) => setSourceInput(event.target.value)} placeholder="Notion data source ID" value={sourceInput} />
        </label>

        <div className="flex flex-wrap gap-2">
          <Button disabled={isPending} onClick={testDataSource} type="button" variant="secondary">
            <TestTube2 aria-hidden="true" className="size-4" />
            연결 확인
          </Button>
        </div>

        <label className="grid gap-2 text-sm font-bold text-slate-700">
          날짜 매핑 방식
          <select
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
            onChange={(event) => setDateMappingMode(event.target.value === "single_range_property" ? "single_range_property" : "separate_properties")}
            value={dateMappingMode}
          >
            <option value="separate_properties">시작/완료 날짜 별도 필드</option>
            <option value="single_range_property">하나의 날짜 범위 필드</option>
          </select>
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          {propertyLabels.map((item) => (
            <label className="grid gap-2 text-sm font-bold text-slate-700" key={item.key}>
              {item.label}
              <select
                className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
                disabled={!hasSchema}
                onChange={(event) => updateProperty(item.key, event)}
                value={propertyIds[item.key]}
              >
                <option value="">{item.optional ? "선택 안 함" : "필드 선택"}</option>
                {propertyOptions
                  .filter((property) => item.types.includes(property.type) || property.id === propertyIds[item.key])
                  .map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.name} ({property.type})
                    </option>
                  ))}
              </select>
            </label>
          ))}
        </div>

        <label className="grid gap-2 text-sm font-bold text-slate-700">
          완료 상태 값
          <Input onChange={(event) => setDoneStatusValues(event.target.value)} value={doneStatusValues} />
        </label>

        <div className="flex justify-end">
          <Button disabled={isPending} type="submit">
            <Save aria-hidden="true" className="size-4" />
            저장
          </Button>
        </div>
      </form>
    </section>
  );
}
