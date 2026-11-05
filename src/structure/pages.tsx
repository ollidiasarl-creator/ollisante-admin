import { FormEvent, useState } from 'react';
import { PlaceInputs } from '../PlaceInputs';
import { api, Appointment, Facility, fee, ORG_TYPES, Specialty, StructureProfile } from '../api';
import { Empty, ErrorBox, Modal, PageHead, dateTime, errorText, PhoneInput, useLoad } from '../ui';
import { StructureDocs } from '../Trust';

interface Member {
  practitionerId: string; firstName: string; lastName: string; email: string | null; phone: string | null;
  specialties: Specialty[]; verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED'; status: 'INVITED' | 'ACTIVE'; since: string;
}
interface RuleRow {
  practitionerId: string; practitionerName: string;
  rule: { id: string; weekday: number; startTime: string; endTime: string; slotMinutes: number; facilityId: string | null };
}
const DAYS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const STATUS: Record<Appointment['status'], [string, string]> = {
  CONFIRMED: ['Confirmé', 'ok'], PENDING_PAYMENT: ['Paiement en attente', 'warn'], COMPLETED: ['Terminé', 'off'],
  CANCELLED: ['Annulé', 'off'], NO_SHOW: ['Absent', 'off'],
};
const hhmm = (t: string) => t.slice(0, 5);

export function useProfile() {
  return useLoad(() => api<StructureProfile>('/api/v1/structure/profile'), []);
}

/** Bandeau tant que la structure n'est pas vérifiée par OLIDIA. */
export function PendingNotice({ profile }: { profile: StructureProfile | null }) {
  if (!profile || profile.verificationStatus === 'VERIFIED') return null;
  return profile.verificationStatus === 'PENDING'
    ? <div className="notice">Votre structure est en cours de vérification par l’équipe OLIDIA. Vous pourrez inviter vos médecins et ouvrir vos horaires dès sa validation.</div>
    : <div className="error">Votre structure n’a pas été validée. Contactez l’équipe OLIDIA.</div>;
}

// ---------- tableau de bord ----------
export function Dashboard() {
  const profile = useProfile();
  const members = useLoad(() => api<Member[]>('/api/v1/structure/members'), []);
  const appts = useLoad(() => api<Appointment[]>('/api/v1/structure/appointments'), []);
  const now = Date.now();
  const upcoming = (appts.data ?? []).filter((a) => new Date(a.startsAt).getTime() > now && (a.status === 'CONFIRMED' || a.status === 'PENDING_PAYMENT'));
  const today = upcoming.filter((a) => new Date(a.startsAt).toDateString() === new Date().toDateString());
  const cards = [
    ['Rendez-vous aujourd’hui', today.length], ['Rendez-vous à venir', upcoming.length],
    ['Médecins actifs', (members.data ?? []).filter((m) => m.status === 'ACTIVE').length],
    ['Invitations en attente', (members.data ?? []).filter((m) => m.status === 'INVITED').length],
  ] as const;
  return (
    <>
      <PageHead title={profile.data?.name ?? 'Tableau de bord'} lead={profile.data ? `${ORG_TYPES[profile.data.type]} · ${profile.data.city ?? ''}` : undefined} />
      <PendingNotice profile={profile.data} />
      <div className="stats">
        {cards.map(([label, value]) => (
          <div key={label} className="card stat"><div className="stat-label">{label}</div><div className="stat-value">{value}</div></div>
        ))}
      </div>
    </>
  );
}

