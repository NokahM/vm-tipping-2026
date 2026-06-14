import { useState } from 'react';
import { broadcaster } from '../utils/broadcasters';

interface Props {
  apiId: number;
  className?: string;
}

/**
 * Liten logo for norsk kringkaster (NRK/TV2). Faller tilbake til tekst hvis logoen
 * mangler, og viser ingenting hvis kampen ikke er registrert med kanal ennå.
 */
export default function BroadcasterBadge({ apiId, className = 'h-4' }: Props) {
  const channel = broadcaster(apiId);
  const [failed, setFailed] = useState(false);

  if (!channel) return null;

  if (failed) {
    return (
      <span className="text-[10px] font-semibold text-slate-300" title={`Sendes på ${channel}`}>
        {channel}
      </span>
    );
  }

  return (
    <img
      src={`/tv/${channel.toLowerCase()}.png`}
      alt={channel}
      title={`Sendes på ${channel}`}
      className={`${className} w-auto shrink-0`}
      onError={() => setFailed(true)}
    />
  );
}
