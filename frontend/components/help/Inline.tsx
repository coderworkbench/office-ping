import { Fragment, ReactNode } from 'react';

// Minimal inline formatting: **bold** and *italic*.
export function Inline({ text }: { text: string }): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-bold text-ink">{part.slice(2, -2)}</strong>;
        // Sunbeam ships no italic face (§3.1), so *emphasis* is semibold brand ink.
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <span key={i} className="font-semibold text-brand">{part.slice(1, -1)}</span>;
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}
