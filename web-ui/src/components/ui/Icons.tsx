export function LockClosedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
      <path
        fillRule="evenodd"
        d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-.5V4.5A3.5 3.5 0 0 0 8 1Zm2 6V4.5a2 2 0 1 0-4 0V7h4Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function LockOpenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
      <path d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1H6V4.5a2 2 0 1 1 4 0 .75.75 0 0 0 1.5 0A3.5 3.5 0 0 0 8 1Z" />
    </svg>
  );
}

export function GearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
      <path fillRule="evenodd" d="M8.34 1.804A1 1 0 0 1 9.32 1h1.36a1 1 0 0 1 .98.804l.295 1.473c.497.179.971.41 1.416.69l1.38-.493a1 1 0 0 1 1.216.49l.68 1.177a1 1 0 0 1-.237 1.293l-1.086.98a7 7 0 0 1 0 1.372l1.086.98a1 1 0 0 1 .237 1.293l-.68 1.177a1 1 0 0 1-1.216.49l-1.38-.493a7 7 0 0 1-1.416.69l-.295 1.473A1 1 0 0 1 10.68 15H9.32a1 1 0 0 1-.98-.804l-.295-1.473a7 7 0 0 1-1.416-.69l-1.38.493a1 1 0 0 1-1.216-.49l-.68-1.177a1 1 0 0 1 .237-1.293l1.086-.98a7 7 0 0 1 0-1.372l-1.086-.98a1 1 0 0 1-.237-1.293l.68-1.177a1 1 0 0 1 1.216-.49l1.38.493a7 7 0 0 1 1.416-.69L8.34 1.804ZM10 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" clipRule="evenodd" />
    </svg>
  );
}
