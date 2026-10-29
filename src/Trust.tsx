import { useEffect, useState } from 'react';
import { api, session } from './api';
import { Empty, ErrorBox, Modal, PageHead, errorText, useLoad } from './ui';

/** Pièces justificatives et points à contrôler avant de valider un médecin ou une structure. */
export interface VerificationDocument { id: string; kind: string; contentType: string; sizeBytes: number; createdAt: string }
interface Review { documents: VerificationDocument[]; alerts: string[] }
type OwnerType = 'practitioner' | 'organization';

export const KIND_LABELS: Record<string, string> = {
  ORDER_CARD: 'Carte de l’Ordre', ID_CARD: 'Pièce d’identité', DIPLOMA: 'Diplôme', RCCM: 'RCCM / immatriculation',
  AUTHORIZATION: 'Autorisation d’exercer', OTHER: 'Autre pièce',
};

export const getReview = (type: OwnerType, id: string) => api<Review>(`/api/v1/admin/verification/${type}/${id}`);

/** Ouvre une pièce dans un nouvel onglet (le fichier n'est accessible qu'avec la session de l'administrateur). */
async function openDocument(id: string) {
  const tab = window.open('', '_blank');
  const s = session.load();
  const res = await fetch(`/api/v1/admin/verification-documents/${id}`, { headers: s ? { Authorization: `Bearer ${s.accessToken}` } : {} });
  if (!res.ok) {
    tab?.close();
    throw new Error('Pièce introuvable ou session expirée : rechargez la page.');
  }
  const url = URL.createObjectURL(await res.blob());
  if (tab) tab.location.href = url;
  else window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Texte ajouté à la confirmation « Valider » quand il reste des points à contrôler. */
export async function alertsBeforeValidation(type: OwnerType, id: string): Promise<string> {
  try {
    const r = await getReview(type, id);
    return r.alerts.length ? `\n\n⚠️ À contrôler :\n• ${r.alerts.join('\n• ')}` : '';
  } catch {
    return '';
  }
}

/** Fenêtre « Pièces et alertes » ouverte depuis les listes Professionnels et Structures. */
export function ReviewModal({ type, id, name, onClose }: { type: OwnerType; id: string; name: string; onClose: () => void }) {
  const review = useLoad(() => getReview(type, id), [type, id]);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title={`Vérification : ${name}`} onClose={onClose}>
      <ErrorBox text={review.error ?? error} />
      {review.data ? (
        <div className="stack">
          {review.data.alerts.length ? (
            <div className="notice warn">
              <strong>À contrôler</strong>
              <ul>{review.data.alerts.map((a) => <li key={a}>{a}</li>)}</ul>
            </div>
          ) : <p className="notice">Aucune alerte automatique. Vérifiez quand même le numéro auprès de l’Ordre ou du registre du pays.</p>}
          <h3>Pièces envoyées</h3>
          {review.data.documents.length === 0 ? <Empty text="Aucune pièce : demandez-les avant de valider." /> : (
            <table>
              <tbody>
                {review.data.documents.map((d) => (
                  <tr key={d.id}>
                    <td>{KIND_LABELS[d.kind] ?? d.kind}</td>
                    <td className="muted">{new Date(d.createdAt).toLocaleDateString('fr-FR')} · {d.contentType === 'application/pdf' ? 'PDF' : 'photo'}</td>
                    <td className="actions"><button className="btn small secondary" onClick={() => openDocument(d.id).catch((e) => setError(errorText(e)))}>Ouvrir</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
    </Modal>
  );
}

// ---------- Espace Structure : envoi de ses pièces ----------

const STRUCTURE_DOCS: { kind: string; label: string; required: boolean }[] = [
  { kind: 'RCCM', label: 'RCCM, NINEA, NIF ou équivalent', required: true },
  { kind: 'AUTHORIZATION', label: 'Autorisation d’ouverture ou d’exercice (ministère de la Santé)', required: true },
  { kind: 'ID_CARD', label: 'Pièce d’identité de la personne contact', required: true },
];

export function StructureDocs() {
  const [docs, setDocs] = useState<VerificationDocument[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => api<VerificationDocument[]>('/api/v1/me/verification-documents').then(setDocs).catch((e) => setError(errorText(e)));
  useEffect(() => {
    void load();
  }, []);
  async function send(kind: string, file: File | undefined) {
    if (!file) return;
    setBusy(kind);
    setError(null);
    try {
      const form = new FormData();
      form.append('kind', kind);
      form.append('file', file);
      await api('/api/v1/me/verification-documents', { method: 'POST', body: form });
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }
  async function remove(id: string) {
    try {
      await api(`/api/v1/me/verification-documents/${id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <section className="stack" style={{ marginTop: 28 }}>
      <h2>Pièces justificatives</h2>
      <p className="muted">Une photo nette ou un PDF. Seule l’équipe OLIDIA les voit, pour vérifier votre structure.</p>
      <ErrorBox text={error} />
      <table>
        <tbody>
          {STRUCTURE_DOCS.map((d) => {
            const sent = (docs ?? []).filter((x) => x.kind === d.kind);
            return (
              <tr key={d.kind}>
                <td><strong>{d.label}</strong><br /><span className={sent.length ? 'ok' : 'muted'}>{sent.length ? `Envoyée ✓ (${sent.length})` : 'À envoyer'}</span></td>
                <td className="actions">
                  {sent.map((x) => <button key={x.id} className="btn small secondary" onClick={() => void remove(x.id)}>Retirer</button>)}
                  <label className="btn small">
                    {busy === d.kind ? 'Envoi…' : sent.length ? 'Ajouter' : 'Envoyer'}
                    <input type="file" accept="image/*,application/pdf" hidden disabled={!!busy}
                      onChange={(e) => { void send(d.kind, e.target.files?.[0]); e.target.value = ''; }} />
                  </label>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// ---------- Administration : profils signalés par le public ----------

interface ReportSummary {
  targetType: 'PRACTITIONER' | 'FACILITY'; targetId: string; targetName: string | null; openReports: number;
  reasons: string[]; messages: string[]; lastAt: string; hidden: boolean;
}
const REASON_LABELS: Record<string, string> = {
  FAKE_PROFILE: 'Faux profil', WRONG_INFO: 'Informations erronées', BEHAVIOUR: 'Comportement inapproprié', OTHER: 'Autre',
};

export function Reports() {
  const list = useLoad(() => api<ReportSummary[]>('/api/v1/admin/reports'), []);
  const [error, setError] = useState<string | null>(null);
  async function close(r: ReportSummary, reinstate: boolean) {
    const text = reinstate
      ? `Classer les signalements et rendre « ${r.targetName} » de nouveau visible ?`
      : `Classer les signalements de « ${r.targetName} » ? (Pour retirer le compte, refusez-le dans Professionnels ou suspendez-le.)`;
    if (!window.confirm(text)) return;
    setError(null);
    try {
      await api(`/api/v1/admin/reports/${r.targetType}/${r.targetId}/close`, { method: 'POST', body: { reinstate } });
      await list.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <>
      <PageHead title="Signalements"
        lead="Profils signalés par les visiteurs. Un médecin signalé par 3 personnes différentes est masqué du public jusqu’à votre vérification." />
      <ErrorBox text={list.error ?? error} />
      {list.data && list.data.length === 0 ? <Empty text="Aucun signalement en attente." /> : (
        <table>
          <thead><tr><th>Profil</th><th>Signalements</th><th>Motifs et précisions</th><th /></tr></thead>
          <tbody>
            {(list.data ?? []).map((r) => (
              <tr key={`${r.targetType}-${r.targetId}`}>
                <td>
                  <strong>{r.targetType === 'PRACTITIONER' ? `Dr ${r.targetName ?? '?'}` : r.targetName ?? '?'}</strong><br />
                  <span className="muted">{r.targetType === 'PRACTITIONER' ? 'Médecin' : 'Structure'}{r.hidden ? ' · masqué du public' : ''}</span>
                </td>
                <td>{r.openReports}<br /><span className="muted">dernier le {new Date(r.lastAt).toLocaleDateString('fr-FR')}</span></td>
                <td>
                  {r.reasons.map((x) => REASON_LABELS[x] ?? x).join(', ')}
                  {r.messages.length ? <ul className="muted">{r.messages.slice(0, 3).map((m, i) => <li key={i}>« {m} »</li>)}</ul> : null}
                </td>
                <td className="actions">
                  {r.targetType === 'PRACTITIONER' && r.hidden
                    ? <button className="btn small" onClick={() => void close(r, true)}>Vérifié : rétablir</button> : null}
                  <button className="btn small secondary" onClick={() => void close(r, false)}>Classer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
