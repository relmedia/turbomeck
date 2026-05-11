"use client";

import { useState, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { toast } from "react-toastify";

export type MailSettings = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  tlsServername: string;
};

const defaults: MailSettings = {
  host: "",
  port: 587,
  secure: false,
  user: "",
  password: "",
  from: "",
  tlsServername: "",
};

export default function MailAccountSettingsForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sending, setSending] = useState(false);
  const [testEmailTo, setTestEmailTo] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState<MailSettings>(defaults);

  useEffect(() => {
    fetch("/api/settings/mail")
      .then((r) => r.json())
      .then((data) => {
        setForm({
          host: data.host ?? "",
          port: Number(data.port) || 587,
          secure: Boolean(data.secure),
          user: data.user ?? "",
          password: data.password ?? "",
          from: data.from ?? "",
          tlsServername: data.tlsServername ?? "",
        });
      })
      .catch(() => toast.error("Kunde inte hämta inställningar"))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/settings/mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Kunde inte spara");
      }
      toast.success("Inställningar sparade");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunde inte spara");
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/settings/mail/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (data.success) {
        toast.success(data.message ?? "Anslutningen lyckades");
      } else {
        toast.error(data.error ?? "Anslutningen misslyckades");
      }
    } catch {
      toast.error("Kunde inte testa anslutningen");
    } finally {
      setTesting(false);
    }
  };

  const handleSendTestEmail = async () => {
    const to = testEmailTo.trim();
    if (!to || !to.includes("@")) {
      toast.error("Ange en giltig e-postadress");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/settings/mail/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, to }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success(data.message ?? "Testmail skickad");
      } else {
        toast.error(data.error ?? "Kunde inte skicka testmail");
      }
    } catch {
      toast.error("Kunde inte skicka testmail");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div className="py-8 text-center text-muted-foreground">Laddar...</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="mail-host">SMTP-värd</Label>
        <Input
          id="mail-host"
          type="text"
          placeholder="smtp.example.com"
          value={form.host}
          onChange={(e) => setForm((p) => ({ ...p, host: e.target.value }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="mail-port">Port</Label>
          <Input
            id="mail-port"
            type="number"
            placeholder="587"
            value={form.port || ""}
            onChange={(e) =>
              setForm((p) => ({ ...p, port: parseInt(e.target.value, 10) || 587 }))
            }
          />
        </div>
        <div className="flex items-end gap-2 pb-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.secure}
              onChange={(e) => setForm((p) => ({ ...p, secure: e.target.checked }))}
            />
            <span className="text-sm">TLS (secure)</span>
          </label>
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="mail-user">Användarnamn</Label>
        <Input
          id="mail-user"
          type="text"
          placeholder="användare@example.com"
          value={form.user}
          onChange={(e) => setForm((p) => ({ ...p, user: e.target.value }))}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="mail-password">Lösenord</Label>
        <div className="relative">
          <Input
            id="mail-password"
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            value={form.password}
            onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
            className="pr-10"
          />
          <button
            type="button"
            aria-label={showPassword ? "Dölj lösenord" : "Visa lösenord"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="mail-from">Avsändaradress (From)</Label>
        <Input
          id="mail-from"
          type="email"
          placeholder="noreply@example.com"
          value={form.from}
          onChange={(e) => setForm((p) => ({ ...p, from: e.target.value }))}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="mail-tls-servername">
          TLS-värdnamn (avancerat)
        </Label>
        <Input
          id="mail-tls-servername"
          type="text"
          placeholder="ex. prime4.inleed.net"
          value={form.tlsServername}
          onChange={(e) =>
            setForm((p) => ({ ...p, tlsServername: e.target.value }))
          }
        />
        <p className="text-xs text-muted-foreground">
          Lämna tomt om SMTP-värden har ett giltigt certifikat. Sätt detta om
          servern svarar med ett certifikat utställt på en annan värd
          (t.ex. delad SMTP hos Inleed/Loopia/One.com). Värdet används enbart
          för TLS-verifiering – anslutningen går fortfarande till SMTP-värden
          ovan.
        </p>
      </div>
      <div className="rounded-lg border border-dashed p-4 space-y-3">
        <Label htmlFor="test-email-to">Skicka testmail</Label>
        <div className="flex gap-2">
          <Input
            id="test-email-to"
            type="email"
            placeholder="mottagare@example.com"
            value={testEmailTo}
            onChange={(e) => setTestEmailTo(e.target.value)}
            className="flex-1"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={handleSendTestEmail}
            disabled={sending || !form.host || !testEmailTo.trim()}
          >
            {sending ? "Skickar..." : "Skicka testmail"}
          </Button>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleTestConnection}
          disabled={testing || !form.host}
        >
          {testing ? "Testar..." : "Testa anslutning"}
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Sparar..." : "Spara"}
        </Button>
      </div>
    </form>
  );
}
