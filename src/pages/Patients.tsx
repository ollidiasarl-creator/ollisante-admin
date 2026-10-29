import { FormEvent, useState } from 'react';
import { api, Country, fee, Page, PatientRow, UserStatus } from '../api';
import { Empty, ErrorBox, Modal, PageHead, PhoneInput, date, dateTime, errorText, useLoad } from '../ui';

export function StatusBadge({ status }: { status: UserStatus }) {
  return status === 'ACTIVE' ? <span className="badge ok">Actif</span> : <span className="badge warn">Suspendu</span>;
}

export async function setStatus(userId: string, status: UserStatus, label: string): Promise<boolean> {
  const verb = status === 'SUSPENDED' ? 'Suspendre' : 'Réactiver';
  if (!window.confirm(`${verb} le compte de ${label} ?`)) return false;
  await api(`/api/v1/admin/users/${userId}/status`, { method: 'PATCH', body: { status } });
  return true;
}

export default function Patients() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const countries = useLoad(() => api<Country[]>('/api/v1/admin/countries'), []);
  const list = useLoad(
    () => api<Page<PatientRow>>(`/api/v1/admin/patients?page=${page}&size=50${search ? `&q=${encodeURIComponent(search)}` : ''}`),
    [page, search],
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [open, setOpen] = useState<PatientRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const country = (code: string | null) => (code ? countries.data?.find((c) => c.code === code)?.nameFr ?? code : '–');

  async function toggle(p: PatientRow) {
    setActionError(null);
    try {
      if (await setStatus(p.id, p.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE', `${p.firstName} ${p.lastName}`)) await list.reload();
    } catch (e) {
      setActionError(errorText(e));
    }
  }

  return (
    <>
      <PageHead title="Patients" lead="Cliquez sur un patient pour voir ses consultations ou modifier sa fiche. Les motifs de consultation (données médicales) ne sont pas visibles ici.">
        <button className="btn" onClick={() => setAdding(true)}>Ajouter un patient</button>
      </PageHead>
      {notice ? <p className="notice">{notice}</p> : null}
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setPage(0); setSearch(q.trim()); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, e-mail ou téléphone" aria-label="Rechercher" />
        <button className="btn secondary" type="submit">Rechercher</button>
        <div className="spacer" />
        <span className="hint">{list.data ? `${list.data.totalElements} patient(s)` : ''}</span>
      </form>
      <ErrorBox text={list.error ?? actionError} />
      {list.data && list.data.content.length === 0 ? <Empty text="Aucun patient." /> : (
        <table>
          <thead><tr><th>Nom</th><th>Contact</th><th>Pays</th><th>Inscrit le</th><th>Statut</th><th /></tr></thead>
          <tbody>
            {(list.data?.content ?? []).map((p) => (
              <tr key={p.id} className="clickable" onClick={() => setOpen(p)}>
                <td><strong>{p.firstName} {p.lastName}</strong></td>
                <td>{p.email ?? ''}{p.email && p.phone ? <br /> : null}{p.phone ?? ''}</td>
                <td>{country(p.countryCode)}</td>
                <td>{date(p.createdAt)}</td>
                <td><StatusBadge status={p.status} /></td>
                <td className="actions" onClick={(e) => e.stopPropagation()}>
                  <button className="btn small secondary" onClick={() => setOpen(p)}>Consultations</button>
                  <button className={`btn small ${p.status === 'ACTIVE' ? 'danger' : ''}`} onClick={() => void toggle(p)}>
                    {p.status === 'ACTIVE' ? 'Suspendre' : 'Réactiver'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {list.data && list.data.totalPages > 1 ? (
        <div className="form-actions">
          <button className="btn secondary small" disabled={page === 0} onClick={() => setPage(page - 1)}>← Précédents</button>
          <span className="hint">Page {page + 1} / {list.data.totalPages}</span>
          <button className="btn secondary small" disabled={page + 1 >= list.data.totalPages} onClick={() => setPage(page + 1)}>Suivants →</button>
        </div>
      ) : null}
      {open ? (
        <PatientFile patient={open} countries={countries.data ?? []} onClose={() => setOpen(null)}
          onSaved={async () => { await list.reload(); }} />
      ) : null}
      {adding ? (
        <PatientForm countries={countries.data ?? []} onClose={() => setAdding(false)}
          onSaved={async (text) => { setNotice(text); await list.reload(); }} />
      ) : null}
    </>
  );
}

interface PatientAppointment {
  id: string; startsAt: string; status: 'PENDING_PAYMENT' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
  mode: 'IN_PERSON' | 'VIDEO'; practitionerName: string; specialties: string[]; facilityName: string | null;
  organizationName: string | null; paymentMode: 'ONLINE' | 'ON_SITE' | 'FREE'; priceMinor: number | null;
  priceCurrency: string | null; paymentStatus: string | null; operator: string | null; refundedMinor: number;
}

const STATUS: Record<PatientAppointment['status'], string> = {
  PENDING_PAYMENT: 'En attente de paiement', CONFIRMED: 'Confirmé', COMPLETED: 'Terminé',
  CANCELLED: 'Annulé', NO_SHOW: 'Absent',
};
const PAYMENT: Record<PatientAppointment['paymentMode'], string> = {
  ONLINE: 'Mobile Money', ON_SITE: 'Sur place', FREE: 'Gratuit',
};
const PAY_STATUS: Record<string, string> = {
  PENDING: 'en cours', SUCCEEDED: 'payé', FAILED: 'échoué', REFUNDED: 'remboursé', PARTIALLY_REFUNDED: 'remboursé en partie',
};
const money = (minor: number, currency: string) =>
  `${fee.toMajor(minor, currency).toLocaleString('fr-FR')} ${currency}`;

/** Fiche patient : consultations (passées et à venir) et modification des coordonnées. */
function PatientFile({ patient, countries, onClose, onSaved }: {
  patient: PatientRow; countries: Country[]; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [tab, setTab] = useState<'consultations' | 'fiche'>('consultations');
  const list = useLoad(() => api<PatientAppointment[]>(`/api/v1/admin/patients/${patient.id}/appointments`), [patient.id]);
  const rows = list.data ?? [];
  return (
    <Modal title={`${patient.firstName} ${patient.lastName}`} onClose={onClose}>
      <p className="hint">{[patient.email, patient.phone].filter(Boolean).join(' · ')} · inscrit le {date(patient.createdAt)}</p>
      <div className="tabs">
        <button className={`tab${tab === 'consultations' ? ' on' : ''}`} onClick={() => setTab('consultations')}>
          Consultations{list.data ? ` (${rows.length})` : ''}
        </button>
        <button className={`tab${tab === 'fiche' ? ' on' : ''}`} onClick={() => setTab('fiche')}>Modifier la fiche</button>
      </div>
      {tab === 'consultations' ? (
        <>
          <ErrorBox text={list.error} />
          {list.data && rows.length === 0 ? <Empty text="Aucune consultation pour le moment." /> : (
            <table>
              <thead><tr><th>Jour et heure</th><th>Médecin</th><th>Lieu</th><th>Paiement</th><th>Statut</th></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td>{dateTime(a.startsAt)}</td>
                    <td><strong>Dr {a.practitionerName}</strong><br /><span className="hint">{a.specialties.join(', ')}</span></td>
                    <td>{a.facilityName ?? (a.mode === 'VIDEO' ? 'Vidéo' : '–')}{a.organizationName ? <><br /><span className="hint">{a.organizationName}</span></> : null}</td>
                    <td>
                      {PAYMENT[a.paymentMode]}
                      {a.priceMinor != null && a.priceCurrency ? <><br /><span className="hint">{money(a.priceMinor, a.priceCurrency)}{a.operator ? ` · ${a.operator}` : ''}{a.paymentStatus ? ` · ${PAY_STATUS[a.paymentStatus] ?? a.paymentStatus}` : ''}</span></> : null}
                      {a.refundedMinor > 0 && a.priceCurrency ? <><br /><span className="hint">Remboursé : {money(a.refundedMinor, a.priceCurrency)}</span></> : null}
                    </td>
                    <td>{STATUS[a.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : (
        <PatientForm patient={patient} countries={countries} onClose={onClose} onSaved={async () => { await onSaved(); }} />
      )}
    </Modal>
  );
}

/** Ajout (patient absent) ou modification d'un patient. */
function PatientForm({ patient, countries, onClose, onSaved }: {
  patient?: PatientRow; countries: Country[]; onClose: () => void; onSaved: (notice: string) => Promise<void>;
}) {
  const [f, setF] = useState({
    firstName: patient?.firstName ?? '', lastName: patient?.lastName ?? '', email: patient?.email ?? '',
    phone: patient?.phone ?? '', countryCode: patient?.countryCode ?? '', locale: 'fr',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.phone) return setError('Indiquez le numéro de téléphone.');
    setSaving(true);
    setError(null);
    const body = {
      firstName: f.firstName.trim(), lastName: f.lastName.trim(), email: f.email.trim().toLowerCase(),
      phone: f.phone, countryCode: f.countryCode || null,
    };
    try {
      if (patient) {
        await api(`/api/v1/admin/patients/${patient.id}`, { method: 'PATCH', body });
        await onSaved('Fiche patient enregistrée.');
      } else {
        const res = await api<{ welcomeEmailSent: boolean }>('/api/v1/admin/patients', { method: 'POST', body: { ...body, locale: f.locale } });
        const name = `${body.firstName} ${body.lastName}`;
        await onSaved(res.welcomeEmailSent
          ? `${name} a été ajouté. Un e-mail lui explique comment choisir son mot de passe.`
          : `${name} a été ajouté, mais l’e-mail de bienvenue n’a pas pu partir : prévenez-le d’utiliser « Mot de passe oublié ? » ou la connexion par SMS.`);
      }
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const form = (
    <form onSubmit={submit}>
      <ErrorBox text={error} />
      <p className="req-note"><span className="req">*</span> champ obligatoire{patient ? '' : ' · Le patient choisit lui-même son mot de passe (« Mot de passe oublié ? ») ou se connecte par SMS.'}</p>
      <div className="form-grid">
        <label className="field"><span>Prénom<span className="req">*</span></span><input value={f.firstName} onChange={set('firstName')} required /></label>
        <label className="field"><span>Nom<span className="req">*</span></span><input value={f.lastName} onChange={set('lastName')} required /></label>
        <label className="field"><span>Adresse e-mail<span className="req">*</span></span><input type="email" value={f.email} onChange={set('email')} required /></label>
        <label className="field">Pays
          <select value={f.countryCode} onChange={set('countryCode')}>
            <option value="">Non renseigné</option>
            {countries.map((c) => <option key={c.code} value={c.code}>{c.nameFr}</option>)}
          </select>
        </label>
        <label className="field"><span>Téléphone<span className="req">*</span></span><PhoneInput value={f.phone} onChange={(phone) => setF({ ...f, phone })} country={f.countryCode} required /></label>
        {patient ? null : (
          <label className="field">Langue des e-mails
            <select value={f.locale} onChange={set('locale')}><option value="fr">Français</option><option value="en">Anglais</option></select>
          </label>
        )}
      </div>
      <div className="form-actions">
        <button className="btn" type="submit" disabled={saving}>{saving ? 'Enregistrement…' : patient ? 'Enregistrer' : 'Ajouter'}</button>
        <button className="btn secondary" type="button" onClick={onClose}>Annuler</button>
      </div>
    </form>
  );
  return patient ? form : <Modal title="Ajouter un patient" onClose={onClose}>{form}</Modal>;
}
