import type { Match } from '../lib/match';
import { fmtPct, fmtSigned } from '../lib/storage';
import { OFFER_STAGE_LABELS, SOURCE_KIND_LABELS } from '../lib/types';

export default function SourcesPanel({ matches, isPrime }: { matches: Match[]; isPrime: boolean }) {
  return (
    <div className="sources">
      <table>
        <thead>
          <tr>
            <th>תאריך פרסום</th>
            <th>מקור</th>
            <th>בנק</th>
            <th>שלב</th>
            <th>תקופה</th>
            <th>{isPrime ? 'מרווח' : 'ריבית'}</th>
            <th>ציטוט / צילום</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((m, i) => {
            const src = m.record.source;
            return (
              <tr key={`${m.record.id}-${i}`} className={m.record.origin === 'demo' ? 'demo-row' : ''}>
                <td>{src.postedAt}</td>
                <td>
                  <div>{SOURCE_KIND_LABELS[src.kind]}</div>
                  <div className="muted">
                    {src.url ? (
                      <a href={src.url} target="_blank" rel="noreferrer">
                        {src.channel}
                      </a>
                    ) : (
                      src.channel
                    )}
                    {src.authorLabel && <> · {src.authorLabel}</>}
                  </div>
                  {m.record.origin === 'local' && <span className="badge">מקומי</span>}
                  {m.record.origin === 'demo' && <span className="badge demo">דמו</span>}
                </td>
                <td>{m.record.bank ?? '—'}</td>
                <td>{OFFER_STAGE_LABELS[m.record.stage]}</td>
                <td>
                  {m.track.termYears} שנים{m.termDistance > 0 && <span className="muted"> (±{m.termDistance})</span>}
                </td>
                <td>
                  <b>{isPrime ? `P${fmtSigned(m.value)}` : fmtPct(m.value)}</b>
                  {isPrime && m.track.primeMargin === undefined && <div className="muted">הומר מריבית כוללת</div>}
                </td>
                <td>
                  {src.quote && <q>{src.quote}</q>}
                  {src.screenshot && (
                    <a href={src.screenshot} target="_blank" rel="noreferrer">
                      <img className="thumb" src={src.screenshot} alt="צילום ההצעה" />
                    </a>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
