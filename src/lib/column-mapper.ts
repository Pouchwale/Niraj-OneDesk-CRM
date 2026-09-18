import { OtifTargetField } from '@/lib/otif-schema';

export function normalizeHeader(header: string): string {
  if (!header) return '';
  return header
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '');
}

export function findBestMatch(header: string, schema: OtifTargetField[]): OtifTargetField | null {
  if (!header) return null;
  const normalizedHeader = normalizeHeader(header);
  if (!normalizedHeader || normalizedHeader.length < 2) return null;

  // 1. Exact match on key or label (normalized)
  for (const field of schema) {
    if (normalizeHeader(field.key) === normalizedHeader || normalizeHeader(field.label) === normalizedHeader) {
      return field;
    }
  }

  // 2. Exact match on aliases
  for (const field of schema) {
    for (const alias of field.aliases) {
      if (normalizeHeader(alias) === normalizedHeader) {
        return field;
      }
    }
  }

  // 3. Substring match: Check if header contains alias (alias length >= 3)
  for (const field of schema) {
    for (const alias of field.aliases) {
      const normalizedAlias = normalizeHeader(alias);
      if (normalizedAlias.length >= 3 && normalizedHeader.includes(normalizedAlias)) {
        return field;
      }
    }
  }

  return null;
}

export function autoMapColumns(headers: string[], schema: OtifTargetField[]): Map<number, OtifTargetField> {
  const mapping = new Map<number, OtifTargetField>();
  const mappedKeys = new Set<string>();

  headers.forEach((header, index) => {
    const match = findBestMatch(header, schema);
    if (match && !mappedKeys.has(match.key)) {
      mapping.set(index, match);
      mappedKeys.add(match.key);
    }
  });

  return mapping;
}
