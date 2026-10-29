import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api';
import { ErrorBox, PageHead, PhoneInput, errorText, useLoad } from '../ui';

interface Settings { whatsappNumber: string | null; whatsappHours: string | null }

/** Réglages de l'assistance : bouton WhatsApp de l'application et du site. */
export default function SettingsPage() {
  const current = useLoad(() => api<Settings>('/api/v1/admin/settings'), []);
  const [number, setNumber] = useState('');
  const [hours, setHours] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (current.data) {
      setNumber(current.data.whatsappNumber ?? '');
      setHours(current.data.whatsappHours ?? '');
    }
  }, [current.data]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      await api('/api/v1/admin/settings', { method: 'PUT', body: { whatsappNumber: number, whatsappHours: hours.trim() } });
      setSaved(true);
      await current.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <PageHead title="Paramètres" lead="Ces réglages s’appliquent tout de suite à l’application et au site, sans nouvelle version." />
      <form className="card" onSubmit={submit} style={{ maxWidth: 640 }}>
        <h2>Assistance WhatsApp</h2>
        <p className="hint">Le bouton « Discuter sur WhatsApp » ouvre une conversation avec ce numéro. Il sert à l’assistance (questions, paiements, rendez-vous), pas aux urgences. Laissez vide pour masquer le bouton.</p>
        <ErrorBox text={current.error ?? error} />
        {saved ? <p className="notice">Paramètres enregistrés.</p> : null}
        <div className="form-grid">
          <label className="field">Numéro WhatsApp
            <PhoneInput value={number} onChange={setNumber} country="GN" />
          </label>
          <label className="field">Horaires de réponse
            <input value={hours} onChange={(e) => setHours(e.target.value)} maxLength={200} placeholder="Ex. du lundi au vendredi, 8 h – 18 h (GMT)" />
          </label>
        </div>
        <p className="hint">Le numéro d’urgence de chaque pays se règle dans la page « Pays ».</p>
        <div className="form-actions">
          <button className="btn" type="submit">Enregistrer</button>
        </div>
      </form>
    </>
  );
}
