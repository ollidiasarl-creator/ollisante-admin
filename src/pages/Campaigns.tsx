import { api } from '../api';
import { Empty, ErrorBox, PageHead, useLoad } from '../ui';

interface SourceStats { source: string; visits: number; signups: number }

const PROFILES: Record<string, string> = { patient: 'Patient', medecin: 'Médecin', structure: 'Structure' };


/** Affiches : scans du QR code et inscriptions qui ont suivi, par profil. */
export default function Campaigns() {
  const { data, error } = useLoad(() => api<SourceStats[]>('/api/v1/admin/campaign/stats'), []);
  const rows = data ?? [];
  return (
    <>
      <PageHead
        title="Affiches"
        lead="Scans du QR code de chaque affiche et inscriptions qui ont suivi. Le taux = inscriptions ÷ scans."
      />
      <ErrorBox text={error} />
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
                  <td>{r.visits ? `${Math.round((r.signups / r.visits) * 100)} %` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
    </>
  );
}
