import { useState } from 'react';
import { teamLogo } from '../utils/teamLogos';

interface Props {
  /** Norsk lagnavn (normalisert). */
  name: string;
  className?: string;
}

/**
 * Viser et lags logo. Faller elegant tilbake til en tom plass hvis logoen
 * mangler eller ikke laster (så layouten holder seg lik før logoene er lagt inn).
 */
export default function TeamLogo({ name, className = 'h-8 w-8' }: Props) {
  const [failed, setFailed] = useState(false);
  const src = teamLogo(name);

  if (!src || failed) {
    return <span className={`${className} shrink-0`} aria-hidden="true" />;
  }

  return (
    <img
      src={src}
      alt=""
      className={`${className} shrink-0 object-contain`}
      onError={() => setFailed(true)}
      loading="lazy"
    />
  );
}
