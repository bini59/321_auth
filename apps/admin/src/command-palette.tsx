// apps/admin/src/command-palette.tsx — ⌘K
import { useEffect, useMemo, useRef, useState } from 'react';
import { SearchIcon } from './icons';

export type Command = { id: string; label: string; group: string; badge: string; run: () => void };

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((v) => !v);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return { open, setOpen };
}

export function CommandPalette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? commands.filter((c) => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q)) : commands;
    return list.slice(0, 8);
  }, [commands, query]);

  useEffect(() => { setCursor(0); }, [query]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setCursor((c) => Math.min(c + 1, matches.length - 1)); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (event.key === 'Enter' && matches[cursor]) { event.preventDefault(); matches[cursor].run(); onClose(); }
  };

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette" onClick={(event) => event.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="palette-head">
          <SearchIcon size={15} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="명령 또는 사용자 검색"
            aria-label="명령 검색"
          />
          <kbd>ESC</kbd>
        </div>
        <div className="palette-list">
          {matches.map((command, index) => (
            <button
              key={command.id}
              className={index === cursor ? 'palette-item active' : 'palette-item'}
              onMouseEnter={() => setCursor(index)}
              onClick={() => { command.run(); onClose(); }}
            >
              <span className="palette-badge">{command.badge}</span>
              {command.label}
              <span className="spacer" />
              <span className="dim" style={{ fontSize: 11 }}>{command.group}</span>
            </button>
          ))}
          {matches.length === 0 && (
            <div style={{ padding: 34, textAlign: 'center', color: 'var(--fg-3)', fontSize: 12.5 }}>
              일치하는 명령이 없습니다
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
