"use client";

/**
 * Switches for the automated mail that goes to CUSTOMERS.
 *
 * These matter more than the admin toggles next to them. The shipping poller
 * sends these off PostNord's status every 30 minutes with nobody reviewing
 * them, so this is the only place the shop can stop one going out. Before this
 * existed, customer mail had no off switch of any kind — only the staff
 * notices were configurable.
 *
 * Saves through the same /api/settings/mail endpoint, which read-modify-writes,
 * so this card and the two beside it never overwrite each other's fields.
 */

import { useEffect, useState } from "react";
import { Label } from "@repo/ui/components/label";
import { Switch } from "@repo/ui/components/switch";
import { Button } from "@repo/ui/components/button";
import {
  Truck,
  MapPin,
  AlarmClock,
  PackageCheck,
  RotateCcw,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "react-toastify";

type FlagKey =
  | "shipmentDispatched"
  | "readyForPickup"
  | "pickupReminder"
  | "delivered"
  | "coreReturn";

type Flags = Record<FlagKey, boolean>;

const DEFAULT_FLAGS: Flags = {
  shipmentDispatched: true,
  readyForPickup: true,
  pickupReminder: true,
  delivered: true,
  coreReturn: true,
};

const EVENT_META: Array<{
  key: FlagKey;
  icon: LucideIcon;
  label: string;
  description: string;
}> = [
  {
    key: "shipmentDispatched",
    icon: Truck,
    label: "Skickad + spårlänk",
    description: "När PostNord först scannar paketet som på väg (EN_ROUTE).",
  },
  {
    key: "readyForPickup",
    icon: MapPin,
    label: "Klar att hämta",
    description: "När paketet kommit fram till ombudet och går att hämta.",
  },
  {
    key: "pickupReminder",
    icon: AlarmClock,
    label: "Påminnelse innan retur",
    description:
      "Två påminnelser om paketet ligger kvar. PostNord returnerar efter 3 dagar — en outhämtad retur kostar oss frakten.",
  },
  {
    key: "delivered",
    icon: PackageCheck,
    label: "Levererad",
    description: "När PostNord registrerat försändelsen som levererad.",
  },
  {
    key: "coreReturn",
    icon: RotateCcw,
    label: "Kärnretur",
    description:
      "Påminnelse till kunden före deadline, och en notis till er när den passerat.",
  },
];

function normalize(input: unknown): Flags {
  const out = { ...DEFAULT_FLAGS };
  if (input && typeof input === "object") {
    for (const key of Object.keys(DEFAULT_FLAGS) as FlagKey[]) {
      const v = (input as Record<string, unknown>)[key];
      if (typeof v === "boolean") out[key] = v;
    }
  }
  return out;
}

export default function CustomerNotificationsForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flags, setFlags] = useState<Flags>(DEFAULT_FLAGS);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings/mail", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { customerNotifications?: unknown };
        if (!cancelled) setFlags(normalize(data.customerNotifications));
      } catch {
        if (!cancelled) toast.error("Kunde inte läsa notisinställningar");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/settings/mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Only this field — the endpoint leaves everything else untouched.
        body: JSON.stringify({ customerNotifications: flags }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast.success("Sparat");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunde inte spara");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Laddar…
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <ul className="divide-y rounded-lg border bg-card">
        {EVENT_META.map(({ key, icon: Icon, label, description }) => {
          const inputId = `cust-notif-${key}`;
          return (
            <li key={key} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-md bg-muted p-1.5">
                  <Icon className="size-4 text-muted-foreground" aria-hidden />
                </div>
                <div className="space-y-0.5">
                  <Label htmlFor={inputId} className="text-sm font-medium leading-none">
                    {label}
                  </Label>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
              </div>
              <Switch
                id={inputId}
                checked={flags[key]}
                onCheckedChange={(checked) =>
                  setFlags((prev) => ({ ...prev, [key]: Boolean(checked) }))
                }
              />
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-muted-foreground">
        Avstängda utskick markeras inte som skickade — slår du på dem igen går de
        ut nästa gång jobbet kör.
      </p>

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
          {saving ? "Sparar…" : "Spara"}
        </Button>
      </div>
    </form>
  );
}
