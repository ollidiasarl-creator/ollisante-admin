import { FormEvent, useState } from 'react';
import { api } from '../api';
import { Empty, ErrorBox, Modal, PageHead, errorText, useLoad } from '../ui';

type Audience = 'ALL' | 'PATIENT' | 'PRACTITIONER';
interface FaqEntry {
  id: string; questionFr: string; answerFr: string; questionEn: string | null; answerEn: string | null;
  audience: Audience; position: number; published: boolean;
}
const AUDIENCE: Record<Audience, string> = { ALL: 'Tout le monde', PATIENT: 'Patients', PRACTITIONER: 'Professionnels' };

export default function Faq() {
  const list = useLoad(() => api<FaqEntry[]>('/api/v1/admin/faq'), []);
  const [editing, setEditing] = useState<FaqEntry | 'new' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function remove(f: FaqEntry) {
    if (!window.confirm(`Supprimer « ${f.questionFr} » ?`)) return;
    setActionError(null);
    try {
      await api(`/api/v1/admin/faq/${f.id}`, { method: 'DELETE' });
      await list.reload();
    } catch (e) {
      setActionError(errorText(e));
    }
  }

  return (
    <>
      <PageHead title="FAQ" lead="Questions fréquentes affichées dans l’application (Compte → Aide). L’ordre suit le numéro de position.">
        <button className="btn" onClick={() => setEditing('new')}>Ajouter une question</button>
      </PageHead>
      <ErrorBox text={list.error ?? actionError} />
      {list.data && list.data.length === 0 ? <Empty text="Aucune question pour l’instant." /> : (
        <table>
          <thead><tr><th>Position</th><th>Question</th><th>Visible par</th><th>Anglais</th><th>Statut</th><th /></tr></thead>
          <tbody>
            {(list.data ?? []).map((f) => (
              <tr key={f.id}>
                <td className="num">{f.position}</td>
                <td><strong>{f.questionFr}</strong></td>
                <td>{AUDIENCE[f.audience]}</td>
                <td>{f.questionEn && f.answerEn ? 'Oui' : <span className="hint">Non (français affiché)</span>}</td>
                <td>{f.published ? <span className="badge ok">Publiée</span> : <span className="badge off">Brouillon</span>}</td>
                <td className="actions">
                  <button className="btn small secondary" onClick={() => setEditing(f)}>Modifier</button>
                  <button className="btn small danger" onClick={() => void remove(f)}>Supprimer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing ? <FaqForm entry={editing === 'new' ? null : editing} next={(list.data?.length ?? 0) + 1}
        onClose={() => setEditing(null)} onSaved={list.reload} /> : null}
    </>
  );
}

function FaqForm({ entry, next, onClose, onSaved }: { entry: FaqEntry | null; next: number; onClose: () => void; onSaved: () => Promise<void> }) {
  const [f, setF] = useState({
    questionFr: entry?.questionFr ?? '', answerFr: entry?.answerFr ?? '', questionEn: entry?.questionEn ?? '',
    answerEn: entry?.answerEn ?? '', audience: entry?.audience ?? 'ALL', position: String(entry?.position ?? next),
    published: entry?.published ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = {
      questionFr: f.questionFr.trim(), answerFr: f.answerFr.trim(), questionEn: f.questionEn.trim() || null,
      answerEn: f.answerEn.trim() || null, audience: f.audience, position: Number(f.position) || 0, published: f.published,
    };
    try {
      if (entry) await api(`/api/v1/admin/faq/${entry.id}`, { method: 'PATCH', body });
      else await api('/api/v1/admin/faq', { method: 'POST', body });
      await onSaved();
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <Modal title={entry ? 'Modifier la question' : 'Ajouter une question'} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBox text={error} />
        <label className="field"><span>Question (français)<span className="req">*</span></span><input value={f.questionFr} onChange={set('questionFr')} maxLength={300} required /></label>
        <label className="field" style={{ marginTop: 12 }}>Réponse (français)<textarea value={f.answerFr} onChange={set('answerFr')} maxLength={5000} required /></label>
        <label className="field" style={{ marginTop: 12 }}>Question (anglais, facultatif)<input value={f.questionEn} onChange={set('questionEn')} maxLength={300} /></label>
        <label className="field" style={{ marginTop: 12 }}>Réponse (anglais, facultatif)<textarea value={f.answerEn} onChange={set('answerEn')} maxLength={5000} /></label>
        <div className="form-grid" style={{ marginTop: 12 }}>
          <label className="field">Visible par
            <select value={f.audience} onChange={set('audience')}>
              {Object.entries(AUDIENCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="field">Position<input type="number" min={0} value={f.position} onChange={set('position')} /></label>
          <label className="field">Statut
            <select value={f.published ? 'yes' : 'no'} onChange={(e) => setF({ ...f, published: e.target.value === 'yes' })}>
              <option value="yes">Publiée</option>
              <option value="no">Brouillon</option>
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
