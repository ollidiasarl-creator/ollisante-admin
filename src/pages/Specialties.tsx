import { FormEvent, useState } from 'react';
import { api, Specialty } from '../api';
import { ErrorBox, Modal, PageHead, errorText, useLoad } from '../ui';

export default function Specialties() {
  const { data, error, reload } = useLoad(() => api<Specialty[]>('/api/v1/specialties'), []);
  const [editing, setEditing] = useState<Specialty | 'new' | null>(null);
  return (
    <>
      <PageHead title="Spécialités" lead="Spécialités proposées aux professionnels à l’inscription et aux patients pour la prise de rendez-vous.">
        <button className="btn" onClick={() => setEditing('new')}>Ajouter une spécialité</button>
      </PageHead>
      <ErrorBox text={error} />
      <table>
        <thead><tr><th>Nom (français)</th><th>Nom (anglais)</th><th>Code</th><th /></tr></thead>
        <tbody>
          {(data ?? []).map((s) => (
            <tr key={s.code}>
              <td><strong>{s.nameFr}</strong></td>
              <td>{s.nameEn}</td>
              <td className="hint">{s.code}</td>
              <td className="actions"><button className="btn small secondary" onClick={() => setEditing(s)}>Renommer</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing ? (
        <SpecialtyForm specialty={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />
      ) : null}
    </>
  );
}

function SpecialtyForm({ specialty, onClose, onSaved }: { specialty: Specialty | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [nameFr, setNameFr] = useState(specialty?.nameFr ?? '');
  const [nameEn, setNameEn] = useState(specialty?.nameEn ?? '');
  const [code, setCode] = useState(specialty?.code ?? '');
  const [error, setError] = useState<string | null>(null);

  // Code suggéré à partir du nom anglais : « Gastro-enterology » → GASTRO_ENTEROLOGY
  const suggest = (en: string) =>
    en.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]+/g, '_').replace(/^_|_$/g, '').slice(0, 50);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      if (specialty) {
        await api(`/api/v1/admin/specialties/${specialty.code}`, { method: 'PATCH', body: { nameFr, nameEn } });
      } else {
        await api('/api/v1/admin/specialties', { method: 'POST', body: { code: code || suggest(nameEn), nameFr, nameEn } });
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <Modal title={specialty ? `Renommer : ${specialty.nameFr}` : 'Ajouter une spécialité'} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBox text={error} />
        <div className="form-grid">
          <label className="field"><span>Nom (français)<span className="req">*</span></span><input value={nameFr} onChange={(e) => setNameFr(e.target.value)} required /></label>
          <label className="field"><span>Nom (anglais)<span className="req">*</span></span><input value={nameEn} onChange={(e) => setNameEn(e.target.value)} required /></label>
          {specialty ? null : (
            <label className="field">Code technique<span className="hint">Laisser vide pour le générer depuis le nom anglais</span>
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={suggest(nameEn) || 'GASTROENTEROLOGY'} />
            </label>
          )}
        </div>
        <div className="form-actions">
          <button className="btn" type="submit">Enregistrer</button>
          <button className="btn secondary" type="button" onClick={onClose}>Annuler</button>
        </div>
      </form>
    </Modal>
  );
}
