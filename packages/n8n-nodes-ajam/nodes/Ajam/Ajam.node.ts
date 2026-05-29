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
    outputs: [NodeConnectionTypes.Main],
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
            name: "Daily Reminder",
            value: "dailyReminder"
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
        default: "",
        description: "Defaults to today's date in Asia/Seoul when empty.",
        displayName: "Date Key",
        name: "dateKey",
        placeholder: "2026-05-29",
        type: "string"
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
    const credentials = (await this.getCredentials("ajamApi")) as AjamCredentials;
    const baseUrl = normalizeBaseUrl(credentials.baseUrl);
    const url = `${baseUrl}/api/internal/reminders/daily-timesheet`;

    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const operation = this.getNodeParameter("operation", itemIndex) as string;
      const dateKey = getStringParameter(this, "dateKey", itemIndex).trim();
      const body: IDataObject = {};

      if (operation === "markReminderSent") {
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

      const response = (await this.helpers.httpRequest({
        body,
        headers: {
          Authorization: `Bearer ${credentials.apiToken}`,
          "Content-Type": "application/json"
        },
        json: true,
        method: "POST",
        url
      })) as IDataObject;

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

      returnData.push({
        json: response,
        pairedItem: {
          item: itemIndex
        }
      });
    }

    return [returnData];
  }
}
