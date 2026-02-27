"use client";

import type { FC } from "react";
import { MapPin, Loader2 } from "lucide-react";

const WEEKDAY_SV: Record<string, string> = {
  Monday: "Måndag",
  Tuesday: "Tisdag",
  Wednesday: "Onsdag",
  Thursday: "Torsdag",
  Friday: "Fredag",
  Saturday: "Lördag",
  Sunday: "Söndag",
};

function translateOpeningHours(hours: string): string {
  return hours.replace(
    /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi,
    (m) => WEEKDAY_SV[m.charAt(0).toUpperCase() + m.slice(1).toLowerCase()] ?? m
  );
}
import { useState, useCallback } from "react";
import type { PostNordServicePoint } from "@/types";
import { POSTNORD_SERVICE_POINT_COUNTRIES } from "@/lib/postnord";

type ServicePointPickerProps = {
  postalCode: string;
  city: string;
  country?: string;
  selectedPoint: PostNordServicePoint | null;
  onSelect: (point: PostNordServicePoint | null) => void;
  disabled?: boolean;
};

const ServicePointPicker: FC<ServicePointPickerProps> = ({
  postalCode,
  city,
  country = "SE",
  selectedPoint,
  onSelect,
  disabled = false,
}) => {
  const [points, setPoints] = useState<PostNordServicePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSupported = POSTNORD_SERVICE_POINT_COUNTRIES.includes(
    country?.toUpperCase() as "SE" | "NO" | "DK"
  );

  const searchServicePoints = useCallback(async () => {
    if (!postalCode || postalCode.length < 3) {
      setError("Ange postnummer först (minst 3 tecken)");
      return;
    }
    if (!isSupported) {
      setError("PostNord ombud finns för Sverige, Norge och Danmark");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        postalCode,
        city: city || "",
        country: country || "SE",
      });
      const res = await fetch(`/api/postnord/servicepoints?${params}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Kunde inte hämta ombud");
      }
      setPoints(data.servicePoints ?? []);
      if (!data.servicePoints?.length) {
        setError("Inga PostNord-ombud hittades i närheten");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Något gick fel");
      setPoints([]);
    } finally {
      setLoading(false);
    }
  }, [postalCode, city, country, isSupported]);

  return (
    <div className="flex flex-col gap-2 mt-2 p-3 border border-gray-200 rounded-lg bg-gray-50/50">
      <p className="text-xs text-gray-600 font-medium">
        Leverans till PostNord-ombud (valfritt)
      </p>

      {!isSupported && (
        <p className="text-xs text-amber-600">
          PostNord ombud finns för Sverige, Norge och Danmark. För andra länder välj hemleverans.
        </p>
      )}

      {!selectedPoint ? (
        <>
          <button
            type="button"
            onClick={searchServicePoints}
            disabled={disabled || loading || postalCode.length < 3 || !isSupported}
            className="flex items-center justify-center gap-2 text-sm border border-gray-300 hover:border-gray-600 px-3 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <MapPin className="w-4 h-4" />
            )}
            {loading ? "Söker..." : "Hitta PostNord-ombud"}
          </button>

          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}

          {points.length > 0 && (
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
              {points.map((point) => (
                <button
                  key={point.servicePointId}
                  type="button"
                  onClick={() => {
                    onSelect(point);
                    setPoints([]);
                  }}
                  className="text-left p-2 border border-gray-200 rounded hover:border-gray-600 hover:bg-white transition-colors"
                >
                  <p className="text-sm font-medium">{point.name}</p>
                  <p className="text-xs text-gray-500">
                    {[point.address, point.postalCode, point.city]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  {point.openingHours && (
                    <p className="text-xs text-gray-400 mt-1">
                      {translateOpeningHours(point.openingHours)}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="flex items-start justify-between gap-2 p-2 border border-green-200 rounded-lg bg-green-50/50">
          <div>
            <p className="text-sm font-medium">{selectedPoint.name}</p>
            <p className="text-xs text-gray-600">
              {[selectedPoint.address, selectedPoint.postalCode, selectedPoint.city]
                .filter(Boolean)
                .join(", ")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="text-xs text-gray-500 hover:text-red-600"
          >
            Ändra
          </button>
        </div>
      )}
    </div>
  );
};

export default ServicePointPicker;
