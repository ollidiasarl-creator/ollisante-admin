import { Country, ORG_TYPES, OrgType } from './api';
import { PhoneInput } from './ui';

/** Champs d'une fiche structure, communs à l'inscription publique et à l'ajout par l'administration. */
export interface StructureFieldValues {
  type: OrgType; name: string; countryCode: string; city: string; locality: string; address: string; email: string; phone: string;
  domain: string; registrationNumber: string; contactName: string; contactRole: string; beds: string;
}

export const EMPTY_STRUCTURE: StructureFieldValues = {
  type: 'HOSPITAL', name: '', countryCode: '', city: '', locality: '', address: '', email: '', phone: '', domain: '',
  registrationNumber: '', contactName: '', contactRole: '', beds: '',
};

/** Corps de requête commun (sans mot de passe). */
export const structureBody = (f: StructureFieldValues) => ({
  type: f.type, name: f.name.trim(), countryCode: f.countryCode, city: f.city.trim() || null, locality: f.locality.trim() || null,
  address: f.address.trim() || null, email: f.email.trim().toLowerCase(), phone: f.phone, domain: f.domain.trim() || null,
  registrationNumber: f.registrationNumber.trim(), contactName: f.contactName.trim(),
  contactRole: f.contactRole.trim() || null, beds: f.beds === '' ? null : Number(f.beds),
});

export function StructureFields({ f, onChange, countries, emailHint }: {
  f: StructureFieldValues; onChange: (f: StructureFieldValues) => void; countries: Country[]; emailHint: string;
}) {
  const set = (k: keyof StructureFieldValues) => (e: { target: { value: string } }) => onChange({ ...f, [k]: e.target.value });
  return (
    <>
      <label className="field">Type de structure
        <select value={f.type} onChange={set('type')}>{Object.entries(ORG_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </label>
      <label className="field"><span>Nom de la structure<span className="req">*</span></span><input value={f.name} onChange={set('name')} maxLength={200} required /></label>
      <label className="field"><span>Pays<span className="req">*</span></span>
        <select value={f.countryCode} onChange={set('countryCode')} required>
          <option value="">Choisir…</option>
          {countries.map((c) => <option key={c.code} value={c.code}>{c.nameFr}</option>)}
        </select>
      </label>
      <label className="field">Ville<input value={f.city} onChange={set('city')} /></label>
      <label className="field">Localité<span className="hint">Quartier ou commune</span><input value={f.locality} onChange={set('locality')} maxLength={100} /></label>
      <label className="field">Adresse<input value={f.address} onChange={set('address')} /></label>
      <label className="field"><span>Numéro d’immatriculation<span className="req">*</span></span><span className="hint">RCCM, NINEA, NIF, SIRET…</span><input value={f.registrationNumber} onChange={set('registrationNumber')} required /></label>
      <label className="field"><span>E-mail principal<span className="req">*</span></span><span className="hint">{emailHint}</span><input type="email" value={f.email} onChange={set('email')} required /></label>
      <label className="field"><span>Téléphone<span className="req">*</span></span><PhoneInput value={f.phone} onChange={(phone) => onChange({ ...f, phone })} country={f.countryCode} required /></label>
      <label className="field">Nom de domaine (facultatif)<input value={f.domain} onChange={set('domain')} placeholder="hopital.sn" /></label>
      <label className="field"><span>Personne contact<span className="req">*</span></span><input value={f.contactName} onChange={set('contactName')} placeholder="Prénom Nom" required /></label>
      <label className="field">Fonction (facultatif)<input value={f.contactRole} onChange={set('contactRole')} placeholder="Directeur, responsable administratif…" /></label>
      <label className="field">Nombre de lits (facultatif)<input value={f.beds} onChange={set('beds')} inputMode="numeric" /></label>
    </>
  );
}
