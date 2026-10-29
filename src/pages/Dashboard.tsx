import { api, Stats } from '../api';
import { ErrorBox, PageHead, useLoad } from '../ui';

const CARDS: { key: keyof Stats; label: string; alert?: boolean }[] = [
  { key: 'appointmentsToday', label: 'Rendez-vous aujourd’hui' },
  { key: 'appointmentsUpcoming', label: 'Rendez-vous à venir' },
  { key: 'appointmentsThisMonth', label: 'Rendez-vous ce mois-ci' },
  { key: 'cancelledThisMonth', label: 'Annulations ce mois-ci' },
  { key: 'patients', label: 'Patients inscrits' },
  { key: 'practitionersVerified', label: 'Professionnels validés' },
  { key: 'practitionersPending', label: 'Professionnels à valider', alert: true },
  { key: 'facilities', label: 'Structures de santé' },
  { key: 'news', label: 'Actualités publiées' },
];

export default function Dashboard() {
  const { data, error } = useLoad(() => api<Stats>('/api/v1/admin/stats'), []);
  return (
    <>
      <PageHead title="Tableau de bord" lead="Vue d’ensemble de l’activité Ollisanté." />
      <ErrorBox text={error} />
      <div className="stats">
        {CARDS.map((c) => (
          <div key={c.key} className={`card stat${c.alert && data && data[c.key] > 0 ? ' alert' : ''}`}>
            <div className="stat-label">{c.label}</div>
            <div className="stat-value">{data ? data[c.key].toLocaleString('fr-FR') : '–'}</div>
          </div>
        ))}
      </div>
      {data && data.practitionersPending > 0 ? (
        <p className="lead" style={{ marginTop: 18 }}>
          <a href="#/professionnels">Voir les professionnels en attente de validation →</a>
        </p>
      ) : null}
    </>
  );
}
