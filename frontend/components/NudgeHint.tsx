// One line that explains the two buttons next to every person.
export function NudgeHint({ className = '' }: { className?: string }) {
  return (
    <p className={'text-xs text-ink-2 ' + className}>
      <span className="font-semibold text-ink">Nudge</span> = a quick tap, no message ·{' '}
      <span className="font-semibold text-ink">Ping</span> = write a message
    </p>
  );
}
