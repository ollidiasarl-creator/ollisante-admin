import { FormEvent, useState } from 'react';
import { api, Country, registerStructure } from '../api';
import logo from '../logo.png';
import { EMPTY_STRUCTURE, StructureFields, structureBody } from '../StructureFields';
import { ErrorBox, errorText, useLoad } from '../ui';

/** Inscription d'une structure : la fiche est ensuite vérifiée par OLIDIA avant d'être visible des patients. */
export default function Register({ onDone, onLogin }: { onDone: () => void; onLogin: () => void }) {
  const countries = useLoad(() => api<Country[]>('/api/v1/countries'), []);
  const [f, setF] = useState(EMPTY_STRUCTURE);
  const [pw, setPw] = useState({ password: '', confirm: '' });
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pw.password.length < 8) return setError('Le mot de passe doit contenir au moins 8 caractères.');
    if (pw.password !== pw.confirm) return setError('Les deux mots de passe ne sont pas identiques.');
    if (!accepted) return setError('Vous devez accepter les conditions pour continuer.');
    if (!f.phone) return setError('Indiquez le numéro de téléphone.');
    setBusy(true);
    setError(null);
    try {
      await registerStructure({ ...structureBody(f), password: pw.password, locale: 'fr' });
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="card" onSubmit={submit} style={{ width: 'min(720px, 100%)' }}>
        <img src={logo} alt="Ollisanté" />
        <h1 style={{ textAlign: 'center', fontSize: 22 }}>Inscrire ma structure</h1>
        <p className="lead" style={{ textAlign: 'center', margin: 0 }}>Hôpital, clinique, cabinet médical, centre de santé, association ou ONG. Après inscription, notre équipe vérifiera les informations de votre structure (immatriculation et coordonnées) avant de la rendre visible des patients.</p>
        <ErrorBox text={error} />
        <div className="form-grid">
          <StructureFields f={f} onChange={setF} countries={countries.data ?? []} emailHint="Il servira à vous connecter" />
          <label className="field"><span>Mot de passe<span className="req">*</span></span><span className="hint">8 caractères minimum</span><input type="password" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} autoComplete="new-password" required /></label>
          <label className="field"><span>Confirmer le mot de passe<span className="req">*</span></span><input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" required /></label>
        </div>
        <label className="hint" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          J’atteste représenter cette structure et j’accepte les conditions d’utilisation et la politique de confidentialité d’Ollisanté.
        </label>
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Envoi…' : 'Créer le compte de ma structure'}</button>
        <button className="link-btn" type="button" onClick={onLogin}>J’ai déjà un compte : me connecter</button>
      </form>
    </div>
  );
}
