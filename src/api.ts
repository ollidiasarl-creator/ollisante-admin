/** Appels à l'API Ollisanté (même adresse que le site : /api/...). */

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const TOKEN_KEY = window.location.pathname.startsWith('/structure') ? 'ollisante-structure-session' : 'ollisante-admin-session';

interface Session {
  accessToken: string;
  refreshToken: string;
  email: string;
}

// Session de l'onglet seulement : fermer l'onglet déconnecte.
export const session = {
  load(): Session | null {
    try {
      const raw = sessionStorage.getItem(TOKEN_KEY);
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  },
  save(s: Session) {
    try {
      sessionStorage.setItem(TOKEN_KEY, JSON.stringify(s));
    } catch {
      // stockage indisponible : la session reste en mémoire le temps de la page
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // rien à faire
    }
  },
};

let onExpired: () => void = () => undefined;
export function setOnExpired(fn: () => void) {
  onExpired = fn;
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (res.ok) return data as T;
  const fields = data?.fieldErrors ? Object.values(data.fieldErrors as Record<string, string>)[0] : null;
  throw new ApiError(res.status, data?.code ?? 'ERREUR', fields ?? data?.message ?? `Erreur ${res.status}`);
}

let refreshing: Promise<boolean> | null = null;

/**
 * Un seul renouvellement à la fois : plusieurs requêtes refusées en même temps attendent le même. Sinon le
 * serveur verrait le même jeton présenté deux fois, croirait à un vol et fermerait toutes les sessions.
 */
function refresh(): Promise<boolean> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function doRefresh(): Promise<boolean> {
  const s = session.load();
  if (!s) return false;
  const res = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: s.refreshToken }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  session.save({ ...s, accessToken: data.accessToken, refreshToken: data.refreshToken });
  return true;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const send = () => {
    const s = session.load();
    const isForm = init.body instanceof FormData;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (init.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
    if (s) headers.Authorization = `Bearer ${s.accessToken}`;
    return fetch(path, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : isForm ? (init.body as FormData) : JSON.stringify(init.body),
    });
  };
  let res = await send();
  if (res.status === 401 && session.load()) {
    if (await refresh()) res = await send();
    else {
      session.clear();
      onExpired();
    }
  }
  return parse<T>(res);
}

/** Espace affiché selon l'adresse : /structure/ pour les structures, /admin/ pour l'équipe OLIDIA. */
export const SPACE: 'admin' | 'structure' = window.location.pathname.startsWith('/structure') ? 'structure' : 'admin';
const EXPECTED_ROLE = SPACE === 'structure' ? 'STRUCTURE' : 'ADMIN';

const DEVICE_KEY = 'ollisante-admin-device';

/** Jeton « ordinateur de confiance » (30 jours) : l'administrateur n'a plus à saisir de code ici. */
const trustedDevice = {
  load(): string | null {
    try {
      return localStorage.getItem(DEVICE_KEY);
    } catch {
      return null;
    }
  },
  save(token: string) {
    try {
      localStorage.setItem(DEVICE_KEY, token);
    } catch {
      // stockage indisponible : le code sera redemandé
    }
  },
};

/** Code envoyé par e-mail à un administrateur dont le mot de passe est correct. */
export interface LoginChallenge {
  challengeId: string;
  emailHint: string;
}

interface AuthData { accessToken: string; refreshToken: string; user: { email: string; role: string } }

function openSession(data: AuthData) {
  if (data.user.role !== EXPECTED_ROLE) {
    throw new ApiError(403, 'ACCES_REFUSE', SPACE === 'structure'
      ? 'Ce compte n’est pas un compte de structure.'
      : 'Ce compte n’est pas administrateur.');
  }
  session.save({ accessToken: data.accessToken, refreshToken: data.refreshToken, email: data.user.email });
}

/** Renvoie un défi si un code e-mail est nécessaire (administrateurs), sinon ouvre la session. */
export async function login(email: string, password: string): Promise<LoginChallenge | null> {
  const res = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: email, password, deviceToken: SPACE === 'admin' ? trustedDevice.load() : null }),
  });
  if (res.status === 202) return parse<LoginChallenge>(res);
  openSession(await parse<AuthData>(res));
  return null;
}

export async function verifyLogin(challengeId: string, code: string, rememberDevice: boolean): Promise<void> {
  const res = await fetch('/api/v1/auth/login/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challengeId, code, rememberDevice }),
  });
  const data = await parse<{ auth: AuthData; deviceToken: string | null }>(res);
  openSession(data.auth);
  if (data.deviceToken) trustedDevice.save(data.deviceToken);
}

