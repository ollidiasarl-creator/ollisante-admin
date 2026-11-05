import { FormEvent, useState } from 'react';
import { api, Country, ORG_TYPES, OrgType, Page, StructureProfile, Verification } from '../api';
import { EMPTY_STRUCTURE, StructureFields, structureBody } from '../StructureFields';
import { ReviewModal, alertsBeforeValidation } from '../Trust';
import { Empty, ErrorBox, Modal, PhoneInput, date, errorText, useLoad } from '../ui';

const TABS: { key: Verification; label: string }[] = [
  { key: 'PENDING', label: 'À vérifier' },
  { key: 'VERIFIED', label: 'Vérifiées' },
  { key: 'REJECTED', label: 'Refusées' },
];

/** Administration : vérifier les structures (hôpitaux, cliniques, ONG…) et régler leur commission. */
export default function Structures() {
  const [tab, setTab] = useState<Verification>('PENDING');
  const countries = useLoad(() => api<Country[]>('/api/v1/admin/countries'), []);
  const list = useLoad(() => api<Page<StructureProfile>>(`/api/v1/admin/structures?status=${tab}`), [tab]);
  const [commission, setCommission] = useState<StructureProfile | null>(null);
  const [editing, setEditing] = useState<StructureProfile | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<StructureProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const country = (c: string) => countries.data?.find((x) => x.code === c)?.nameFr ?? c;

  async function decide(s: StructureProfile, status: Verification) {
    const verb = status === 'VERIFIED' ? 'Valider' : 'Refuser';
    const effect = status === 'VERIFIED'
      ? 'Ses sites deviendront visibles des patients et elle pourra inviter ses médecins.'
      : 'Ses sites ne seront plus visibles des patients.';
    const warn = status === 'VERIFIED' ? await alertsBeforeValidation('organization', s.id) : '';
    if (!window.confirm(`${verb} « ${s.name} » ?\n${effect}${warn}`)) return;
    setError(null);
    try {
      await api(`/api/v1/admin/structures/${s.id}/verification`, { method: 'PATCH', body: { status } });
      await list.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <>
      <div className="toolbar">
        <p className="lead" style={{ margin: 0 }}>Comptes des structures inscrites (personnes morales). Vérifiez le numéro d’immatriculation et les coordonnées avant de valider.</p>
        <div className="spacer" />
        <button className="btn" onClick={() => setAdding(true)}>Ajouter une structure</button>
      </div>
      <div className="tabs">
        {TABS.map((t) => <button key={t.key} className={`tab${tab === t.key ? ' on' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>
      {notice ? <div className="notice">{notice}</div> : null}
      <ErrorBox text={list.error ?? error} />
      {list.data && list.data.content.length === 0 ? <Empty text="Aucune structure dans cette liste." /> : (
        <table>
          <thead><tr><th>Structure</th><th>Immatriculation</th><th>Contact</th><th>Lits</th><th>Commission</th><th>Inscrite le</th><th /></tr></thead>
          <tbody>
            {(list.data?.content ?? []).map((s) => (
              <tr key={s.id}>
                <td><strong>{s.name}</strong><br /><span className="hint">{ORG_TYPES[s.type]} · {[s.locality, s.city, country(s.countryCode)].filter(Boolean).join(', ')}{s.domain ? ` · ${s.domain}` : ''}</span></td>
                <td>{s.registrationNumber}</td>
                <td>{s.contactName}{s.contactRole ? ` (${s.contactRole})` : ''}<br /><span className="hint">{s.email} · {s.phone}</span></td>
                <td className="num">{s.beds ?? '–'}</td>
                <td>{s.commissionPercent != null ? `${s.commissionPercent} %` : <span className="hint">par défaut (10 %)</span>}</td>
                <td>{date(s.createdAt)}</td>
                <td className="actions">
                  <button className="btn small secondary" onClick={() => setReviewing(s)}>Pièces</button>
                  {s.verificationStatus !== 'VERIFIED' ? <button className="btn small" onClick={() => void decide(s, 'VERIFIED')}>Valider</button> : null}
                  {s.verificationStatus !== 'REJECTED' ? <button className="btn small danger" onClick={() => void decide(s, 'REJECTED')}>Refuser</button> : null}
                  <button className="btn small secondary" onClick={() => setEditing(s)}>Modifier</button>
                  <button className="btn small secondary" onClick={() => setCommission(s)}>Commission</button>
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
          onCreated={async (msg) => {
            setNotice(msg);
            if (tab !== 'VERIFIED') setTab('VERIFIED');
            else await list.reload();
          }}
        />
      ) : null}
      {editing ? <StructureForm structure={editing} onClose={() => setEditing(null)} onSaved={list.reload} /> : null}
      {commission ? <CommissionForm structure={commission} onClose={() => setCommission(null)} onSaved={list.reload} /> : null}
      {reviewing ? <ReviewModal type="organization" id={reviewing.id} name={reviewing.name} onClose={() => setReviewing(null)} /> : null}
    </>
  );
}

function CommissionForm({ structure, onClose, onSaved }: { structure: StructureProfile; onClose: () => void; onSaved: () => Promise<void> }) {
  const [value, setValue] = useState(structure.commissionPercent != null ? String(structure.commissionPercent) : '');
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = value.trim() === '' ? null : Number(value);
    if (n !== null && (!Number.isInteger(n) || n < 0 || n > 100)) return setError('Saisissez un pourcentage entre 0 et 100.');
    try {
      await api(`/api/v1/admin/structures/${structure.id}/commission`, { method: 'PATCH', body: { commissionPercent: n } });
      await onSaved();
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
  }
  return (
    <Modal title={`Commission : ${structure.name}`} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBox text={error} />
        <label className="field">Commission OLIDIA (%)<span className="hint">Vide = taux par défaut des structures (10 %). Médecins indépendants : 15 %.</span>
          <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="numeric" placeholder="10" />
        </label>
        <div className="form-actions">
          <button className="btn" type="submit">Enregistrer</button>
          <button className="btn secondary" type="button" onClick={onClose}>Annuler</button>
        </div>
      </form>
    </Modal>
  );
}

function StructureForm({ structure, onClose, onSaved }: { structure: StructureProfile; onClose: () => void; onSaved: () => Promise<void> }) {
  const [f, setF] = useState({
    type: structure.type, name: structure.name, city: structure.city ?? '', locality: structure.locality ?? '', address: structure.address ?? '',
    phone: structure.phone, domain: structure.domain ?? '', registrationNumber: structure.registrationNumber,
    contactName: structure.contactName, contactRole: structure.contactRole ?? '', beds: structure.beds != null ? String(structure.beds) : '',
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.phone) return setError('Indiquez le téléphone.');
    try {
      await api(`/api/v1/admin/structures/${structure.id}`, {
        method: 'PATCH',
        body: {
          type: f.type, name: f.name.trim(), city: f.city.trim() || null, locality: f.locality.trim() || null, address: f.address.trim() || null,
          phone: f.phone, domain: f.domain.trim() || null, registrationNumber: f.registrationNumber.trim(),
          contactName: f.contactName.trim(), contactRole: f.contactRole.trim() || null,
          beds: f.beds.trim() ? Number(f.beds) : null,
        },
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <Modal title={`Modifier : ${structure.name}`} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBox text={error} />
        <p className="req-note"><span className="req">*</span> champ obligatoire · E-mail de connexion : {structure.email}</p>
        <div className="form-grid">
          <label className="field"><span>Type<span className="req">*</span></span><select value={f.type} onChange={set('type')} required>
            {(Object.keys(ORG_TYPES) as OrgType[]).map((t) => <option key={t} value={t}>{ORG_TYPES[t]}</option>)}
          </select></label>
          <label className="field"><span>Nom<span className="req">*</span></span><input value={f.name} onChange={set('name')} maxLength={200} required /></label>
          <label className="field">Ville<input value={f.city} onChange={set('city')} /></label>
          <label className="field">Localité<span className="hint">Quartier ou commune</span><input value={f.locality} onChange={set('locality')} maxLength={100} /></label>
          <label className="field">Adresse<input value={f.address} onChange={set('address')} /></label>
          <label className="field"><span>Téléphone<span className="req">*</span></span><PhoneInput value={f.phone} onChange={(phone) => setF({ ...f, phone })} country={structure.countryCode} required /></label>
          <label className="field">Nom de domaine<input value={f.domain} onChange={set('domain')} placeholder="hopital.sn" /></label>
          <label className="field"><span>Numéro d’immatriculation<span className="req">*</span></span><input value={f.registrationNumber} onChange={set('registrationNumber')} required /></label>
          <label className="field"><span>Personne contact<span className="req">*</span></span><input value={f.contactName} onChange={set('contactName')} required /></label>
          <label className="field">Fonction du contact<input value={f.contactRole} onChange={set('contactRole')} /></label>
          <label className="field">Nombre de lits<input value={f.beds} onChange={set('beds')} inputMode="numeric" /></label>
        </div>
        <div className="form-actions">
          <button className="btn" type="submit">Enregistrer</button>
          <button className="btn secondary" type="button" onClick={onClose}>Annuler</button>
        </div>
      </form>
    </Modal>
  );
}

/** Ajout par l'administration : mêmes informations que l'inscription publique ; validée d'office, e-mail de bienvenue. */
export function StructureCreateForm({ countries, onClose, onCreated }: {
  countries: Country[]; onClose: () => void; onCreated: (notice: string) => Promise<void>;
}) {
  const [f, setF] = useState(EMPTY_STRUCTURE);
  const [locale, setLocale] = useState('fr');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.phone) return setError('Indiquez le numéro de téléphone.');
    setSaving(true);
    setError(null);
    try {
      const res = await api<{ structure: StructureProfile; welcomeEmailSent: boolean }>('/api/v1/admin/structures', {
        method: 'POST', body: { ...structureBody(f), locale },
      });
      await onCreated(res.welcomeEmailSent
        ? `${res.structure.name} a été ajoutée et validée. Un e-mail explique au contact comment choisir son mot de passe.`
        : `${res.structure.name} a été ajoutée et validée, mais l’e-mail de bienvenue n’a pas pu partir : prévenez le contact d’utiliser « Mot de passe oublié ? ».`);
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Ajouter une structure" onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBox text={error} />
        <p className="req-note"><span className="req">*</span> champ obligatoire · La structure est validée d’office. Son contact reçoit un e-mail et choisit lui-même le mot de passe avec « Mot de passe oublié ? ».</p>
        <div className="form-grid">
          <StructureFields f={f} onChange={setF} countries={countries} emailHint="Il servira à la structure pour se connecter" />
          <label className="field">Langue des e-mails
            <select value={locale} onChange={(e) => setLocale(e.target.value)}>
              <option value="fr">Français</option>
              <option value="en">Anglais</option>
            </select>
          </label>
        </div>
        <div className="form-actions">
          <button className="btn" type="submit" disabled={saving}>{saving ? 'Enregistrement…' : 'Ajouter'}</button>
          <button className="btn secondary" type="button" onClick={onClose}>Annuler</button>
        </div>
      </form>
    </Modal>
  );
}
