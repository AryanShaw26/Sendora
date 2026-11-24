import { describe, it, expect } from 'vitest';
import { normalizeRecipients } from '../src/services/schedule.service';

describe('Lead and Recipient Parsing Unit Tests', () => {
  it('handles arbitrary text and CSV formatting with duplicates and invalid tokens', () => {
    const rawTokens = [
      'John.Doe@Company.COM',
      'not-an-email',
      'john.doe@company.com', // duplicate
      'Jane.Smith+tag@Domain.co.uk',
      'bad_email@',
      '@domain.com',
      'CEO@sendora.local',
    ];

    const result = normalizeRecipients(rawTokens);
    expect(result.valid).toEqual([
      'john.doe@company.com',
      'jane.smith+tag@domain.co.uk',
      'ceo@sendora.local',
    ]);
    expect(result.invalidCount).toBe(3);
    expect(result.duplicateCount).toBe(1);
  });
});
