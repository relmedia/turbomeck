"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BellRing,
  Plus,
  Send,
  ShoppingCart,
  Star,
  Truck,
  UserMinus,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Switch } from "@repo/ui/components/switch";
import { toast } from "react-toastify";

type EventKey = "newOrder" | "newReview" | "userDeleted" | "shipmentBooked";

type NotificationFlags = Record<EventKey, boolean>;

type AdminNotificationsState = {
  enabled: boolean;
  raw: string;
  events: NotificationFlags;
};

const DEFAULT_FLAGS: NotificationFlags = {
  newOrder: true,
  newReview: true,
  userDeleted: true,
  shipmentBooked: true,
};

const EVENT_META: Array<{
  key: EventKey;
  icon: LucideIcon;
  label: string;
  description: string;
}> = [
  {
    key: "newOrder",
    icon: ShoppingCart,
    label: "Ny order",
    description: "En kund slutförde ett köp.",
  },
  {
    key: "newReview",
    icon: Star,
    label: "Ny review",
    description: "En recension har skickats in.",
  },
  {
    key: "userDeleted",
    icon: UserMinus,
    label: "Användare raderad",
    description: "En användare tog bort sitt konto (eller en admin gjorde det).",
  },
  {
    key: "shipmentBooked",
    icon: Truck,
    label: "Frakt bokad",
    description: "PostNord-spårningsnummer har genererats för en order.",
  },
];

function parseEmails(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\s,;]+/u)) {
    const trimmed = part.trim();
    if (!trimmed.includes("@")) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function isProbablyEmail(value: string): boolean {
  const v = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(v);
}

function normalizeFlags(input: unknown): NotificationFlags {
  const out = { ...DEFAULT_FLAGS };
  if (input && typeof input === "object") {
    for (const key of Object.keys(DEFAULT_FLAGS) as EventKey[]) {
      const v = (input as Record<string, unknown>)[key];
      if (typeof v === "boolean") out[key] = v;
    }
  }
  return out;
}

export default function AdminOrderNotificationsForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<AdminNotificationsState>({
    enabled: true,
    raw: "",
    events: DEFAULT_FLAGS,
  });
  const [draft, setDraft] = useState("");

  useEffect(() => {
    fetch("/api/settings/mail")
      .then((r) => r.json())
      .then((data) => {
        setState({
          enabled: data.adminNotificationsEnabled !== false,
          raw: data.adminNotificationEmails ?? "",
          events: normalizeFlags(data.adminNotifications),
        });
      })
      .catch(() => toast.error("Kunde inte hämta notisinställningar"))
      .finally(() => setLoading(false));
  }, []);

  const emails = useMemo(() => parseEmails(state.raw), [state.raw]);

  const updateRaw = (next: string[]) =>
    setState((p) => ({ ...p, raw: next.join(", ") }));

  const handleAdd = () => {
    const value = draft.trim();
    if (!value) return;
    if (!isProbablyEmail(value)) {
      toast.error("Ange en giltig e-postadress");
      return;
    }
    if (emails.some((e) => e.toLowerCase() === value.toLowerCase())) {
      toast.info("E-postadressen finns redan");
      setDraft("");
      return;
    }
    updateRaw([...emails, value]);
    setDraft("");
  };

  const handleRemove = (email: string) => {
    updateRaw(emails.filter((e) => e !== email));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/settings/mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminNotificationsEnabled: state.enabled,
          adminNotificationEmails: emails.join(", "),
          adminNotifications: state.events,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Kunde inte spara");
      }
      toast.success("Notisinställningar sparade");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunde inte spara");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-8 text-center text-muted-foreground">Laddar...</div>
    );
  }

  const noRecipients = emails.length === 0;
  const anyEventEnabled = Object.values(state.events).some(Boolean);

  return (
    <form onSubmit={handleSave} className="space-y-5">
      <div className="flex items-start justify-between gap-4 rounded-lg border bg-muted/30 p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-md bg-background p-2 shadow-sm">
            <BellRing className="size-4 text-foreground" aria-hidden />
          </div>
          <div className="space-y-1">
            <Label htmlFor="order-notifs-enabled" className="text-sm font-medium">
              Aktivera admin-notiser
            </Label>
            <p className="text-xs text-muted-foreground">
              Huvudströmbrytare för alla händelser nedan. När den är av
              skickas inga mejl alls.
            </p>
          </div>
        </div>
        <Switch
          id="order-notifs-enabled"
          checked={state.enabled}
          onCheckedChange={(checked) =>
            setState((p) => ({ ...p, enabled: Boolean(checked) }))
          }
          aria-label="Aktivera admin-notiser"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="order-notif-email">Mottagaradress</Label>
        <div className="flex gap-2">
          <Input
            id="order-notif-email"
            type="email"
            placeholder="admin@example.com"
            value={draft}
            disabled={!state.enabled}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
            className="flex-1"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={handleAdd}
            disabled={!state.enabled || !draft.trim()}
          >
            <Plus className="mr-1 size-4" aria-hidden />
            Lägg till
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Adresserna nedan tar emot mejl för varje aktiverad händelse.
        </p>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <span className="text-sm font-medium">
            Mottagare{" "}
            <span className="text-muted-foreground">({emails.length})</span>
          </span>
          <Send className="size-4 text-muted-foreground" aria-hidden />
        </div>
        {noRecipients ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Inga mottagare tillagda. Lägg till minst en adress för att aktivera
            notisutskick.
          </div>
        ) : (
          <ul className="divide-y">
            {emails.map((email) => (
              <li
                key={email}
                className="flex items-center justify-between gap-2 px-4 py-2.5"
              >
                <span className="truncate text-sm">{email}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => handleRemove(email)}
                  aria-label={`Ta bort ${email}`}
                  disabled={!state.enabled}
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Händelser</Label>
          <span className="text-xs text-muted-foreground">
            Välj vilka mejl som ska skickas
          </span>
        </div>
        <ul className="divide-y rounded-lg border bg-card">
          {EVENT_META.map(({ key, icon: Icon, label, description }) => {
            const checked = state.events[key];
            const inputId = `notif-event-${key}`;
            return (
              <li
                key={key}
                className="flex items-start justify-between gap-3 px-4 py-3"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-md bg-muted p-1.5">
                    <Icon
                      className="size-4 text-muted-foreground"
                      aria-hidden
                    />
                  </div>
                  <div className="space-y-0.5">
                    <Label
                      htmlFor={inputId}
                      className="text-sm font-medium leading-none"
                    >
                      {label}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {description}
                    </p>
                  </div>
                </div>
                <Switch
                  id={inputId}
                  checked={checked}
                  disabled={!state.enabled}
                  onCheckedChange={(next) =>
                    setState((p) => ({
                      ...p,
                      events: { ...p.events, [key]: Boolean(next) },
                    }))
                  }
                  aria-label={`Aktivera notis: ${label}`}
                />
              </li>
            );
          })}
        </ul>
      </div>

      {state.enabled && noRecipients && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Notiser är aktiverade men inga mottagare finns – inga mejl kommer
          att skickas förrän du lägger till en adress.
        </p>
      )}
      {state.enabled && !noRecipients && !anyEventEnabled && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Inga händelser är aktiverade – inga mejl kommer att skickas.
        </p>
      )}

      <div className="flex justify-end pt-1">
        <Button type="submit" disabled={saving}>
          {saving ? "Sparar..." : "Spara"}
        </Button>
      </div>
    </form>
  );
}
