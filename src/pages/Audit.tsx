import { useState } from 'react';
import { api, AuditRow, Page } from '../api';
import { Empty, ErrorBox, PageHead, dateTime, useLoad } from '../ui';

const LABELS: Record<string, string> = {
  PAYS_AJOUTE: 'Pays ajouté', PAYS_MODIFIE: 'Pays modifié',
  SPECIALITE_AJOUTEE: 'Spécialité ajoutée', SPECIALITE_MODIFIEE: 'Spécialité modifiée',
  STRUCTURE_MODIFIEE: 'Structure modifiée', STRUCTURE_SUPPRIMEE: 'Structure supprimée',
  ACTUALITE_PUBLIEE: 'Actualité publiée', ACTUALITE_MODIFIEE: 'Actualité modifiée', ACTUALITE_SUPPRIMEE: 'Actualité supprimée',
  PRATICIEN_VERIFIED: 'Professionnel validé', PRATICIEN_REJECTED: 'Professionnel refusé', PRATICIEN_PENDING: 'Professionnel remis en attente',
  COMPTE_SUSPENDU: 'Compte suspendu', COMPTE_REACTIVE: 'Compte réactivé',
  FORMATION_AJOUTEE: 'Formation ajoutée', FORMATION_MODIFIEE: 'Formation modifiée', FORMATION_SUPPRIMEE: 'Formation supprimée',
  RELEVE_PREPARE: 'Relevés de reversement préparés', REVERSEMENT_PAYE: 'Reversement payé',
  FAQ_AJOUTEE: 'Question ajoutée', FAQ_MODIFIEE: 'Question modifiée', FAQ_SUPPRIMEE: 'Question supprimée',
};

export default function Audit() {
  const [page, setPage] = useState(0);
  const list = useLoad(() => api<Page<AuditRow>>(`/api/v1/admin/audit?page=${page}&size=50`), [page]);
  return (
    <>
      <PageHead title="Journal des actions" lead="Toutes les actions réalisées par les administrateurs, les plus récentes en premier." />
      <ErrorBox text={list.error} />
      {list.data && list.data.content.length === 0 ? <Empty text="Aucune action enregistrée pour l’instant." /> : (
        <table>
          <thead><tr><th>Date</th><th>Administrateur</th><th>Action</th><th>Détail</th></tr></thead>
          <tbody>
            {(list.data?.content ?? []).map((a) => (
              <tr key={a.id}>
                <td>{dateTime(a.createdAt)}</td>
                <td>{a.adminEmail ?? '–'}</td>
                <td>{LABELS[a.action] ?? a.action}</td>
                <td>{a.details ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {list.data && list.data.totalPages > 1 ? (
        <div className="form-actions">
          <button className="btn secondary small" disabled={page === 0} onClick={() => setPage(page - 1)}>← Plus récentes</button>
          <span className="hint">Page {page + 1} / {list.data.totalPages}</span>
          <button className="btn secondary small" disabled={page + 1 >= list.data.totalPages} onClick={() => setPage(page + 1)}>Plus anciennes →</button>
        </div>
      ) : null}
    </>
  );
}
