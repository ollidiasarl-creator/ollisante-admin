import { FormEvent, useState } from 'react';
import { api, fee, Page } from '../api';
import { Empty, ErrorBox, Modal, PageHead, date, dateTime, errorText, useLoad } from '../ui';

interface CurrencyTotals {
  currency: string; payments: number; collectedMinor: number; refundedMinor: number;
  netMinor: number; commissionMinor: number; practitionersMinor: number;
}
interface Summary { from: string; to: string; commissionPercent: number; totals: CurrencyTotals[]; dueToPractitioners: CurrencyTotals[]; failedRefunds: number }
interface PaymentRow {
  id: string; createdAt: string; patient: string; practitioner: string; appointmentAt: string; amountMinor: number;
  refundedMinor: number; currency: string; status: string; operator: string | null; failureCode: string | null; paidOut: boolean;
}
interface RefundRow { id: string; createdAt: string; patient: string; amountMinor: number; currency: string; reason: string; failureCode: string | null }
interface PayoutRow {
  id: string; practitioner: string; practitionerEmail: string | null; practitionerPhone: string | null; currency: string;
  grossMinor: number; commissionMinor: number; amountMinor: number; periodEnd: string; status: 'DUE' | 'PAID';
  paidAt: string | null; reference: string | null;
}

const money = (minor: number, currency: string) =>
  `${fee.toMajor(minor, currency).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${currency}`;
const STATUS: Record<string, [string, string]> = {
  PENDING: ['En cours', 'off'], SUCCEEDED: ['Payé', 'ok'], FAILED: ['Échoué', 'warn'],
  PARTIALLY_REFUNDED: ['Remboursé en partie', 'off'], REFUNDED: ['Remboursé', 'off'],
};
const REASON: Record<string, string> = {
  ANNULATION_PATIENT: 'Annulation par le patient', ANNULATION_PRACTITIONER: 'Annulation par le praticien',
  ANNULATION_ADMIN: 'Annulation par l’administration', PAIEMENT_TARDIF: 'Paiement arrivé après expiration',
};
const TABS = [['synthese', 'Synthèse'], ['reversements', 'Reversements'], ['paiements', 'Paiements']] as const;
type Tab = (typeof TABS)[number][0];

const firstOfMonth = () => { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString().slice(0, 10); };
const today = () => new Date().toISOString().slice(0, 10);

