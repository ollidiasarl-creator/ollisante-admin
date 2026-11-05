import { useEffect, useId, useState } from 'react';

interface Place { city: string; localities: string[] }
const cache = new Map<string, Place[]>();

/** Villes et localités connues d'un pays (liste de référence + celles déjà saisies). */
function usePlaces(country: string) {
  const [places, setPlaces] = useState<Place[]>(() => cache.get(country) ?? []);
  useEffect(() => {
    if (!country) return setPlaces([]);
    if (cache.has(country)) return setPlaces(cache.get(country)!);
    let live = true;
    fetch(`/api/v1/facilities/places?countryCode=${encodeURIComponent(country)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((l: Place[]) => {
        cache.set(country, l);
        if (live) setPlaces(l);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [country]);
  return places;
}

/**
 * Ville et localité : listes déroulantes de suggestions selon le pays (on peut aussi taper un nom absent de la liste).
 * Ce sont ces valeurs que les patients retrouvent dans les filtres de recherche.
 */
export function PlaceInputs({ country, city, locality, onChange }: {
  country: string; city: string; locality: string; onChange: (city: string, locality: string) => void;
}) {
  const places = usePlaces(country);
  const id = useId();
  const key = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
  const current = places.find((p) => key(p.city) === key(city));
  return (
    <>
      <label className="field">Ville
        <input value={city} list={`${id}-c`} autoComplete="off" maxLength={100}
          placeholder={country ? 'Choisir ou taper' : 'Choisissez d’abord le pays'}
          onChange={(e) => onChange(e.target.value, key(e.target.value) === key(city) ? locality : '')} />
        <datalist id={`${id}-c`}>{places.map((p) => <option key={p.city} value={p.city} />)}</datalist>
      </label>
      <label className="field">Localité<span className="hint">Quartier ou commune</span>
        <input value={locality} list={`${id}-l`} autoComplete="off" maxLength={100}
          placeholder={current?.localities.length ? 'Choisir ou taper' : ''}
          onChange={(e) => onChange(city, e.target.value)} />
        <datalist id={`${id}-l`}>{(current?.localities ?? []).map((l) => <option key={l} value={l} />)}</datalist>
      </label>
    </>
  );
}
