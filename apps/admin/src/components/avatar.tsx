import { useState, type CSSProperties } from 'react';

const initials = (name: string | null) => (name || '?').slice(0, 2);

export function Avatar({ name, url, className, style }: {
  name: string | null;
  url: string | null;
  className?: string;
  style?: CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  const src = failed ? null : safeAvatarUrl(url);
  return (
    <div className={className ?? 'avatar'} style={style}>
      {src
        ? <img src={src} alt="" onError={() => setFailed(true)} />
        : initials(name)}
    </div>
  );
}

function safeAvatarUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}
