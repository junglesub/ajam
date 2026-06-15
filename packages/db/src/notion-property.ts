import type { NotionPropertyDescriptor } from "./notion-store";

export function getNotionPropertyKey(descriptor: NotionPropertyDescriptor | null | undefined): string {
  return descriptor?.id || descriptor?.name || "";
}

export function isMappedNotionPropertyType(
  descriptor: NotionPropertyDescriptor | null | undefined,
  type: string
): descriptor is NotionPropertyDescriptor {
  return Boolean(getNotionPropertyKey(descriptor) && (!descriptor?.type || descriptor.type === type));
}

export function pickRawNotionProperty(
  properties: Record<string, unknown>,
  descriptor: NotionPropertyDescriptor | null | undefined
): unknown {
  if (!descriptor) {
    return undefined;
  }

  if (descriptor.id) {
    const propertyById = Object.values(properties).find((value) => (value as { id?: string }).id === descriptor.id);

    if (propertyById) {
      return propertyById;
    }
  }

  return descriptor.name ? properties[descriptor.name] : undefined;
}
