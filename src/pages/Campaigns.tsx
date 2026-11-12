import { api } from '../api';
import { Empty, ErrorBox, PageHead, useLoad } from '../ui';

interface SourceStats { source: string; visits: number; signups: number; searches?: number; bookings?: number }

const PROFILES: Record<string, string> = { patient: 'Patient', medecin: 'Médecin', structure: 'Structure' };
const AB_LABELS: Record<string, string> = { 'ab-accueil-actuel': 'Version actuelle', 'ab-accueil-fluide': 'Version « fluide »' };
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)} %` : '—');


/** Affiches : scans du QR code et inscriptions qui ont suivi, par profil. */
export default function Campaigns() {
  const { data, error } = useLoad(() => api<SourceStats[]>('/api/v1/admin/campaign/stats'), []);
  const all = data ?? [];
  const ab = all.filter((r) => r.source.startsWith('ab-'));
  const rows = all.filter((r) => !r.source.startsWith('ab-'));
  return (
    <>
      <PageHead
        title="Affiches et test A/B"
        lead="Scans du QR code de chaque affiche et inscriptions qui ont suivi. Le taux = inscriptions ÷ scans."
      />
      <ErrorBox text={error} />
      <h2>Test A/B de l’accueil du site</h2>
      <p className="muted">Chaque visiteur voit au hasard l’une des deux versions de l’accueil et la garde. Seuls les visiteurs qui acceptent la mesure d’audience sont comptés. Attendez quelques centaines de visites par version avant de conclure.</p>
      {data && !ab.length ? <Empty text="Aucune visite comptée pour l’instant." /> : null}
      {ab.length ? (
        <table>
          <thead><tr><th>Version</th><th>Visites</th><th>Recherches</th><th>Clics sur un horaire</th><th>Inscriptions</th><th>Taux d’inscription</th></tr></thead>
          <tbody>
            {ab.map((r) => (
              <tr key={r.source}>
                <td><strong>{AB_LABELS[r.source] ?? r.source}</strong></td>
                <td>{r.visits}</td>
                <td>{r.searches ?? 0} <span className="muted">({pct(r.searches ?? 0, r.visits)})</span></td>
                <td>{r.bookings ?? 0} <span className="muted">({pct(r.bookings ?? 0, r.visits)})</span></td>
                <td>{r.signups}</td>
                <td>{pct(r.signups, r.visits)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <h2>Affiches</h2>
      {data && !rows.length ? <Empty text="Aucun scan pour l’instant." /> : null}
      {rows.length ? (
        <table>
          <thead><tr><th>Affiche</th><th>Scans</th><th>Inscriptions</th><th>Taux</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const [profile] = r.source.split('-');
              return (
                <tr key={r.source}>
                  <td><strong>{PROFILES[profile] ?? profile}</strong></td>
                  <td>{r.visits}</td>
                  <td>{r.signups}</td>
                  <td>{pct(r.signups, r.visits)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
    </>
  );
}
