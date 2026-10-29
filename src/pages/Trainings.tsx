import { FormEvent, useState } from 'react';
import { api, Country, Page, Specialty } from '../api';
import { Empty, ErrorBox, Modal, PageHead, dateTime, errorText, useLoad } from '../ui';

interface Training {
  id: string; title: string; description: string | null; format: 'ONLINE' | 'IN_PERSON';
  startsAt: string; endsAt: string | null; location: string | null; linkUrl: string | null;
  countryCode: string | null; specialtyCode: string | null; published: boolean;
}

/** « 2026-10-24T15:00:00Z » → valeur d'un champ datetime-local (heure de l'ordinateur), et inversement. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

export default function Trainings() {
  const countries = useLoad(() => api<Country[]>('/api/v1/admin/countries'), []);
  const specialties = useLoad(() => api<Specialty[]>('/api/v1/specialties'), []);
  const list = useLoad(() => api<Page<Training>>('/api/v1/admin/trainings?size=100'), []);
  const [editing, setEditing] = useState<Training | 'new' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const country = (c: string | null) => (c ? countries.data?.find((x) => x.code === c)?.nameFr ?? c : 'Tous les pays');
  const specialty = (c: string | null) => (c ? specialties.data?.find((x) => x.code === c)?.nameFr ?? c : 'Toutes');
  const now = Date.now();

  async function remove(t: Training) {
    if (!window.confirm(`Supprimer « ${t.title} » ?`)) return;
    setActionError(null);
    try {
      await api(`/api/v1/admin/trainings/${t.id}`, { method: 'DELETE' });
      await list.reload();
    } catch (e) {
      setActionError(errorText(e));
    }
  }

  return (
    <>
      <PageHead title="Formations" lead="Formations continues et webinaires, affichés aux professionnels du pays et de la spécialité visés.">
        <button className="btn" onClick={() => setEditing('new')}>Ajouter une formation</button>
      </PageHead>
      <ErrorBox text={list.error ?? actionError} />
      {list.data && list.data.content.length === 0 ? <Empty text="Aucune formation." /> : (
        <table>
          <thead><tr><th>Formation</th><th>Date</th><th>Format</th><th>Pays</th><th>Spécialité</th><th>Statut</th><th /></tr></thead>
          <tbody>
            {(list.data?.content ?? []).map((t) => {
              const past = new Date(t.endsAt ?? t.startsAt).getTime() < now;
              return (
                <tr key={t.id}>
                  <td><strong>{t.title}</strong>{t.location ? <><br /><span className="hint">{t.location}</span></> : null}</td>
                  <td>{dateTime(t.startsAt)}</td>
                  <td>{t.format === 'ONLINE' ? 'En ligne' : 'Sur place'}</td>
                  <td>{country(t.countryCode)}</td>
                  <td>{specialty(t.specialtyCode)}</td>
                  <td>{!t.published ? <span className="badge off">Brouillon</span> : past ? <span className="badge off">Passée</span> : <span className="badge ok">Publiée</span>}</td>
                  <td className="actions">
                    <button className="btn small secondary" onClick={() => setEditing(t)}>Modifier</button>
                    <button className="btn small danger" onClick={() => void remove(t)}>Supprimer</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {editing ? (
        <TrainingForm training={editing === 'new' ? null : editing} countries={countries.data ?? []}
          specialties={specialties.data ?? []} onClose={() => setEditing(null)} onSaved={list.reload} />
      ) : null}
    </>
  );
}

function TrainingForm({ training, countries, specialties, onClose, onSaved }: {
  training: Training | null; countries: Country[]; specialties: Specialty[]; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [f, setF] = useState({
    title: training?.title ?? '', description: training?.description ?? '', format: training?.format ?? 'ONLINE',
    startsAt: toLocalInput(training?.startsAt ?? null), endsAt: toLocalInput(training?.endsAt ?? null),
    location: training?.location ?? '', linkUrl: training?.linkUrl ?? '', countryCode: training?.countryCode ?? '',
    specialtyCode: training?.specialtyCode ?? '', published: training?.published ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = {
      title: f.title.trim(), description: f.description.trim() || null, format: f.format,
      startsAt: fromLocalInput(f.startsAt), endsAt: fromLocalInput(f.endsAt), location: f.location.trim() || null,
      linkUrl: f.linkUrl.trim() || null, countryCode: f.countryCode || null, specialtyCode: f.specialtyCode || null,
      published: f.published,
    };
    try {
      if (training) await api(`/api/v1/admin/trainings/${training.id}`, { method: 'PATCH', body });
      else await api('/api/v1/admin/trainings', { method: 'POST', body });
      await onSaved();
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <Modal title={training ? 'Modifier la formation' : 'Ajouter une formation'} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBox text={error} />
        <label className="field"><span>Titre<span className="req">*</span></span><input value={f.title} onChange={set('title')} maxLength={200} required /></label>
        <label className="field" style={{ marginTop: 12 }}>Description<textarea value={f.description} onChange={set('description')} maxLength={5000} /></label>
        <div className="form-grid" style={{ marginTop: 12 }}>
          <label className="field">Format
            <select value={f.format} onChange={set('format')}>
              <option value="ONLINE">En ligne (webinaire)</option>
              <option value="IN_PERSON">Sur place</option>
            </select>
          </label>
          <label className="field"><span>Début<span className="req">*</span></span><span className="hint">Heure de cet ordinateur</span>
            <input type="datetime-local" value={f.startsAt} onChange={set('startsAt')} required />
          </label>
          <label className="field">Fin (facultatif)<input type="datetime-local" value={f.endsAt} onChange={set('endsAt')} /></label>
          <label className="field">{f.format === 'ONLINE' ? 'Lien du webinaire' : 'Lien d’inscription (facultatif)'}
            <input value={f.linkUrl} onChange={set('linkUrl')} placeholder="https://" required={f.format === 'ONLINE'} />
          </label>
          <label className="field">Lieu{f.format === 'ONLINE' ? ' (facultatif)' : ''}
            <input value={f.location} onChange={set('location')} required={f.format === 'IN_PERSON'} />
          </label>
          <label className="field">Pays visé
            <select value={f.countryCode} onChange={set('countryCode')}>
              <option value="">Tous les pays</option>
              {countries.map((c) => <option key={c.code} value={c.code}>{c.nameFr}</option>)}
            </select>
          </label>
          <label className="field">Spécialité visée
            <select value={f.specialtyCode} onChange={set('specialtyCode')}>
              <option value="">Toutes les spécialités</option>
              {specialties.map((s) => <option key={s.code} value={s.code}>{s.nameFr}</option>)}
            </select>
          </label>
          <label className="field">Statut
            <select value={f.published ? 'yes' : 'no'} onChange={(e) => setF({ ...f, published: e.target.value === 'yes' })}>
              <option value="yes">Publiée</option>
              <option value="no">Brouillon (non visible)</option>
            </select>
          </label>
        </div>
        <div className="form-actions">
          <button className="btn" type="submit">Enregistrer</button>
          <button className="btn secondary" type="button" onClick={onClose}>Annuler</button>
        </div>
      </form>
    </Modal>
  );
}