/** Inscription d'une structure (compte créé puis connecté). */
export async function registerStructure(body: Record<string, unknown>): Promise<void> {
  const res = await fetch('/api/v1/auth/register/structure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await parse<{ accessToken: string; refreshToken: string; user: { email: string } }>(res);
  session.save({ accessToken: data.accessToken, refreshToken: data.refreshToken, email: data.user.email });
  // Arrivée depuis une affiche (source gardée par le site public, même domaine) : on compte l'inscription.
  try {
    const src = localStorage.getItem('ollisante-src');
    if (src) {
      localStorage.removeItem('ollisante-src');
      void fetch('/api/v1/campaign/events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: src, kind: 'SIGNUP' }),
      }).catch(() => undefined);
    }
  } catch {
    // sans stockage, rien à attribuer
  }
}

export async function logout(): Promise<void> {
  const s = session.load();
  session.clear();
  if (s) {
    await fetch('/api/v1/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: s.refreshToken }),
    }).catch(() => undefined);
  }
}

// ---------- types ----------
export interface Page<T> {
  content: T[];
  page: number;
  totalElements: number;
  totalPages: number;
}
export interface Country {
  code: string;
  nameFr: string;
  nameEn: string;
  currency: string;
  dialCode: string;
  timezone: string;
  defaultFeeMinor: number | null;
  active: boolean;
  onlinePayment: boolean; onSitePayment: boolean;
  emergencyNumber: string | null;
}
export interface Specialty {
  code: string;
  nameFr: string;
  nameEn: string;
}
export interface Facility {
  id: string;
  name: string;
  countryCode: string;
  city: string | null;
  locality: string | null;
  address: string | null;
  phone: string | null;
  organizationId: string | null;
  organizationType: OrgType | null;
}
export interface News {
  id: string;
  title: string;
  body: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  videoUrl: string | null;
  countryCode: string | null;
  audience: 'ALL' | 'PATIENT' | 'PRACTITIONER';
  publishedAt: string;
}
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';
export interface PatientRow {
  id: string;
  email: string | null;
  phone: string | null;
  status: UserStatus;
  firstName: string;
  lastName: string;
  countryCode: string | null;
  createdAt: string;
}
export type Verification = 'PENDING' | 'VERIFIED' | 'REJECTED';
export interface PractitionerRow {
  id: string;
  userId: string;
  userStatus: UserStatus;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  countryCode: string;
  licenseNumber: string;
  specialties: Specialty[];
  verificationStatus: Verification;
}
export interface Stats {
  patients: number;
  practitionersVerified: number;
  practitionersPending: number;
  facilities: number;
  news: number;
  appointmentsToday: number;
  appointmentsThisMonth: number;
  appointmentsUpcoming: number;
  cancelledThisMonth: number;
}
export interface AuditRow {
  id: string;
  adminEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: string | null;
  createdAt: string;
}

const ZERO_DECIMAL = ['XOF', 'XAF', 'GNF', 'CDF', 'RWF'];
/** Montant stocké en unité minimale → montant affiché, et inversement. */
export const fee = {
  toMajor: (minor: number, currency: string) => (ZERO_DECIMAL.includes(currency) ? minor : minor / 100),
  toMinor: (major: number, currency: string) => Math.round(ZERO_DECIMAL.includes(currency) ? major : major * 100),
};

export type OrgType = 'HOSPITAL' | 'CLINIC' | 'MEDICAL_PRACTICE' | 'HEALTH_CENTER' | 'ASSOCIATION' | 'NGO' | 'OTHER';
export const ORG_TYPES: Record<OrgType, string> = {
  HOSPITAL: 'Hôpital', CLINIC: 'Clinique', MEDICAL_PRACTICE: 'Cabinet médical', HEALTH_CENTER: 'Centre de santé',
  ASSOCIATION: 'Association', NGO: 'ONG', OTHER: 'Autre',
};
export interface StructureProfile {
  id: string; type: OrgType; name: string; countryCode: string; city: string | null; address: string | null;
  email: string; phone: string; domain: string | null; registrationNumber: string; contactName: string;
  contactRole: string | null; beds: number | null; verificationStatus: Verification; commissionPercent: number | null;
  accountStatus: UserStatus; createdAt: string; locality: string | null;
}
export interface Appointment {
  id: string; practitionerId: string; practitionerName: string; patientName: string; facilityName: string | null;
  startsAt: string; status: 'PENDING_PAYMENT' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
  reason: string | null; priceMinor: number | null; priceCurrency: string | null; paymentMode: 'ONLINE' | 'ON_SITE' | 'FREE';
}
