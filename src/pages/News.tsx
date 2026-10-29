import { FormEvent, useState } from 'react';
import { api, Country, News, Page } from '../api';
import { Empty, ErrorBox, Modal, PageHead, date, errorText, useLoad } from '../ui';

const AUDIENCE = { ALL: 'Tout le monde', PATIENT: 'Patients', PRACTITIONER: 'Professionnels' } as const;

/** Réduit l'image à 1280 px de large en JPEG avant l'envoi (plus léger pour les réseaux mobiles). */
async function compress(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('image'))), 'image/jpeg', 0.8),
  );
}

export default function NewsPage() {
  const [page, setPage] = useState(0);
  const countries = useLoad(() => api<Country[]>('/api/v1/admin/countries'), []);
  const list = useLoad(() => api<Page<News>>(`/api/v1/news?size=20&page=${page}`), [page]);
  const [editing, setEditing] = useState<News | 'new' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const where = (code: string | null) =>
    code ? countries.data?.find((c) => c.code === code)?.nameFr ?? code : 'Toute l’Afrique';

  async function remove(n: News) {
    if (!window.confirm(`Supprimer « ${n.title} » ?`)) return;
    setActionError(null);
    try {
      await api(`/api/v1/admin/news/${n.id}`, { method: 'DELETE' });
      await list.reload();
    } catch (e) {
      setActionError(errorText(e));
    }
  }

  return (
    <>
      <PageHead title="Actualités" lead="Informations santé affichées sur l’accueil de l’application.">
        <button className="btn" onClick={() => setEditing('new')}>Publier une actualité</button>
      </PageHead>
      <ErrorBox text={list.error ?? actionError} />
      {list.data && list.data.content.length === 0 ? <Empty text="Aucune actualité publiée." /> : (
        <table>
          <thead><tr><th>Titre</th><th>Pays</th><th>Visible par</th><th>Média</th><th>Publiée le</th><th /></tr></thead>
          <tbody>
            {(list.data?.content ?? []).map((n) => (
              <tr key={n.id}>
                <td><strong>{n.title}</strong></td>
                <td>{where(n.countryCode)}</td>
                <td>{AUDIENCE[n.audience]}</td>
                <td>{[n.imageUrl ? 'Photo' : null, n.videoUrl ? 'Vidéo' : null, n.linkUrl ? 'Lien' : null].filter(Boolean).join(', ') || '–'}</td>
                <td>{date(n.publishedAt)}</td>
                <td className="actions">
                  <button className="btn small secondary" onClick={() => setEditing(n)}>Modifier</button>
                  <button className="btn small danger" onClick={() => void remove(n)}>Supprimer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {list.data && list.data.totalPages > 1 ? (
        <div className="form-actions">
          <button className="btn secondary small" disabled={page === 0} onClick={() => setPage(page - 1)}>← Précédentes</button>
          <span className="hint">Page {page + 1} / {list.data.totalPages}</span>
          <button className="btn secondary small" disabled={page + 1 >= list.data.totalPages} onClick={() => setPage(page + 1)}>Suivantes →</button>
        </div>
      ) : null}
      {editing ? (
        <NewsForm news={editing === 'new' ? null : editing} countries={countries.data ?? []}
          onClose={() => setEditing(null)} onSaved={list.reload} />
      ) : null}
    </>
  );
}

function NewsForm({ news, countries, onClose, onSaved }: {
  news: News | null; countries: Country[]; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [f, setF] = useState({
    title: news?.title ?? '', body: news?.body ?? '', linkUrl: news?.linkUrl ?? '', videoUrl: news?.videoUrl ?? '',
    countryCode: news?.countryCode ?? '', audience: news?.audience ?? 'ALL',
  });
  const [imageUrl, setImageUrl] = useState<string | null>(news?.imageUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', await compress(file), 'photo.jpg');
      setImageUrl((await api<{ url: string }>('/api/v1/admin/media', { method: 'POST', body: form })).url);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body = {
      title: f.title.trim(), body: f.body.trim() || null, imageUrl, linkUrl: f.linkUrl.trim() || null,
      videoUrl: f.videoUrl.trim() || null, countryCode: f.countryCode || null, audience: f.audience,
    };
    try {
      if (news) await api(`/api/v1/admin/news/${news.id}`, { method: 'PATCH', body });
      else await api('/api/v1/admin/news', { method: 'POST', body });
      await onSaved();
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={news ? 'Modifier l’actualité' : 'Publier une actualité'} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBox text={error} />
        <label className="field"><span>Titre<span className="req">*</span></span><input value={f.title} onChange={set('title')} maxLength={200} required /></label>
        <label className="field" style={{ marginTop: 12 }}>Texte<textarea value={f.body} onChange={set('body')} maxLength={5000} /></label>
        <div className="form-grid" style={{ marginTop: 12 }}>
          <label className="field">Photo (facultatif)
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => void upload(e.target.files?.[0])} />
            <span className="hint">{uploading ? 'Envoi…' : imageUrl ? 'Photo enregistrée.' : 'JPEG, PNG ou WebP'}</span>
          </label>
          {imageUrl ? (
            <div>
              <img src={imageUrl} alt="" style={{ width: '100%', maxHeight: 120, objectFit: 'cover', borderRadius: 8 }} />
              <button type="button" className="btn small danger" onClick={() => setImageUrl(null)}>Retirer la photo</button>
            </div>
          ) : null}
          <label className="field">Lien vidéo (YouTube…)<input value={f.videoUrl} onChange={set('videoUrl')} placeholder="https://" /></label>
          <label className="field">Lien « En savoir plus »<input value={f.linkUrl} onChange={set('linkUrl')} placeholder="https://" /></label>
          <label className="field">Pays
            <select value={f.countryCode} onChange={set('countryCode')}>
              <option value="">Toute l’Afrique</option>
              {countries.map((c) => <option key={c.code} value={c.code}>{c.nameFr}</option>)}
            </select>
          </label>
          <label className="field">Visible par
            <select value={f.audience} onChange={set('audience')}>
              {Object.entries(AUDIENCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>
        <div className="form-actions">
          <button className="btn" type="submit" disabled={saving || uploading}>{news ? 'Enregistrer' : 'Publier'}</button>
          <button className="btn secondary" type="button" onClick={onClose}>Annuler</button>
        </div>
      </form>
    </Modal>
  );
}
