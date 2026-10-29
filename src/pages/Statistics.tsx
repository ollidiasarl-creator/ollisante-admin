import { useState } from 'react';
import { api } from '../api';
import { Empty, ErrorBox, PageHead, useLoad } from '../ui';

interface MonthRow { month: string; total: number; confirmed: number; completed: number; cancelled: number }
interface CountRow { code: string; label: string; count: number }
interface AppointmentStats {
  from: string; to: string; total: number;
  byMonth: MonthRow[]; byStatus: CountRow[]; byCountry: CountRow[]; bySpecialty: CountRow[];
}

const STATUS: Record<string, string> = {
  CONFIRMED: 'Confirmés', PENDING_PAYMENT: 'En attente de paiement', COMPLETED: 'Terminés',
  CANCELLED: 'Annulés', NO_SHOW: 'Patient absent',
};
const PERIODS = [3, 6, 12];
const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit', timeZone: 'UTC' });

/** Plus petit maximum « rond » au-dessus de la valeur, pour une échelle lisible. */
function niceMax(v: number) {
  if (v <= 5) return 5;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 5, 10].map((k) => k * p).find((x) => x >= v) ?? v;
}

function Columns({ rows }: { rows: MonthRow[] }) {
  const max = niceMax(Math.max(...rows.map((r) => r.total), 0));
  const peak = Math.max(...rows.map((r) => r.total));
  return (
    <>
      <div className="cols" role="img" aria-label="Rendez-vous par mois">
        {rows.map((r) => (
          <div className="col-slot" key={r.month} tabIndex={0}>
            {r.total > 0 && (r.total === peak || r === rows[rows.length - 1]) ? <span className="col-value">{r.total}</span> : null}
            <div className="col" style={{ height: `${(r.total / max) * 100}%` }} />
            <div className="tip">
              <strong>{monthLabel(r.month)}</strong> · {r.total} rendez-vous<br />
              {r.confirmed} confirmés · {r.completed} terminés · {r.cancelled} annulés
            </div>
          </div>
        ))}
      </div>
      <div className="col-axis">{rows.map((r) => <span key={r.month}>{monthLabel(r.month)}</span>)}</div>
    </>
  );
}

function Bars({ rows, label }: { rows: CountRow[]; label: (r: CountRow) => string }) {
  if (rows.length === 0) return <Empty text="Aucun rendez-vous sur la période." />;
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <div className="bars">
      {rows.slice(0, 10).map((r) => (
        <div className="bar-row" key={r.code} title={`${label(r)} : ${r.count}`}>
          <span>{label(r)}</span>
          <div className="bar-track"><div className="bar" style={{ width: `${(r.count / max) * 100}%` }} /></div>
          <span className="bar-num">{r.count}</span>
        </div>
      ))}
    </div>
  );
}

export default function Statistics() {
  const [months, setMonths] = useState(6);
  const [table, setTable] = useState(false);
  const { data, error } = useLoad(() => api<AppointmentStats>(`/api/v1/admin/stats/appointments?months=${months}`), [months]);

  return (
    <>
      <PageHead title="Statistiques" lead="Rendez-vous selon leur date, sur la période choisie.">
        <div className="tabs" style={{ marginBottom: 0 }}>
          {PERIODS.map((m) => (
            <button key={m} className={`tab${months === m ? ' on' : ''}`} onClick={() => setMonths(m)}>{m} mois</button>
          ))}
        </div>
      </PageHead>
      <ErrorBox text={error} />
      {data ? (
        <>
          <div className="card chart-card">
            <h2>Rendez-vous par mois</h2>
            <p className="sub">
              <span className="hero">{data.total.toLocaleString('fr-FR')}</span> rendez-vous du{' '}
              {new Date(data.from).toLocaleDateString('fr-FR')} au {new Date(data.to).toLocaleDateString('fr-FR')}
            </p>
            {table ? (
              <table>
                <thead><tr><th>Mois</th><th>Total</th><th>Confirmés</th><th>Terminés</th><th>Annulés</th></tr></thead>
                <tbody>
                  {data.byMonth.map((r) => (
                    <tr key={r.month}><td>{monthLabel(r.month)}</td><td className="num">{r.total}</td>
                      <td className="num">{r.confirmed}</td><td className="num">{r.completed}</td><td className="num">{r.cancelled}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : <Columns rows={data.byMonth} />}
            <p style={{ margin: '12px 0 0' }}>
              <button className="link-btn" onClick={() => setTable(!table)}>{table ? 'Voir le graphique' : 'Voir le tableau'}</button>
            </p>
          </div>
          <div className="grid-2">
            <div className="card chart-card">
              <h2>Par pays</h2>
              <p className="sub">Pays du professionnel consulté</p>
              <Bars rows={data.byCountry} label={(r) => r.label} />
            </div>
            <div className="card chart-card">
              <h2>Par spécialité</h2>
              <p className="sub">Un rendez-vous compte pour chaque spécialité du professionnel</p>
              <Bars rows={data.bySpecialty} label={(r) => r.label} />
            </div>
            <div className="card chart-card">
              <h2>Par statut</h2>
              <p className="sub">État actuel des rendez-vous de la période</p>
              <Bars rows={data.byStatus} label={(r) => STATUS[r.code] ?? r.code} />
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
