import type { ICredentialType, INodeProperties } from "n8n-workflow";

export class AjamApi implements ICredentialType {
  name = "ajamApi";
  displayName = "aJam API";
  documentationUrl = "https://github.com/junglesub/ajam";
  properties: INodeProperties[] = [
    {
      default: "",
      description: "Base URL of the aJam app, for example https://ajam.example.com.",
      displayName: "Base URL",
      name: "baseUrl",
      placeholder: "https://ajam.example.com",
      required: true,
      type: "string"
    },
    {
      default: "",
      description: "Value of AJAM_INTERNAL_API_TOKEN configured in aJam.",
      displayName: "Internal API Token",
      name: "apiToken",
      required: true,
      type: "string",
      typeOptions: {
        password: true
      }
    }
  ];
}
