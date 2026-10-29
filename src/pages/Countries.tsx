import { FormEvent, useState } from 'react';
import { api, Country, fee } from '../api';
import { ErrorBox, Modal, PageHead, errorText, useLoad } from '../ui';

const EMPTY = { code: '', nameFr: '', nameEn: '', currency: '', dialCode: '', timezone: 'Africa/', fee: '' };

export default function Countries() {
  const { data, error, reload } = useLoad(() => api<Country[]>('/api/v1/admin/countries'), []);
  const [edit, setEdit] = useState<Country | null>(null);
  const [adding, setAdding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function toggle(c: Country) {
    setActionError(null);
    try {
      await api(`/api/v1/admin/countries/${c.code}`, { method: 'PATCH', body: { active: !c.active } });
      await reload();
    } catch (e) {
      setActionError(errorText(e));
    }
  }

  return (
    <>
      <PageHead title="Pays" lead="Les pays désactivés n’apparaissent plus dans l’application, mais leurs données sont conservées.">
        <button className="btn" onClick={() => setAdding(true)}>Ajouter un pays</button>
      </PageHead>
      <ErrorBox text={error ?? actionError} />
      <table>
        <thead>
          <tr><th>Pays</th><th>Code</th><th>Indicatif</th><th>Urgence</th><th>Devise</th><th>Tarif de consultation</th><th>Paiement</th><th>Statut</th><th /></tr>
        </thead>
        <tbody>
          {(data ?? []).map((c) => (
            <tr key={c.code}>
              <td><strong>{c.nameFr}</strong><br /><span className="hint">{c.nameEn} · {c.timezone}</span></td>
              <td>{c.code}</td>
              <td>{c.dialCode}</td>
              <td>{c.emergencyNumber ?? <span className="hint">à renseigner</span>}</td>
              <td>{c.currency}</td>
              <td className="num">{c.defaultFeeMinor != null ? `${fee.toMajor(c.defaultFeeMinor, c.currency).toLocaleString('fr-FR')} ${c.currency}` : '–'}</td>
              <td>
                {c.defaultFeeMinor == null ? <span className="hint">Gratuit</span> : (
                  <>
                    {c.onlinePayment ? <span className="badge ok">Mobile Money</span> : null}{' '}
                    {c.onSitePayment ? <span className="badge ok">Sur place</span> : null}
                    {!c.onlinePayment && !c.onSitePayment ? <span className="badge off">Aucun : réservation fermée</span> : null}
                  </>
                )}
              </td>
              <td>{c.active ? <span className="badge ok">Actif</span> : <span className="badge off">Désactivé</span>}</td>
              <td className="actions">
                <button className="btn small secondary" onClick={() => setEdit(c)}>Modifier</button>
                <button className={`btn small ${c.active ? 'danger' : ''}`} onClick={() => void toggle(c)}>
                  {c.active ? 'Désactiver' : 'Activer'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {edit ? <EditCountry country={edit} onClose={() => setEdit(null)} onSaved={reload} /> : null}
      {adding ? <AddCountry onClose={() => setAdding(false)} onSaved={reload} /> : null}
    </>
  );
}

function EditCountry({ country, onClose, onSaved }: { country: Country; onClose: () => void; onSaved: () => Promise<void> }) {
  const [nameFr, setNameFr] = useState(country.nameFr);
  const [nameEn, setNameEn] = useState(country.nameEn);
  const [timezone, setTimezone] = useState(country.timezone);
  const [online, setOnline] = useState(country.onlinePayment);
  const [onSite, setOnSite] = useState(country.onSitePayment);
  const [emergency, setEmergency] = useState(country.emergencyNumber ?? '');
  const [amount, setAmount] = useState(country.defaultFeeMinor != null ? String(fee.toMajor(country.defaultFeeMinor, country.currency)) : '');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = amount.trim() === '' ? null : Number(amount.replace(',', '.'));
    if (value !== null && (!Number.isFinite(value) || value < 0)) return setError('Montant invalide.');
    try {
      await api(`/api/v1/admin/countries/${country.code}`, {
        method: 'PATCH',
        body: {
          nameFr, nameEn, timezone,
          defaultFeeMinor: value === null ? undefined : fee.toMinor(value, country.currency),
          clearDefaultFee: value === null,
          onlinePayment: online,
          onSitePayment: onSite,
          emergencyNumber: emergency.trim(),
        },
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <Modal title={`Modifier : ${country.nameFr}`} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBox text={error} />
        <div className="form-grid">
          <label className="field"><span>Nom (français)<span className="req">*</span></span><input value={nameFr} onChange={(e) => setNameFr(e.target.value)} required /></label>
          <label className="field"><span>Nom (anglais)<span className="req">*</span></span><input value={nameEn} onChange={(e) => setNameEn(e.target.value)} required /></label>
          <label className="field"><span>Fuseau horaire<span className="req">*</span></span><input value={timezone} onChange={(e) => setTimezone(e.target.value)} required /></label>
          <label className="field">Tarif de consultation ({country.currency})
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Vide = gratuit" />
          </label>
          <fieldset className="field">
            <span>Moyens de paiement proposés à la réservation</span>
            <label className="check"><input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} /> Mobile Money, payé à la réservation (PawaPay)</label>
            <label className="check"><input type="checkbox" checked={onSite} onChange={(e) => setOnSite(e.target.checked)} /> Sur place, le jour du rendez-vous</label>
            <span className="hint">Le patient choisit parmi les moyens cochés. Mobile Money seulement si le pays est activé dans votre compte PawaPay. Aucun moyen coché = réservation fermée dans ce pays.</span>
          </fieldset>
          <label className="field">Numéro d’urgence médicale
            <input value={emergency} onChange={(e) => setEmergency(e.target.value)} inputMode="tel" placeholder="Ex. 1515" />
            <span className="hint">Appelé par le bouton « Urgence » de l’application et du site. Vérifiez-le auprès des autorités du pays. Vide = bouton masqué pour ce pays.</span>
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

function AddCountry({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [f, setF] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = f.fee.trim() === '' ? null : Number(f.fee.replace(',', '.'));
    if (value !== null && (!Number.isFinite(value) || value < 0)) return setError('Montant invalide.');
    try {
      await api('/api/v1/admin/countries', {
        method: 'POST',
        body: {
          code: f.code.trim(), nameFr: f.nameFr, nameEn: f.nameEn, currency: f.currency.trim(),
          dialCode: f.dialCode.trim(), timezone: f.timezone.trim(),
          defaultFeeMinor: value === null ? null : fee.toMinor(value, f.currency.trim().toUpperCase()),
        },
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <Modal title="Ajouter un pays" onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBox text={error} />
        <div className="form-grid">
          <label className="field"><span>Code ISO (2 lettres)<span className="req">*</span></span><input value={f.code} onChange={set('code')} maxLength={2} placeholder="SN" required /></label>
          <label className="field"><span>Nom (français)<span className="req">*</span></span><input value={f.nameFr} onChange={set('nameFr')} required /></label>
          <label className="field"><span>Nom (anglais)<span className="req">*</span></span><input value={f.nameEn} onChange={set('nameEn')} required /></label>
          <label className="field"><span>Devise (3 lettres)<span className="req">*</span></span><input value={f.currency} onChange={set('currency')} maxLength={3} placeholder="XOF" required /></label>
          <label className="field"><span>Indicatif<span className="req">*</span></span><input value={f.dialCode} onChange={set('dialCode')} placeholder="+221" required /></label>
          <label className="field"><span>Fuseau horaire<span className="req">*</span></span><input value={f.timezone} onChange={set('timezone')} placeholder="Africa/Dakar" required /></label>
          <label className="field">Tarif par défaut (facultatif)<input value={f.fee} onChange={set('fee')} inputMode="decimal" /></label>
        </div>
        <div className="form-actions">
          <button className="btn" type="submit">Ajouter</button>
          <button className="btn secondary" type="button" onClick={onClose}>Annuler</button>
        </div>
      </form>
    </Modal>
  );
}