// ---------- médecins ----------
export function Doctors() {
  const profile = useProfile();
  const list = useLoad(() => api<Member[]>('/api/v1/structure/members'), []);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const verified = profile.data?.verificationStatus === 'VERIFIED';

  async function invite(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const m = await api<Member>('/api/v1/structure/members', { method: 'POST', body: { email: email.trim() } });
      setNotice(m.status === 'ACTIVE' ? `${m.firstName} ${m.lastName} fait déjà partie de votre structure.`
        : `Invitation envoyée à ${m.firstName} ${m.lastName}. Il doit l’accepter dans l’application (Compte → Mes structures).`);
      setEmail('');
      await list.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function remove(m: Member) {
    if (!window.confirm(`Retirer ${m.firstName} ${m.lastName} de votre structure ?\nSes horaires dans vos sites seront supprimés.`)) return;
    try {
      await api(`/api/v1/structure/members/${m.practitionerId}`, { method: 'DELETE' });
      await list.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <PageHead title="Médecins" lead="Invitez les professionnels déjà inscrits sur Ollisanté avec l’adresse e-mail de leur compte." />
      <PendingNotice profile={profile.data} />
      <form className="toolbar" onSubmit={invite}>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail du médecin" required disabled={!verified} aria-label="E-mail du médecin" />
        <button className="btn" type="submit" disabled={!verified}>Inviter</button>
      </form>
      {notice ? <div className="notice">{notice}</div> : null}
      <ErrorBox text={list.error ?? error} />
      {list.data && list.data.length === 0 ? <Empty text="Aucun médecin pour l’instant." /> : (
        <table>
          <thead><tr><th>Médecin</th><th>Spécialités</th><th>Contact</th><th>Statut</th><th /></tr></thead>
          <tbody>
            {(list.data ?? []).map((m) => (
              <tr key={m.practitionerId}>
                <td><strong>Dr {m.firstName} {m.lastName}</strong>{m.verificationStatus !== 'VERIFIED' ? <><br /><span className="hint">diplôme en cours de vérification par OLIDIA</span></> : null}</td>
                <td>{m.specialties.map((s) => s.nameFr).join(', ')}</td>
                <td>{m.email ?? ''}{m.phone ? <><br />{m.phone}</> : null}</td>
                <td>{m.status === 'ACTIVE' ? <span className="badge ok">Rattaché</span> : <span className="badge warn">Invitation envoyée</span>}</td>
                <td className="actions"><button className="btn small danger" onClick={() => void remove(m)}>{m.status === 'ACTIVE' ? 'Retirer' : 'Annuler l’invitation'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

// ---------- horaires ----------
export function Schedules() {
  const profile = useProfile();
  const members = useLoad(() => api<Member[]>('/api/v1/structure/members'), []);
  const sites = useLoad(() => api<Facility[]>('/api/v1/structure/sites'), []);
  const rules = useLoad(() => api<RuleRow[]>('/api/v1/structure/availability-rules'), []);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const siteName = (id: string | null) => sites.data?.find((s) => s.id === id)?.name ?? '–';
  const active = (members.data ?? []).filter((m) => m.status === 'ACTIVE');

  async function remove(r: RuleRow) {
    if (!window.confirm(`Supprimer cette plage de ${r.practitionerName} ?`)) return;
    try {
      await api(`/api/v1/structure/availability-rules/${r.rule.id}`, { method: 'DELETE' });
      await rules.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <PageHead title="Horaires" lead="Plages de consultation de vos médecins dans vos sites (heure locale du pays). Les patients réservent sur ces créneaux.">
        <button className="btn" onClick={() => setAdding(true)} disabled={profile.data?.verificationStatus !== 'VERIFIED' || active.length === 0}>Ajouter une plage</button>
      </PageHead>
      <PendingNotice profile={profile.data} />
      {profile.data?.verificationStatus === 'VERIFIED' && active.length === 0 ? <div className="notice">Invitez d’abord vos médecins (page Médecins) : une plage ne peut être créée que pour un médecin rattaché.</div> : null}
      <ErrorBox text={rules.error ?? error} />
      {rules.data && rules.data.length === 0 ? <Empty text="Aucune plage horaire." /> : (
        <table>
          <thead><tr><th>Médecin</th><th>Jour</th><th>Horaires</th><th>Durée</th><th>Site</th><th /></tr></thead>
          <tbody>
            {(rules.data ?? []).map((r) => (
              <tr key={r.rule.id}>
                <td>Dr {r.practitionerName}</td><td>{DAYS[r.rule.weekday]}</td>
                <td>{hhmm(r.rule.startTime)} – {hhmm(r.rule.endTime)}</td><td>{r.rule.slotMinutes} min</td>
                <td>{siteName(r.rule.facilityId)}</td>
                <td className="actions"><button className="btn small danger" onClick={() => void remove(r)}>Supprimer</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {adding ? <RuleForm members={active} sites={sites.data ?? []} onClose={() => setAdding(false)} onSaved={rules.reload} /> : null}
    </>
  );
}

function RuleForm({ members, sites, onClose, onSaved }: { members: Member[]; sites: Facility[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [practitionerId, setPractitionerId] = useState(members[0]?.practitionerId ?? '');
  const [days, setDays] = useState<number[]>([]);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('12:00');
  const [slot, setSlot] = useState(30);
  const [site, setSite] = useState(sites[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const toggle = (d: number) => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (days.length === 0) return setError('Choisissez au moins un jour.');
    if (end <= start) return setError('L’heure de fin doit être après l’heure de début.');
    try {
      for (const weekday of days) {
        await api(`/api/v1/structure/members/${practitionerId}/availability-rules`, {
          method: 'POST', body: { weekday, startTime: start, endTime: end, slotMinutes: slot, mode: 'IN_PERSON', facilityId: site },
        });
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <Modal title="Ajouter une plage horaire" onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBox text={error} />
        <div className="form-grid">
          <label className="field">Médecin
            <select value={practitionerId} onChange={(e) => setPractitionerId(e.target.value)}>
              {members.map((m) => <option key={m.practitionerId} value={m.practitionerId}>Dr {m.firstName} {m.lastName}</option>)}
            </select>
          </label>
          <label className="field">Site
            <select value={site} onChange={(e) => setSite(e.target.value)}>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="field"><span>Début<span className="req">*</span></span><input type="time" value={start} onChange={(e) => setStart(e.target.value)} required /></label>
          <label className="field"><span>Fin<span className="req">*</span></span><input type="time" value={end} onChange={(e) => setEnd(e.target.value)} required /></label>
          <label className="field">Durée d’un créneau
            <select value={slot} onChange={(e) => setSlot(Number(e.target.value))}>
              {[15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          </label>
        </div>
        <p className="field" style={{ marginTop: 12 }}>Jours</p>
        <div className="tabs" style={{ flexWrap: 'wrap' }}>
          {DAYS.slice(1).map((d, i) => (
            <button type="button" key={d} className={`tab${days.includes(i + 1) ? ' on' : ''}`} onClick={() => toggle(i + 1)}>{d}</button>
          ))}
        </div>
        <div className="form-actions">
          <button className="btn" type="submit">Enregistrer</button>
          <button className="btn secondary" type="button" onClick={onClose}>Annuler</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- rendez-vous ----------
export function Appointments() {
  const list = useLoad(() => api<Appointment[]>('/api/v1/structure/appointments'), []);
  const [onlyUpcoming, setOnlyUpcoming] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const now = Date.now();
  const rows = (list.data ?? []).filter((a) => !onlyUpcoming || new Date(a.startsAt).getTime() > now)
    .sort((a, b) => (onlyUpcoming ? a.startsAt.localeCompare(b.startsAt) : b.startsAt.localeCompare(a.startsAt)));

  async function cancel(a: Appointment) {
    if (!window.confirm(`Annuler le rendez-vous de ${a.patientName} avec Dr ${a.practitionerName} ?\nLe patient est remboursé intégralement s’il a payé.`)) return;
    setError(null);
    try {
      await api(`/api/v1/structure/appointments/${a.id}/cancel`, { method: 'POST', body: {} });
      await list.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <PageHead title="Rendez-vous" lead="Rendez-vous pris par les patients avec vos médecins dans vos sites." />
      <div className="toolbar"><label className="hint"><input type="checkbox" checked={onlyUpcoming} onChange={(e) => setOnlyUpcoming(e.target.checked)} /> Seulement les rendez-vous à venir</label></div>
      <ErrorBox text={list.error ?? error} />
      {list.data && rows.length === 0 ? <Empty text="Aucun rendez-vous." /> : (
        <table>
          <thead><tr><th>Date</th><th>Patient</th><th>Médecin</th><th>Site</th><th>Tarif</th><th>Statut</th><th /></tr></thead>
          <tbody>
            {rows.map((a) => {
              const [label, kind] = STATUS[a.status];
              const future = new Date(a.startsAt).getTime() > now;
              return (
                <tr key={a.id}>
                  <td>{dateTime(a.startsAt)}</td><td>{a.patientName}</td><td>Dr {a.practitionerName}</td><td>{a.facilityName ?? '–'}</td>
                  <td className="num">{a.priceMinor != null && a.priceCurrency ? `${fee.toMajor(a.priceMinor, a.priceCurrency).toLocaleString('fr-FR')} ${a.priceCurrency}${a.paymentMode === 'ON_SITE' ? ' (sur place)' : ''}` : '–'}</td>
                  <td><span className={`badge ${kind}`}>{label}</span></td>
                  <td className="actions">{future && (a.status === 'CONFIRMED' || a.status === 'PENDING_PAYMENT') ? <button className="btn small danger" onClick={() => void cancel(a)}>Annuler</button> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

// ---------- sites ----------
export function Sites() {
  const profile = useProfile();
  const list = useLoad(() => api<Facility[]>('/api/v1/structure/sites'), []);
  const [adding, setAdding] = useState(false);
  return (
    <>
      <PageHead title="Sites" lead="Adresses où vos médecins reçoivent les patients.">
        <button className="btn" onClick={() => setAdding(true)}>Ajouter un site</button>
      </PageHead>
      <ErrorBox text={list.error} />
      <table>
        <thead><tr><th>Nom</th><th>Ville</th><th>Adresse</th><th>Téléphone</th></tr></thead>
        <tbody>
          {(list.data ?? []).map((s) => <tr key={s.id}><td><strong>{s.name}</strong></td><td>{[s.locality, s.city].filter(Boolean).join(', ') || '–'}</td><td>{s.address ?? '–'}</td><td>{s.phone ?? '–'}</td></tr>)}
        </tbody>
      </table>
      {adding && profile.data ? <SiteForm countryCode={profile.data.countryCode} onClose={() => setAdding(false)} onSaved={list.reload} /> : null}
    </>
  );
}

function SiteForm({ countryCode, onClose, onSaved }: { countryCode: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [f, setF] = useState({ name: '', city: '', locality: '', address: '', phone: '' });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      // Un site est toujours dans le pays de la structure.
      await api('/api/v1/structure/sites', { method: 'POST', body: { name: f.name.trim(), countryCode, city: f.city || null, locality: f.locality || null, address: f.address || null, phone: f.phone || null } });
      await onSaved();
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
  }
  return (
    <Modal title="Ajouter un site" onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBox text={error} />
        <div className="form-grid">
          <label className="field"><span>Nom du site<span className="req">*</span></span><input value={f.name} onChange={set('name')} required /></label>
          <PlaceInputs country={countryCode} city={f.city} locality={f.locality} onChange={(city, locality) => setF({ ...f, city, locality })} />
          <label className="field">Adresse<input value={f.address} onChange={set('address')} /></label>
          <label className="field">Téléphone<PhoneInput value={f.phone} onChange={(phone) => setF({ ...f, phone })} country={countryCode} /></label>
        </div>
        <div className="form-actions">
          <button className="btn" type="submit">Ajouter</button>
          <button className="btn secondary" type="button" onClick={onClose}>Annuler</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- profil ----------
export function Profile() {
  const p = useProfile();
  const [editing, setEditing] = useState(false);
  const d = p.data;
  return (
    <>
      <PageHead title="Profil de la structure">{d ? <button className="btn secondary" onClick={() => setEditing(true)}>Modifier</button> : null}</PageHead>
      <PendingNotice profile={d} />
      <ErrorBox text={p.error} />
      {d ? (
        <table>
          <tbody>
            {([
              ['Nom', d.name], ['Type', ORG_TYPES[d.type]], ['Pays', d.countryCode], ['Ville', d.city], ['Localité', d.locality], ['Adresse', d.address],
              ['E-mail principal', d.email], ['Téléphone', d.phone], ['Nom de domaine', d.domain], ['Immatriculation', d.registrationNumber],
              ['Personne contact', `${d.contactName}${d.contactRole ? ` (${d.contactRole})` : ''}`], ['Nombre de lits', d.beds],
              ['Statut', d.verificationStatus === 'VERIFIED' ? 'Vérifiée par OLIDIA' : d.verificationStatus === 'PENDING' ? 'En cours de vérification' : 'Refusée'],
            ] as [string, string | number | null][]).map(([k, v]) => <tr key={k}><th style={{ width: 220 }}>{k}</th><td>{v ?? '–'}</td></tr>)}
          </tbody>
        </table>
      ) : null}
      {d ? <StructureDocs /> : null}
      {editing && d ? <ProfileForm profile={d} onClose={() => setEditing(false)} onSaved={p.reload} /> : null}
    </>
  );
}

function ProfileForm({ profile, onClose, onSaved }: { profile: StructureProfile; onClose: () => void; onSaved: () => Promise<void> }) {
  const [f, setF] = useState({
    city: profile.city ?? '', locality: profile.locality ?? '', address: profile.address ?? '', phone: profile.phone, domain: profile.domain ?? '',
    contactName: profile.contactName, contactRole: profile.contactRole ?? '', beds: profile.beds != null ? String(profile.beds) : '',
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/api/v1/structure/profile', { method: 'PATCH', body: { ...f, beds: f.beds === '' ? null : Number(f.beds) } });
      await onSaved();
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
  }
  return (
    <Modal title="Modifier le profil" onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBox text={error} />
        <p className="hint">Le nom, le type, le pays et l’immatriculation ne se modifient qu’auprès de l’équipe OLIDIA.</p>
        <div className="form-grid">
          <PlaceInputs country={profile.countryCode} city={f.city} locality={f.locality} onChange={(city, locality) => setF({ ...f, city, locality })} />
          <label className="field">Adresse<input value={f.address} onChange={set('address')} /></label>
          <label className="field"><span>Téléphone<span className="req">*</span></span><PhoneInput value={f.phone} onChange={(phone) => setF({ ...f, phone })} country={profile.countryCode} required /></label>
          <label className="field">Nom de domaine<input value={f.domain} onChange={set('domain')} placeholder="hopital.sn" /></label>
          <label className="field"><span>Personne contact<span className="req">*</span></span><input value={f.contactName} onChange={set('contactName')} required /></label>
          <label className="field">Fonction<input value={f.contactRole} onChange={set('contactRole')} /></label>
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
