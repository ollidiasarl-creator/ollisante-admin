import { FormEvent, useState } from 'react';
import { api, Country, Facility, ORG_TYPES } from '../api';
import { Empty, ErrorBox, Modal, PageHead, PhoneInput, errorText, useLoad } from '../ui';
import Structures, { StructureCreateForm } from './Structures';

type Tab = 'sites' | 'comptes';

/** Un seul menu « Structures » : les lieux de consultation, et les comptes des structures inscrites (à valider). */
export default function Establishments() {
  const [tab, setTab] = useState<Tab>('sites');
  return (
    <>
      <PageHead title="Structures de santé" lead="Hôpitaux, cliniques, cabinets, centres de santé, associations et ONG." />
      <div className="tabs">
        <button className={`tab${tab === 'sites' ? ' on' : ''}`} onClick={() => setTab('sites')}>Lieux de consultation</button>
        <button className={`tab${tab === 'comptes' ? ' on' : ''}`} onClick={() => setTab('comptes')}>Comptes structures (validation)</button>
      </div>
      {tab === 'sites' ? <Sites /> : <Structures />}
    </>
  );
}

function Sites() {
  const [country, setCountry] = useState('');
  const [q, setQ] = useState('');
  const countries = useLoad(() => api<Country[]>('/api/v1/admin/countries'), []);
  const list = useLoad(
    () => api<Facility[]>(`/api/v1/facilities${country ? `?countryCode=${country}` : ''}`),
    [country],
  );
  const [editing, setEditing] = useState<Facility | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const name = (code: string) => countries.data?.find((c) => c.code === code)?.nameFr ?? code;
  const needle = q.trim().toLowerCase();
  const rows = (list.data ?? []).filter((f) => !needle || `${f.name} ${f.city ?? ''}`.toLowerCase().includes(needle));

  async function remove(f: Facility) {
    if (!window.confirm(`Supprimer « ${f.name} » ?`)) return;
    setActionError(null);
    try {
      await api(`/api/v1/admin/facilities/${f.id}`, { method: 'DELETE' });
      await list.reload();
    } catch (e) {
      setActionError(errorText(e));
    }
  }

  return (
    <>
      <p className="lead">Lieux où les professionnels reçoivent sur place. Ceux d’une structure inscrite sont aussi gérés par elle depuis son Espace Structure.</p>
      <div className="toolbar">
        <select value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Pays">
          <option value="">Tous les pays</option>
          {(countries.data ?? []).map((c) => <option key={c.code} value={c.code}>{c.nameFr}</option>)}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher (nom, ville)" aria-label="Rechercher" />
        <div className="spacer" />
        <button className="btn" onClick={() => setAdding(true)}>Ajouter une structure</button>
      </div>
      {notice ? <div className="notice">{notice}</div> : null}
      <ErrorBox text={list.error ?? actionError} />
      {rows.length === 0 && !list.loading ? <Empty text="Aucune structure." /> : (
        <table>
          <thead><tr><th>Nom</th><th>Type</th><th>Pays</th><th>Ville</th><th>Adresse</th><th>Téléphone</th><th /></tr></thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.id}>
                <td><strong>{f.name}</strong></td>
                <td>{f.organizationType ? ORG_TYPES[f.organizationType] : <span className="hint">Lieu indépendant</span>}</td>
                <td>{name(f.countryCode)}</td>
                <td>{[f.locality, f.city].filter(Boolean).join(', ') || '–'}</td>
                <td>{f.address ?? '–'}</td>
                <td>{f.phone ?? '–'}</td>
                <td className="actions">
                  <button className="btn small secondary" onClick={() => setEditing(f)}>Modifier</button>
                  <button className="btn small danger" onClick={() => void remove(f)}>Supprimer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {adding ? (
        <StructureCreateForm
          countries={countries.data ?? []}
          onClose={() => setAdding(false)}
          onCreated={async (msg) => { setNotice(msg); await list.reload(); }}
        />
      ) : null}
      {editing ? (
        <FacilityForm
          facility={editing}
          countries={countries.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={list.reload}
        />
      ) : null}
    </>
  );
}

function FacilityForm({ facility, countries, onClose, onSaved }: {
  facility: Facility | null; countries: Country[]; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [f, setF] = useState({
    name: facility?.name ?? '', countryCode: facility?.countryCode ?? '', city: facility?.city ?? '', locality: facility?.locality ?? '',
    address: facility?.address ?? '', phone: facility?.phone ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = {
      name: f.name.trim(), countryCode: f.countryCode, city: f.city.trim() || null, locality: f.locality.trim() || null,
      address: f.address.trim() || null, phone: f.phone.trim() || null,
    };
    try {
      if (facility) await api(`/api/v1/admin/facilities/${facility.id}`, { method: 'PATCH', body });
      else await api('/api/v1/facilities', { method: 'POST', body });
      await onSaved();
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <Modal title={facility ? `Modifier : ${facility.name}` : 'Ajouter une structure'} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBox text={error} />
        <div className="form-grid">
          <label className="field"><span>Nom<span className="req">*</span></span><input value={f.name} onChange={set('name')} required /></label>
          <label className="field"><span>Pays<span className="req">*</span></span>
            <select value={f.countryCode} onChange={set('countryCode')} required>
              <option value="">Choisir…</option>
              {countries.map((c) => <option key={c.code} value={c.code}>{c.nameFr}</option>)}
            </select>
          </label>
          <label className="field">Ville<input value={f.city} onChange={set('city')} /></label>
          <label className="field">Localité<span className="hint">Quartier ou commune</span><input value={f.locality} onChange={set('locality')} maxLength={100} /></label>
          <label className="field">Adresse<input value={f.address} onChange={set('address')} /></label>
          <label className="field">Téléphone
            <PhoneInput value={f.phone} onChange={(phone) => setF({ ...f, phone })} country={f.countryCode} />
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
