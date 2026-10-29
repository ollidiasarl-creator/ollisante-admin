import { FormEvent, useEffect, useState } from 'react';
import { login, LoginChallenge, logout, session, setOnExpired, SPACE, verifyLogin } from './api';
import logo from './logo.png';
import Accounting from './pages/Accounting';
import Audit from './pages/Audit';
import Countries from './pages/Countries';
import Dashboard from './pages/Dashboard';
import Faq from './pages/Faq';
import Facilities from './pages/Facilities';
import NewsPage from './pages/News';
import Patients from './pages/Patients';
import Practitioners from './pages/Practitioners';
import Specialties from './pages/Specialties';
import SettingsPage from './pages/Settings';
import Campaigns from './pages/Campaigns';
import Statistics from './pages/Statistics';
import * as S from './structure/pages';
import Register from './structure/Register';
import Trainings from './pages/Trainings';
import { ErrorBox, errorText } from './ui';
import { Reports } from './Trust';

type Route = { path: string; label: string; render: () => JSX.Element; soon?: boolean };
const ADMIN_MENU: { group?: string; routes: Route[] }[] = [
  { routes: [{ path: 'tableau-de-bord', label: 'Tableau de bord', render: () => <Dashboard /> }] },
  {
    group: 'Gestion',
    routes: [
      { path: 'pays', label: 'Pays', render: () => <Countries /> },
      { path: 'structures', label: 'Structures', render: () => <Facilities /> },
      { path: 'specialites', label: 'Spécialités', render: () => <Specialties /> },
      { path: 'actualites', label: 'Actualités', render: () => <NewsPage /> },
      { path: 'formations', label: 'Formations', render: () => <Trainings /> },
    ],
  },
  {
    group: 'Utilisateurs',
    routes: [
      { path: 'patients', label: 'Patients', render: () => <Patients /> },
      { path: 'professionnels', label: 'Professionnels', render: () => <Practitioners /> },
      { path: 'signalements', label: 'Signalements', render: () => <Reports /> },
    ],
  },
  {
    group: 'Suivi',
    routes: [
      { path: 'comptabilite', label: 'Comptabilité', render: () => <Accounting /> },
      { path: 'statistiques', label: 'Statistiques', render: () => <Statistics /> },
      { path: 'affiches', label: 'Affiches', render: () => <Campaigns /> },
      { path: 'faq', label: 'FAQ', render: () => <Faq /> },
      { path: 'journal', label: 'Journal des actions', render: () => <Audit /> },
      { path: 'parametres', label: 'Paramètres', render: () => <SettingsPage /> },
    ],
  },
];
/** Espace Structure : hôpitaux, cliniques, cabinets, associations, ONG. */
const STRUCTURE_MENU: { group?: string; routes: Route[] }[] = [
  { routes: [{ path: 'tableau-de-bord', label: 'Tableau de bord', render: () => <S.Dashboard /> }] },
  {
    group: 'Activité',
    routes: [
      { path: 'rendez-vous', label: 'Rendez-vous', render: () => <S.Appointments /> },
      { path: 'horaires', label: 'Horaires', render: () => <S.Schedules /> },
      { path: 'medecins', label: 'Médecins', render: () => <S.Doctors /> },
    ],
  },
  {
    group: 'Ma structure',
    routes: [
      { path: 'sites', label: 'Sites', render: () => <S.Sites /> },
      { path: 'profil', label: 'Profil', render: () => <S.Profile /> },
    ],
  },
];
const MENU = SPACE === 'structure' ? STRUCTURE_MENU : ADMIN_MENU;
const ROUTES = MENU.flatMap((m) => m.routes);

