import Papa from 'papaparse';

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export interface LeadParseResult {
  valid: string[];
  invalidCount: number;
  duplicateCount: number;
}

export async function parseLeads(file: File): Promise<LeadParseResult> {
  const isCsv = file.name.endsWith('.csv');
  const text = await file.text();

  const candidates: string[] = [];

  if (isCsv) {
    const parsed = Papa.parse<string[]>(text, {
      skipEmptyLines: true,
      header: false,
    });

    for (const row of parsed.data) {
      if (Array.isArray(row)) {
        for (const cell of row) {
          if (typeof cell === 'string') {
            const matches = cell.match(EMAIL_REGEX);
            if (matches) {
              candidates.push(...matches);
            }
          }
        }
      }
    }
  } else {
    // TXT or delimiter separated
    const matches = text.match(EMAIL_REGEX);
    if (matches) {
      candidates.push(...matches);
    }
  }

  // Count non-empty tokens that weren't valid emails to estimate invalid items
  const tokens = text
    .split(/[\r\n,;\t]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !t.startsWith('#'));

  const seen = new Set<string>();
  const valid: string[] = [];
  let duplicateCount = 0;

  for (const raw of candidates) {
    const cleaned = raw.toLowerCase().trim();
    if (seen.has(cleaned)) {
      duplicateCount++;
    } else {
      seen.add(cleaned);
      valid.push(cleaned);
    }
  }

  const invalidCount = Math.max(0, tokens.length - candidates.length);

  return {
    valid,
    invalidCount,
    duplicateCount,
  };
}
