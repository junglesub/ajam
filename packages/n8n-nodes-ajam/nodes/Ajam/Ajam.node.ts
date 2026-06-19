import { NodeConnectionTypes, type IDataObject, type IExecuteFunctions, type INodeExecutionData, type INodeType, type INodeTypeDescription } from "n8n-workflow";

type AjamCredentials = {
  apiToken: string;
  baseUrl: string;
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

function getStringParameter(executeFunctions: IExecuteFunctions, name: string, itemIndex: number): string {
  return executeFunctions.getNodeParameter(name, itemIndex, "") as string;
}

function buildNotionMaintenanceAlert(response: IDataObject): IDataObject | null {
  const errors = Array.isArray(response.errors) ? response.errors : [];

  if (errors.length === 0) {
    return null;
  }

  const dateKey = String(response.dateKey ?? "");
  const lines = errors.map((error) => {
    const item = error as IDataObject;
    const username = String(item.username ?? item.userId ?? "unknown");
    const message = String(item.message ?? "Unknown error");

    return `- ${username}: ${message}`;
  });

  return {
    dateKey,
    errorCount: errors.length,
    errors,
    message: [
      `${dateKey || "aJam"} Notion daily maintenance failed for ${errors.length} user${errors.length === 1 ? "" : "s"}.`,
      "",
      ...lines
    ].join("\n"),
    subject: `[aJam] Notion daily maintenance failed${dateKey ? ` (${dateKey})` : ""}`
  };
}

function buildNotionRequestFailureAlert(params: {
  dateKey: string;
  error: unknown;
}): IDataObject {
  const message = params.error instanceof Error ? params.error.message : "Unknown request error";

  return {
    dateKey: params.dateKey,
    errorCount: 1,
    errors: [{ message, username: "request" }],
    message: [
      `${params.dateKey || "aJam"} Notion daily maintenance request failed.`,
      "",
      `- request: ${message}`
    ].join("\n"),
    subject: `[aJam] Notion daily maintenance request failed${params.dateKey ? ` (${params.dateKey})` : ""}`
  };
}

function buildAiScheduledCleanupAlert(response: IDataObject): IDataObject | null {
  const errors = Array.isArray(response.errors) ? response.errors : [];

  if (errors.length === 0) {
    return null;
  }

  const dateKey = String(response.dateKey ?? "");
  const lines = errors.map((error) => {
    const item = error as IDataObject;
    const username = String(item.username ?? item.userId ?? "unknown");
    const message = String(item.message ?? "Unknown error");

    return `- ${username}: ${message}`;
  });

  return {
    dateKey,
    errorCount: errors.length,
    errors,
    message: [
      `${dateKey || "aJam"} AI scheduled cleanup failed for ${errors.length} user${errors.length === 1 ? "" : "s"}.`,
      "",
      ...lines
    ].join("\n"),
    subject: `[aJam] AI scheduled cleanup failed${dateKey ? ` (${dateKey})` : ""}`
  };
}

function buildAiRequestFailureAlert(params: {
  dateKey: string;
  error: unknown;
}): IDataObject {
  const message = params.error instanceof Error ? params.error.message : "Unknown request error";

  return {
    dateKey: params.dateKey,
    errorCount: 1,
    errors: [{ message, username: "request" }],
    message: [
      `${params.dateKey || "aJam"} AI scheduled cleanup request failed.`,
      "",
      `- request: ${message}`
    ].join("\n"),
    subject: `[aJam] AI scheduled cleanup request failed${params.dateKey ? ` (${params.dateKey})` : ""}`
  };
}

export class Ajam implements INodeType {
  description: INodeTypeDescription = {
    displayName: "aJam",
    name: "ajam",
    icon: "file:ajam.svg",
    group: ["transform"],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: "Use aJam internal automation APIs",
    defaults: {
      name: "aJam"
    },
    inputs: [NodeConnectionTypes.Main],
    outputNames: ["Summary", "Alerts"],
    outputs: [NodeConnectionTypes.Main, NodeConnectionTypes.Main],
    credentials: [
      {
        name: "ajamApi",
        required: true
      }
    ],
    properties: [
      {
        default: "dailyReminder",
        displayName: "Resource",
        name: "resource",
        noDataExpression: true,
        options: [
          {
            name: "AI Cleanup",
            value: "aiCleanup"
          },
          {
            name: "Daily Reminder",
            value: "dailyReminder"
          },
          {
            name: "Notion",
            value: "notion"
          }
        ],
        required: true,
        type: "options"
      },
      {
        default: "listMissingTimesheetUsers",
        displayName: "Operation",
        displayOptions: {
          show: {
            resource: ["dailyReminder"]
          }
        },
        name: "operation",
        noDataExpression: true,
        options: [
          {
            action: "List missing timesheet users",
            description: "Return users who have not written today's timesheet",
            name: "List Missing Timesheet Users",
            value: "listMissingTimesheetUsers"
          },
          {
            action: "Mark reminder sent",
            description: "Record that a reminder email was sent",
            name: "Mark Reminder Sent",
            value: "markReminderSent"
          }
        ],
        required: true,
        type: "options"
      },
      {
        default: "runScheduledCleanup",
        displayName: "Operation",
        displayOptions: {
          show: {
            resource: ["aiCleanup"]
          }
        },
        name: "operation",
        noDataExpression: true,
        options: [
          {
            action: "Run scheduled AI cleanup",
            description: "Fill missing English translations and short versions for users using scheduled AI cleanup",
            name: "Run Scheduled Cleanup",
            value: "runScheduledCleanup"
          }
        ],
        required: true,
        type: "options"
      },
      {
        default: "runDailyMaintenance",
        displayName: "Operation",
        displayOptions: {
          show: {
            resource: ["notion"]
          }
        },
        name: "operation",
        noDataExpression: true,
        options: [
          {
            action: "Run daily Notion maintenance",
            description: "Sync today's open Notion cards and update mapped Notion fields for active cards",
            name: "Run Daily Maintenance",
            value: "runDailyMaintenance"
          }
        ],
        required: true,
        type: "options"
      },
      {
        default: "",
        description: "Defaults to today's date in Asia/Seoul when empty.",
        displayName: "Date Key",
        name: "dateKey",
        placeholder: "2026-05-29",
        type: "string"
      },
      {
        default: 7,
        description: "How many recent days to scan, including the date key.",
        displayName: "Lookback Days",
        displayOptions: {
          show: {
            operation: ["runScheduledCleanup"],
            resource: ["aiCleanup"]
          }
        },
        name: "lookbackDays",
        type: "number",
        typeOptions: {
          maxValue: 31,
          minValue: 1,
          numberPrecision: 0
        }
      },
      {
        default: false,
        description: "Whether to include users already recorded as reminded for this date.",
        displayName: "Include Already Sent",
        displayOptions: {
          show: {
            operation: ["listMissingTimesheetUsers"],
            resource: ["dailyReminder"]
          }
        },
        name: "includeAlreadySent",
        type: "boolean"
      },
      {
        default: true,
        description: "Whether to output one item per reminder target instead of the raw API response.",
        displayName: "Split Targets Into Items",
        displayOptions: {
          show: {
            operation: ["listMissingTimesheetUsers"],
            resource: ["dailyReminder"]
          }
        },
        name: "splitTargets",
        type: "boolean"
      },
      {
        default: "",
        displayName: "User ID",
        displayOptions: {
          show: {
            operation: ["markReminderSent"],
            resource: ["dailyReminder"]
          }
        },
        name: "userId",
        required: true,
        type: "string"
      },
      {
        default: "",
        displayName: "Email",
        displayOptions: {
          show: {
            operation: ["markReminderSent"],
            resource: ["dailyReminder"]
          }
        },
        name: "email",
        required: true,
        type: "string"
      }
    ]
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const inputItems = this.getInputData();
    const items = inputItems.length > 0 ? inputItems : [{ json: {} }];
    const returnData: INodeExecutionData[] = [];
    const alertData: INodeExecutionData[] = [];
    const credentials = (await this.getCredentials("ajamApi")) as AjamCredentials;
    const baseUrl = normalizeBaseUrl(credentials.baseUrl);

    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const resource = this.getNodeParameter("resource", itemIndex) as string;
      const operation = this.getNodeParameter("operation", itemIndex) as string;
      const dateKey = getStringParameter(this, "dateKey", itemIndex).trim();
      const body: IDataObject = {};
      const url = resource === "notion"
        ? `${baseUrl}/api/internal/notion/daily-maintenance`
        : resource === "aiCleanup"
          ? `${baseUrl}/api/internal/ai/scheduled-cleanup`
          : `${baseUrl}/api/internal/reminders/daily-timesheet`;

      if (resource === "notion") {
        if (dateKey) {
          body.dateKey = dateKey;
        }
      } else if (resource === "aiCleanup") {
        body.lookbackDays = this.getNodeParameter("lookbackDays", itemIndex, 7) as number;

        if (dateKey) {
          body.dateKey = dateKey;
        }
      } else if (operation === "markReminderSent") {
        body.action = "mark-sent";
        body.dateKey = dateKey;
        body.email = getStringParameter(this, "email", itemIndex).trim();
        body.userId = getStringParameter(this, "userId", itemIndex).trim();
      } else {
        body.action = "list";
        body.includeAlreadySent = this.getNodeParameter("includeAlreadySent", itemIndex, false) as boolean;

        if (dateKey) {
          body.dateKey = dateKey;
        }
      }

      let response: IDataObject;

      try {
        response = (await this.helpers.httpRequest({
          body,
          headers: {
            Authorization: `Bearer ${credentials.apiToken}`,
            "Content-Type": "application/json"
          },
          json: true,
          method: "POST",
          url
        })) as IDataObject;
      } catch (error) {
        if (resource !== "notion" && resource !== "aiCleanup") {
          throw error;
        }

        const alert = resource === "aiCleanup"
          ? buildAiRequestFailureAlert({ dateKey, error })
          : buildNotionRequestFailureAlert({ dateKey, error });

        alertData.push({
          json: alert,
          pairedItem: {
            item: itemIndex
          }
        });
        returnData.push({
          json: {
            dateKey,
            error: alert.message,
            ok: false
          },
          pairedItem: {
            item: itemIndex
          }
        });
        continue;
      }

      if (operation === "listMissingTimesheetUsers" && this.getNodeParameter("splitTargets", itemIndex, true)) {
        const targets = Array.isArray(response.targets) ? response.targets : [];

        for (const target of targets) {
          returnData.push({
            json: {
              dateKey: response.dateKey,
              ...(target as IDataObject)
            },
            pairedItem: {
              item: itemIndex
            }
          });
        }
        continue;
      }

      if (resource === "notion") {
        const alert = buildNotionMaintenanceAlert(response);

        if (alert) {
          alertData.push({
            json: alert,
            pairedItem: {
              item: itemIndex
            }
          });
        }
      } else if (resource === "aiCleanup") {
        const alert = buildAiScheduledCleanupAlert(response);

        if (alert) {
          alertData.push({
            json: alert,
            pairedItem: {
              item: itemIndex
            }
          });
        }
      }

      returnData.push({
        json: response,
        pairedItem: {
          item: itemIndex
        }
      });
    }

    return [returnData, alertData];
  }
}
