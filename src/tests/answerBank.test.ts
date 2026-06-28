import { describe, it, expect } from 'vitest';
import { findAnswer } from '@/core/llm/answerBank';
import type { SavedAnswer } from '@/core/profile.schema';

const bank: SavedAnswer[] = [
  {
    id: '1',
    questionPattern: 'why do you want to work here',
    answer: 'Because the mission.',
    tags: [],
  },
  { id: '2', questionPattern: 'what are your salary expectations', answer: '$150k', tags: [] },
];

describe('findAnswer', () => {
  it('matches a closely-worded question above threshold', () => {
    expect(findAnswer('Why do you want to work at our company?', bank)?.id).toBe('1');
  });

  it('matches the salary question', () => {
    expect(findAnswer('What are your salary expectations for this role?', bank)?.id).toBe('2');
  });

  it('returns null below the threshold', () => {
    expect(findAnswer('Describe a time you failed', bank)).toBeNull();
  });

  it('returns null for an empty bank', () => {
    expect(findAnswer('anything', [])).toBeNull();
  });
});
