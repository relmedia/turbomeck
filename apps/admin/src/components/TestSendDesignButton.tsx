"use client";

/**
 * Sends one SAVED design as a test mail, from the design list.
 *
 * The designer has its own test button that exports whatever is on screen.
 * This one deliberately sends the stored row instead: after migrating twelve
 * templates the useful question is "what will customers actually get", and
 * answering it by opening each design in the editor just to press a button
 * there is twelve page loads of friction.
 *
 * No Unlayer here. The stored HTML is already the exported artefact, so this
 * needs nothing but a fetch — which is why the list page stays light.
 */

import { useState } from "react";
import { Button } from "@repo/ui/components/button";
import { Loader2, Send } from "lucide-react";
import { toast } from "react-toastify";

export default function TestSendDesignButton({ id, name }: { id: number; name: string }) {
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      /**
       * The list omits `html` because it is tens of kilobytes a row, so the
       * design is fetched by id here rather than held in the page.
       */
      const designRes = await fetch(`/api/settings/designs?id=${id}`, { cache: "no-store" });
      const design = (await designRes.json()) as {
        error?: string;
        subject?: string;
        html?: string;
        locale?: string;
      };
      if (!designRes.ok) throw new Error(design.error ?? `HTTP ${designRes.status}`);
      if (!design.html?.trim()) {
        throw new Error("Mallen har ingen sparad HTML — öppna den och spara en gång");
      }

      const res = await fetch("/api/settings/designs/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: design.subject,
          html: design.html,
          locale: design.locale,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        recipient?: string;
        unknown?: string[];
      };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);

      toast.success(`"${name}" skickad till ${json.recipient ?? "dig"}`);
      if (json.unknown && json.unknown.length > 0) {
        toast.warn(
          `Okända taggar i "${name}": ${json.unknown.map((t) => `{{${t}}}`).join(", ")} — de skickas som text.`,
          { autoClose: 10000 },
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunde inte skicka testmejlet");
    } finally {
      setSending(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={sending}
      onClick={() => void send()}
      title={`Skicka "${name}" till din e-post med exempeldata`}
    >
      {sending ? (
        <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
      ) : (
        <Send className="mr-1.5 size-3.5" aria-hidden />
      )}
      Testa
    </Button>
  );
}
