"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Check, Loader2, Mail, Send } from "lucide-react";
import { useTranslation } from "@/i18n/context";
import { TurnstileWidget } from "./TurnstileWidget";
import { BRAND } from "@/lib/brand";

/**
 * Contact form in a modal, opened from the header.
 *
 * A modal rather than a page because it keeps the visitor where they were —
 * someone who is mid-browse and has a question shouldn't lose their place.
 * Validation mirrors the server's zod schema so the form fails fast locally,
 * but the server stays the authority.
 */

const SHOP_EMAIL = "shop@turbomeck.se";

export function ContactModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const reset = () => {
    setName("");
    setEmail("");
    setSubject("");
    setMessage("");
    setError("");
    setSent(false);
  };

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    // Clear on close so reopening doesn't show a stale success screen.
    if (!next) setTimeout(reset, 200);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSending(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          subject: subject.trim(),
          message: message.trim(),
          turnstileToken,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? t("contact.errorGeneric"));
        return;
      }
      setSent(true);
    } catch {
      setError(t("contact.errorGeneric"));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {sent ? (
          <div className="py-6 text-center">
            <span
              className="mx-auto flex size-12 items-center justify-center rounded-full"
              style={{ backgroundColor: BRAND.greenTint }}
            >
              <Check className="size-6" style={{ color: BRAND.greenInk }} />
            </span>
            <DialogTitle className="mt-4 text-lg font-semibold">
              {t("contact.sentTitle")}
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm">
              {t("contact.sentBody")}
            </DialogDescription>
            <Button
              className="mt-6 cursor-pointer"
              onClick={() => handleOpenChange(false)}
            >
              {t("contact.close")}
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-1">
              <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
                <Mail className="size-5" style={{ color: BRAND.greenInk }} />
                {t("contact.title")}
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm">
                {t("contact.lead")}
              </DialogDescription>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="contact-name" className="text-sm font-medium">
                    {t("contact.name")} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="contact-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    minLength={2}
                    maxLength={80}
                    required
                    className="h-10"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="contact-email" className="text-sm font-medium">
                    {t("contact.email")} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="contact-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    maxLength={254}
                    required
                    className="h-10"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="contact-subject" className="text-sm font-medium">
                  {t("contact.subject")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="contact-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={t("contact.subjectPlaceholder")}
                  minLength={2}
                  maxLength={120}
                  required
                  className="h-10"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="contact-message" className="text-sm font-medium">
                  {t("contact.message")} <span className="text-destructive">*</span>
                </Label>
                <textarea
                  id="contact-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t("contact.messagePlaceholder")}
                  minLength={10}
                  maxLength={4000}
                  required
                  rows={5}
                  className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
                <p className="text-right text-[11px] tabular-nums text-muted-foreground">
                  {message.trim().length}/4000
                </p>
              </div>

              <TurnstileWidget onToken={setTurnstileToken} className="flex justify-center" />

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button
                type="submit"
                className="w-full cursor-pointer"
                disabled={sending}
              >
                {sending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    {t("contact.sending")}
                  </>
                ) : (
                  <>
                    <Send className="mr-2 size-4" />
                    {t("contact.send")}
                  </>
                )}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                {t("contact.orEmail")}{" "}
                <a
                  href={`mailto:${SHOP_EMAIL}`}
                  className="font-medium underline underline-offset-2"
                >
                  {SHOP_EMAIL}
                </a>
              </p>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
