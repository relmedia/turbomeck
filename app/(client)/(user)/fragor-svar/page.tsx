import Container from "@/components/Container";
import Title from "@/components/Title";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { faqsData } from "@/constants";
import React from "react";

const fragor = () => {
  return (
    <Container className="max-w-5xl px-4 sm:px-6 lg:px-8 py-12">
      <Title className="text-3xl font-bold mb-6">Vanliga frågor & svar</Title>
      <Accordion
        type="single"
        collapsible
        className="w-full"
        defaultValue="item-0">
        {faqsData?.map((faq, index) => (
          <AccordionItem key={index} value={`item-${index}`} className="group">
            <AccordionTrigger className="text-left text-lg font-semibold text-neutral-800/80 group-hover:text-neutral-800 hover:no-underline hoverEffect">
              {faq?.question}
            </AccordionTrigger>
            <AccordionContent className="text-lg text-gray-600">
              {faq?.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Container>
  );
};

export default fragor;
