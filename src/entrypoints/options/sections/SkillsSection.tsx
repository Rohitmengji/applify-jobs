import { useState } from 'react';
import { Section, TextInput, Button, type SectionProps } from '../components/ui';

export function SkillsSection({ draft, setDraft }: SectionProps) {
  const [text, setText] = useState('');

  const add = () => {
    // Allow comma-separated bulk entry.
    const parts = text
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    setDraft((d) => ({
      ...d,
      skills: [...d.skills, ...parts.filter((p) => !d.skills.includes(p))],
    }));
    setText('');
  };

  const remove = (i: number) =>
    setDraft((d) => ({ ...d, skills: d.skills.filter((_, idx) => idx !== i) }));

  return (
    <Section title="Skills" description="Add skills one at a time or comma-separated.">
      <div className="flex gap-2">
        <div className="flex-1">
          <TextInput
            value={text}
            onChange={setText}
            placeholder="React, TypeScript, Node.js"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
        </div>
        <Button onClick={add}>Add</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {draft.skills.map((skill, i) => (
          <span
            key={`${skill}-${i}`}
            className="flex items-center gap-1 rounded-full bg-indigo-100 px-3 py-1 text-xs text-indigo-800"
          >
            {skill}
            <button
              onClick={() => remove(i)}
              className="text-indigo-400 hover:text-indigo-700"
              title="Remove"
            >
              ✕
            </button>
          </span>
        ))}
        {draft.skills.length === 0 && <span className="text-xs text-gray-400">No skills yet.</span>}
      </div>
    </Section>
  );
}
