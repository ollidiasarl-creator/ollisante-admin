import { FormEvent, useState } from 'react';
import { api, Country, Page, PractitionerRow, Specialty, Verification } from '../api';
import { Empty, ErrorBox, Modal, PageHead, PhoneInput, errorText, useLoad } from '../ui';
import { StatusBadge, setStatus } from './Patients';
import { ReviewModal, alertsBeforeValidation } from '../Trust';

const TABS: { key: Verification; label: string }[] = [
  { key: 'PENDING', label: 'À valider' },
  { key: 'VERIFIED', label: 'Validés' },
  { key: 'REJECTED', label: 'Refusés' },
];

export default function Practitioners() {
  const [tab, setTab] = useState<Verification>('PENDING');
  const countries = useLoad(() => api<Country[]>('/api/v1/admin/countries'), []);
  const list = useLoad(() => api<Page<PractitionerRow>>(`/api/v1/admin/practitioners?status=${tab}&size=100`), [tab]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<PractitionerRow | null>(null);
  const country = (code: string) => countries.data?.find((c) => c.code === code)?.nameFr ?? code;

  async function decide(p: PractitionerRow, status: Verification) {
    const verb = status === 'VERIFIED' ? 'Valider' : 'Refuser';
    const effect = status === 'VERIFIED' ? 'Son profil et ses créneaux deviendront visibles des patients.' : 'Son profil ne sera plus visible des patients.';
    const warn = status === 'VERIFIED' ? await alertsBeforeValidation('practitioner', p.id) : '';
    if (!window.confirm(`${verb} ${p.firstName} ${p.lastName} ?\n${effect}${warn}`)) return;
    setActionError(null);
    try {
      await api(`/api/v1/admin/practitioners/${p.id}/verification`, { method: 'PATCH', body: { status } });
      await list.reload();
    } catch (e) {
      setActionError(errorText(e));
    }
  }

  async function toggle(p: PractitionerRow) {
    setActionError(null);
    try {
      if (await setStatus(p.userId, p.userStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE', `${p.firstName} ${p.lastName}`)) {
        await list.reload();
      }
    } catch (e) {
      setActionError(errorText(e));
    }
  }

  return (
    <>
      <PageHead title="Professionnels de santé"
        lead="Avant de valider : ouvrez « Pièces » (carte de l’Ordre, pièce d’identité, alertes) et vérifiez le numéro d’ordre auprès de l’Ordre des médecins du pays.">
        <button className="btn" onClick={() => setAdding(true)}>Ajouter un professionnel</button>
      </PageHead>
      {notice ? <p className="notice">{notice}</p> : null}
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`tab${tab === t.key ? ' on' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      <ErrorBox text={list.error ?? actionError} />
      {list.data && list.data.content.length === 0 ? <Empty text="Aucun professionnel dans cette liste." /> : (
        <table>
          <thead><tr><th>Nom</th><th>Spécialités</th><th>N° d’ordre</th><th>Pays</th><th>Contact</th><th>Compte</th><th /></tr></thead>
          <tbody>
            {(list.data?.content ?? []).map((p) => (
              <tr key={p.id}>
                <td><strong>{p.firstName} {p.lastName}</strong></td>
                <td>{p.specialties.map((s) => s.nameFr).join(', ')}</td>
                <td>{p.licenseNumber}</td>
                <td>{country(p.countryCode)}</td>
                <td>{p.email ?? ''}{p.email && p.phone ? <br /> : null}{p.phone ?? ''}</td>
                <td><StatusBadge status={p.userStatus} /></td>
                <td className="actions">
                  <button className="btn small secondary" onClick={() => setReviewing(p)}>Pièces</button>
                  {p.verificationStatus !== 'VERIFIED' ? <button className="btn small" onClick={() => void decide(p, 'VERIFIED')}>Valider</button> : null}
                  {p.verificationStatus !== 'REJECTED' ? <button className="btn small danger" onClick={() => void decide(p, 'REJECTED')}>Refuser</button> : null}
                  <button className="btn small secondary" onClick={() => void toggle(p)}>
                    {p.userStatus === 'ACTIVE' ? 'Suspendre' : 'Réactiver'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {reviewing ? (
        <ReviewModal type="practitioner" id={reviewing.id} name={`Dr ${reviewing.firstName} ${reviewing.lastName}`} onClose={() => setReviewing(null)} />
      ) : null}
      {adding ? (
        <PractitionerForm
          countries={countries.data ?? []}
          onClose={() => setAdding(false)}
          onCreated={async (text) => {
            setNotice(text);
            if (tab === 'VERIFIED') await list.reload();
            else setTab('VERIFIED');
          }}
        />
      ) : null}
    </>
  );
}

/** Ajout manuel : le professionnel est validé d'office et reçoit un e-mail pour choisir son mot de passe. */
function PractitionerForm({ countries, onClose, onCreated }: {
  countries: Country[]; onClose: () => void; onCreated: (notice: string) => Promise<void>;
}) {
  const specialties = useLoad(() => api<Specialty[]>('/api/v1/specialties'), []);
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', phone: '', countryCode: '', licenseNumber: '', locale: 'fr' });
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const toggle = (code: string) => setCodes(codes.includes(code) ? codes.filter((c) => c !== code) : [...codes, code]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.phone) return setError('Indiquez le numéro de téléphone.');
    if (codes.length === 0) return setError('Choisissez au moins une spécialité.');
    setSaving(true);
    setError(null);
    try {
      const res = await api<{ practitioner: PractitionerRow; welcomeEmailSent: boolean }>('/api/v1/admin/practitioners', {
        method: 'POST',
        body: {
          firstName: f.firstName.trim(), lastName: f.lastName.trim(), email: f.email.trim().toLowerCase(),
          phone: f.phone, countryCode: f.countryCode, licenseNumber: f.licenseNumber.trim(),
          specialtyCodes: codes, locale: f.locale,
        },
      });
      const name = `${res.practitioner.firstName} ${res.practitioner.lastName}`;
      await onCreated(res.welcomeEmailSent
        ? `${name} a été ajouté et validé. Un e-mail lui explique comment choisir son mot de passe.`
        : `${name} a été ajouté et validé, mais l’e-mail de bienvenue n’a pas pu partir : prévenez-le d’utiliser « Mot de passe oublié ? » dans l’application.`);
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Ajouter un professionnel" onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBox text={error} />
        <p className="req-note"><span className="req">*</span> champ obligatoire · Le professionnel est validé d’office. Il reçoit un e-mail et choisit lui-même son mot de passe avec « Mot de passe oublié ? ».</p>
        <div className="form-grid">
          <label className="field"><span>Prénom<span className="req">*</span></span><input value={f.firstName} onChange={set('firstName')} required /></label>
          <label className="field"><span>Nom<span className="req">*</span></span><input value={f.lastName} onChange={set('lastName')} required /></label>
          <label className="field"><span>Adresse e-mail<span className="req">*</span></span><input type="email" value={f.email} onChange={set('email')} required /></label>
          <label className="field"><span>Téléphone<span className="req">*</span></span>
            <PhoneInput value={f.phone} onChange={(phone) => setF({ ...f, phone })} country={f.countryCode} required />
          </label>
          <label className="field"><span>Pays d’exercice<span className="req">*</span></span>
            <select value={f.countryCode} onChange={set('countryCode')} required>
              <option value="">Choisir…</option>
              {countries.map((c) => <option key={c.code} value={c.code}>{c.nameFr}</option>)}
            </select>
          </label>
          <label className="field"><span>N° d’ordre<span className="req">*</span></span><input value={f.licenseNumber} onChange={set('licenseNumber')} required /></label>
          <label className="field">Langue des e-mails
            <select value={f.locale} onChange={set('locale')}>
              <option value="fr">Français</option>
              <option value="en">Anglais</option>
            </select>
          </label>
        </div>
        <label className="field"><span>Spécialités<span className="req">*</span></span>
          <span className="hint">Vous pouvez en ajouter plusieurs.</span>
          <select value="" onChange={(e) => e.target.value && toggle(e.target.value)}>
            <option value="">{codes.length ? 'Ajouter une autre spécialité' : 'Choisir une spécialité'}</option>
            {(specialties.data ?? []).filter((s) => !codes.includes(s.code)).sort((a, b) => a.nameFr.localeCompare(b.nameFr, 'fr'))
              .map((s) => <option key={s.code} value={s.code}>{s.nameFr}</option>)}
          </select>
        </label>
        {codes.length ? (
          <div className="tags">
            {codes.map((c) => {
              const label = specialties.data?.find((s) => s.code === c)?.nameFr ?? c;
              return (
                <span key={c} className="tag">
                  {label}
                  <button type="button" aria-label={`Retirer ${label}`} onClick={() => toggle(c)}>×</button>
                </span>
              );
            })}
          </div>
        ) : null}
        <div className="form-actions">
          <button className="btn" type="submit" disabled={saving}>{saving ? 'Enregistrement…' : 'Ajouter'}</button>
          <button className="btn secondary" type="button" onClick={onClose}>Annuler</button>
        </div>
      </form>
    </Modal>
  );
}