function useHashRoute() {
  const read = () => window.location.hash.replace(/^#\/?/, '') || 'tableau-de-bord';
  const [path, setPath] = useState(read);
  useEffect(() => {
    const on = () => setPath(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return path;
}

export default function App() {
  const [signedIn, setSignedIn] = useState(() => session.load() !== null);
  const path = useHashRoute();
  useEffect(() => setOnExpired(() => setSignedIn(false)), []);

  // « /structure/#inscription » (lien du site) ouvre directement l'inscription.
  const [registering, setRegistering] = useState(() => SPACE === 'structure' && window.location.hash === '#inscription');
  if (!signedIn) {
    return registering && SPACE === 'structure'
      ? <Register onDone={() => setSignedIn(true)} onLogin={() => setRegistering(false)} />
      : <Login onDone={() => setSignedIn(true)} onRegister={SPACE === 'structure' ? () => setRegistering(true) : undefined} />;
  }
  const route = ROUTES.find((r) => r.path === path) ?? ROUTES[0];

  return (
    <div className="layout">
      <nav className="sidebar" aria-label="Menu">
        <img src={logo} alt="Ollisanté" />
        {SPACE === 'structure' ? <div className="nav-group" style={{ marginTop: -8 }}>Espace Structure</div> : null}
        {MENU.map((m, i) => (
          <div key={m.group ?? i}>
            {m.group ? <div className="nav-group">{m.group}</div> : null}
            {m.routes.map((r) => (
              <a key={r.path} href={`#/${r.path}`} className={`nav-link${r === route ? ' on' : ''}${r.soon ? ' soon' : ''}`}>
                {r.label}
                {r.soon ? <span className="soon-tag">bientôt</span> : null}
              </a>
            ))}
          </div>
        ))}
        <div className="sidebar-foot">
          <span>{session.load()?.email}</span>
          <button className="btn secondary small" onClick={() => void logout().then(() => setSignedIn(false))}>Se déconnecter</button>
        </div>
      </nav>
      <main className="main">{route.render()}</main>
    </div>
  );
}

function Login({ onDone, onRegister }: { onDone: () => void; onRegister?: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<LoginChallenge | null>(null);
  const [code, setCode] = useState('');
  const [remember, setRemember] = useState(true);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const c = await login(email.trim().toLowerCase(), password);
      if (c) setChallenge(c);
      else onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    if (!challenge) return;
    setBusy(true);
    setError(null);
    try {
      await verifyLogin(challenge.challengeId, code.trim(), remember);
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    setInfo(null);
    try {
      const c = await login(email.trim().toLowerCase(), password);
      if (c) {
        setChallenge(c);
        setCode('');
        setInfo('Un nouveau code vient d’être envoyé.');
      } else onDone();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const title = <h1 style={{ textAlign: 'center', fontSize: 20 }}>{SPACE === 'structure' ? 'Espace Structure' : 'Administration'}</h1>;

  if (challenge) {
    return (
      <div className="login">
        <form className="card" onSubmit={confirm}>
          <img src={logo} alt="Ollisanté" />
          {title}
          <p className="hint">Par sécurité, saisissez le code à 6 chiffres envoyé à <strong>{challenge.emailHint}</strong>. Il est valable 10 minutes (pensez aux courriers indésirables).</p>
          {info ? <p className="notice">{info}</p> : null}
          <ErrorBox text={error} />
          <label className="field">Code reçu par e-mail
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric"
              autoComplete="one-time-code" autoFocus required />
          </label>
          <label className="check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Se souvenir de cet ordinateur pendant 30 jours</label>
          <button className="btn" type="submit" disabled={busy || code.length !== 6}>{busy ? 'Vérification…' : 'Valider'}</button>
          <button className="link-btn" type="button" onClick={() => void resend()}>Renvoyer un code</button>
          <button className="link-btn" type="button" onClick={() => { setChallenge(null); setCode(''); setError(null); }}>Retour</button>
        </form>
      </div>
    );
  }

  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <img src={logo} alt="Ollisanté" />
        {title}
        <ErrorBox text={error} />
        <label className="field">Adresse e-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></label>
        <label className="field">Mot de passe<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</button>
        {onRegister ? <button className="link-btn" type="button" onClick={onRegister}>Inscrire ma structure</button> : null}
      </form>
    </div>
  );
}
