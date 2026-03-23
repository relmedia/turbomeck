import { useState, useEffect } from "react";

let cachedCountry: string | null = null;
let fetchPromise: Promise<string | null> | null = null;

export function useGeoCountry() {
  const [country, setCountry] = useState<string | null>(cachedCountry);
  const [loading, setLoading] = useState(cachedCountry === null);

  useEffect(() => {
    if (cachedCountry !== null) {
      setCountry(cachedCountry);
      setLoading(false);
      return;
    }

    if (!fetchPromise) {
      fetchPromise = fetch("/api/geo/country")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const c = d?.country ?? null;
          cachedCountry = c;
          return c;
        })
        .catch(() => {
          cachedCountry = null;
          return null;
        });
    }

    fetchPromise.then((c) => {
      setCountry(c);
      setLoading(false);
    });
  }, []);

  return { country, isSweden: country === "SE", loading };
}
