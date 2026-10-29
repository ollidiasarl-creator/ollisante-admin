import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api';

export function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return 'Le serveur est injoignable. Vérifiez votre connexion.';
}

/** Charge une donnée et permet de la recharger après une action. */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(loader, deps);
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await load());
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [load]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, loading, reload };
}

export function PageHead({ title, lead, children }: { title: string; lead?: string; children?: ReactNode }) {
  return (
    <>
      <div className="toolbar">
        <h1>{title}</h1>
        <div className="spacer" />
        {children}
      </div>
      {lead ? <p className="lead">{lead}</p> : null}
    </>
  );
}

export function ErrorBox({ text }: { text: string | null }) {
  return text ? <div className="error" role="alert">{text}</div> : null;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const date = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

// ---------- Téléphone : indicatif en liste déroulante + numéro ----------

interface DialCountry { code: string; nameFr: string; dialCode: string }

let dialCountries: Promise<DialCountry[]> | null = null;
function loadDialCountries(): Promise<DialCountry[]> {
  dialCountries ??= fetch('/api/v1/countries')
    .then((r) => (r.ok ? r.json() : []))
    .then((list: DialCountry[]) => [...list].sort((a, b) => a.nameFr.localeCompare(b.nameFr, 'fr')))
    .catch(() => {
      dialCountries = null;
      return [];
    });
  return dialCountries;
}

const flag = (code: string) =>
  String.fromCodePoint(...code.toUpperCase().split('').map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

/**
 * Numéro au format international (+221771234567). L'indicatif se choisit dans la liste ; le 0 initial
 * du numéro local est retiré. `country` présélectionne l'indicatif quand le champ est vide.
 */
export function PhoneInput({ value, onChange, country, required }: {
  value: string; onChange: (e164: string) => void; country?: string; required?: boolean;
}) {
  const [list, setList] = useState<DialCountry[]>([]);
  const [code, setCode] = useState('');
  const [local, setLocal] = useState('');

  useEffect(() => {
    void loadDialCountries().then(setList);
  }, []);

  const emitted = useRef<string | null>(null);

  // Décompose une valeur venue de l'extérieur (indicatif le plus long qui correspond).
  useEffect(() => {
    if (!list.length || value === emitted.current) return;
    const match = [...list].sort((a, b) => b.dialCode.length - a.dialCode.length)
      .find((c) => value.startsWith(c.dialCode));
    const preferred = list.find((c) => c.code === country);
    if (match) {
      setCode(preferred?.dialCode === match.dialCode ? preferred.code : match.code);
      setLocal(value.slice(match.dialCode.length));
    } else {
      setCode(preferred ? preferred.code : 'SN');
      setLocal(value.replace(/^\+/, ''));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, value]);

  // Suit le pays choisi dans le formulaire tant que le numéro n'est pas saisi.
  useEffect(() => {
    if (country && !local && list.some((c) => c.code === country)) setCode(country);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, list]);

  function emit(nextCode: string, nextLocal: string) {
    const dial = list.find((c) => c.code === nextCode)?.dialCode ?? '';
    const digits = nextLocal.replace(/\D/g, '').replace(/^0+/, '');
    const result = digits ? `${dial}${digits}` : '';
    emitted.current = result;
    onChange(result);
  }

  return (
    <div className="phone">
      <select value={code} onChange={(e) => { setCode(e.target.value); emit(e.target.value, local); }} aria-label="Indicatif">
        {list.map((c) => <option key={c.code} value={c.code}>{flag(c.code)} {c.dialCode} {c.nameFr}</option>)}
      </select>
      <input value={local} inputMode="tel" placeholder="77 123 45 67" required={required} aria-label="Numéro"
        onChange={(e) => { setLocal(e.target.value); emit(code, e.target.value); }} />
    </div>
  );
}