export default function Accounting() {
  const [tab, setTab] = useState<Tab>('synthese');
  return (
    <>
      <PageHead title="Comptabilité" lead="Paiements Mobile Money (PawaPay), remboursements, commission OLIDIA et reversements hebdomadaires aux praticiens.">
        <div className="tabs" style={{ marginBottom: 0 }}>
          {TABS.map(([k, label]) => <button key={k} className={`tab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{label}</button>)}
        </div>
      </PageHead>
      {tab === 'synthese' ? <SummaryTab /> : tab === 'reversements' ? <PayoutsTab /> : <PaymentsTab />}
    </>
  );
}

function SummaryTab() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const s = useLoad(() => api<Summary>(`/api/v1/admin/accounting/summary?from=${from}&to=${to}`), [from, to]);
  const failed = useLoad(() => api<RefundRow[]>('/api/v1/admin/accounting/refunds/failed'), []);
  return (
    <>
      <div className="toolbar">
        <label className="field">Du<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="field">Au<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <ErrorBox text={s.error} />
      {s.data && s.data.totals.length === 0 ? <Empty text="Aucun paiement sur la période." /> : (
        <table>
          <thead><tr><th>Devise</th><th>Paiements</th><th>Encaissé</th><th>Remboursé</th><th>Net</th><th>Commission ({s.data?.commissionPercent ?? 15} %)</th><th>Part praticiens</th></tr></thead>
          <tbody>
            {(s.data?.totals ?? []).map((t) => (
              <tr key={t.currency}>
                <td><strong>{t.currency}</strong></td><td className="num">{t.payments}</td>
                <td className="num">{money(t.collectedMinor, t.currency)}</td><td className="num">{money(t.refundedMinor, t.currency)}</td>
                <td className="num"><strong>{money(t.netMinor, t.currency)}</strong></td>
                <td className="num">{money(t.commissionMinor, t.currency)}</td><td className="num">{money(t.practitionersMinor, t.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h2 style={{ fontSize: 18, margin: '24px 0 10px' }}>Reste à verser aux praticiens</h2>
      {s.data && s.data.dueToPractitioners.length === 0 ? <Empty text="Rien à verser : tous les relevés sont réglés." /> : (
        <table>
          <thead><tr><th>Devise</th><th>Relevés en attente</th><th>À verser</th></tr></thead>
          <tbody>
            {(s.data?.dueToPractitioners ?? []).map((t) => (
              <tr key={t.currency}><td><strong>{t.currency}</strong></td><td className="num">{t.payments}</td><td className="num"><strong>{money(t.practitionersMinor, t.currency)}</strong></td></tr>
            ))}
          </tbody>
        </table>
      )}
      {failed.data && failed.data.length > 0 ? (
        <>
          <h2 style={{ fontSize: 18, margin: '24px 0 10px' }}>Remboursements à traiter à la main</h2>
          <div className="error">PawaPay a refusé ces remboursements. Remboursez le patient directement, puis signalez-le au support PawaPay si besoin.</div>
          <table>
            <thead><tr><th>Date</th><th>Patient</th><th>Montant</th><th>Motif</th><th>Erreur</th></tr></thead>
            <tbody>
              {failed.data.map((r) => (
                <tr key={r.id}><td>{dateTime(r.createdAt)}</td><td>{r.patient}</td><td className="num">{money(r.amountMinor, r.currency)}</td>
                  <td>{REASON[r.reason] ?? r.reason}</td><td className="hint">{r.failureCode ?? '–'}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </>
  );
}

function PayoutsTab() {
  const [onlyDue, setOnlyDue] = useState(true);
  const list = useLoad(() => api<Page<PayoutRow>>(`/api/v1/admin/accounting/payouts${onlyDue ? '?status=DUE' : ''}`), [onlyDue]);
  const [paying, setPaying] = useState<PayoutRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setError(null);
    setNotice(null);
    try {
      const created = await api<PayoutRow[]>('/api/v1/admin/accounting/payouts/generate', { method: 'POST' });
      setNotice(created.length ? `${created.length} relevé(s) préparé(s).` : 'Aucune nouvelle consultation payée à reverser.');
      await list.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  function exportCsv() {
    const rows = [['Praticien', 'E-mail', 'Téléphone', 'Période jusqu’au', 'Devise', 'Net encaissé', 'Commission', 'À verser', 'Statut', 'Référence']];
    for (const p of list.data?.content ?? []) {
      rows.push([p.practitioner, p.practitionerEmail ?? '', p.practitionerPhone ?? '', p.periodEnd, p.currency,
        String(fee.toMajor(p.grossMinor, p.currency)), String(fee.toMajor(p.commissionMinor, p.currency)),
        String(fee.toMajor(p.amountMinor, p.currency)), p.status === 'PAID' ? 'Payé' : 'À payer', p.reference ?? '']);
    }
    const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `reversements-${today()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <p className="lead">Chaque vendredi matin, un relevé est préparé automatiquement par praticien pour les consultations payées de la semaine écoulée. Faites le virement, puis marquez-le payé.</p>
      <div className="toolbar">
        <button className="btn" onClick={() => void generate()}>Préparer les relevés maintenant</button>
        <button className="btn secondary" onClick={exportCsv} disabled={!list.data?.content.length}>Exporter (Excel)</button>
        <div className="spacer" />
        <label className="hint"><input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} /> Seulement les relevés à payer</label>
      </div>
      {notice ? <div className="notice">{notice}</div> : null}
      <ErrorBox text={error ?? list.error} />
      {list.data && list.data.content.length === 0 ? <Empty text={onlyDue ? 'Aucun relevé à payer.' : 'Aucun relevé.'} /> : (
        <table>
          <thead><tr><th>Praticien</th><th>Jusqu’au</th><th>Net encaissé</th><th>Commission</th><th>À verser</th><th>Statut</th><th /></tr></thead>
          <tbody>
            {(list.data?.content ?? []).map((p) => (
              <tr key={p.id}>
                <td><strong>{p.practitioner}</strong><br /><span className="hint">{[p.practitionerPhone, p.practitionerEmail].filter(Boolean).join(' · ')}</span></td>
                <td>{date(p.periodEnd)}</td>
                <td className="num">{money(p.grossMinor, p.currency)}</td>
                <td className="num">{money(p.commissionMinor, p.currency)}</td>
                <td className="num"><strong>{money(p.amountMinor, p.currency)}</strong></td>
                <td>{p.status === 'PAID'
                  ? <span className="badge ok" title={p.reference ?? ''}>Payé le {date(p.paidAt!)}</span>
                  : <span className="badge warn">À payer</span>}</td>
                <td className="actions">{p.status === 'DUE' ? <button className="btn small" onClick={() => setPaying(p)}>Marquer payé</button> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {paying ? <MarkPaid payout={paying} onClose={() => setPaying(null)} onDone={list.reload} /> : null}
    </>
  );
}

function MarkPaid({ payout, onClose, onDone }: { payout: PayoutRow; onClose: () => void; onDone: () => Promise<void> }) {
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/api/v1/admin/accounting/payouts/${payout.id}/paid`, { method: 'POST', body: { reference } });
      await onDone();
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
  }
  return (
    <Modal title={`Reversement à ${payout.practitioner}`} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBox text={error} />
        <p>Montant à verser : <strong>{money(payout.amountMinor, payout.currency)}</strong></p>
        <label className="field">Référence du virement (facultatif)<span className="hint">Ex. numéro de transaction Orange Money ou Wave</span>
          <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />
        </label>
        <div className="form-actions">
          <button className="btn" type="submit">Confirmer le paiement</button>
          <button className="btn secondary" type="button" onClick={onClose}>Annuler</button>
        </div>
      </form>
    </Modal>
  );
}

function PaymentsTab() {
  const [page, setPage] = useState(0);
  const list = useLoad(() => api<Page<PaymentRow>>(`/api/v1/admin/accounting/payments?page=${page}&size=50`), [page]);
  return (
    <>
      <ErrorBox text={list.error} />
      {list.data && list.data.content.length === 0 ? <Empty text="Aucun paiement pour l’instant." /> : (
        <table>
          <thead><tr><th>Date</th><th>Patient</th><th>Praticien</th><th>Rendez-vous</th><th>Montant</th><th>Opérateur</th><th>Statut</th></tr></thead>
          <tbody>
            {(list.data?.content ?? []).map((p) => {
              const [label, kind] = STATUS[p.status] ?? [p.status, 'off'];
              return (
                <tr key={p.id}>
                  <td>{dateTime(p.createdAt)}</td><td>{p.patient}</td><td>{p.practitioner}</td><td>{dateTime(p.appointmentAt)}</td>
                  <td className="num">{money(p.amountMinor, p.currency)}{p.refundedMinor > 0 ? <><br /><span className="hint">remboursé {money(p.refundedMinor, p.currency)}</span></> : null}</td>
                  <td>{p.operator ?? '–'}</td>
                  <td><span className={`badge ${kind}`}>{label}</span>{p.failureCode ? <><br /><span className="hint">{p.failureCode}</span></> : null}{p.paidOut ? <><br /><span className="hint">reversé</span></> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {list.data && list.data.totalPages > 1 ? (
        <div className="form-actions">
          <button className="btn secondary small" disabled={page === 0} onClick={() => setPage(page - 1)}>← Plus récents</button>
          <span className="hint">Page {page + 1} / {list.data.totalPages}</span>
          <button className="btn secondary small" disabled={page + 1 >= list.data.totalPages} onClick={() => setPage(page + 1)}>Plus anciens →</button>
        </div>
      ) : null}
    </>
  );
}
