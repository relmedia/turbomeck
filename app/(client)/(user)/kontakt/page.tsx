import Container from "@/components/Container";
import Title from "@/components/Title";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import React from "react";

const kontakt = () => {
  return (
    <Container className="max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
      <Title className="text-3xl font-bold mb-6">Kontakta oss</Title>
      <p className="mb-6">
        Har du frågor om produkt, frakt eller något annat? Fyll i formuläret
        nedan så återkommer vi till dig så snart som möjligt.
      </p>
      <form className="space-y-4">
        <div className="space-y-0.5">
          <Label htmlFor="name">Namn</Label>
          <Input
            type="text"
            name="name"
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            required
          />
        </div>
        <div className="space-y-0.5">
          <Label htmlFor="name">E-post adress</Label>
          <Input
            type="email"
            id="email"
            name="email"
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            required
          />
        </div>
        <div className="space-y-0.5">
          <Label htmlFor="message">Meddelande</Label>
          <Textarea
            id="message"
            name="message"
            rows={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-md resize-none"
            required
          />
        </div>
        <button
          type="submit"
          className="bg-neutral-800 text-white px-6 py-3 rounded-md text-sm font-semibold hover:bg-neutral-800/80 hover:text-white hoverEffect">
          Skicka meddelande
        </button>
      </form>
    </Container>
  );
};

export default kontakt;
