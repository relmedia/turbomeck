import Image from "next/image";
import Link from "next/link";

const Footer = () => {
  return (
    <div className="mt-16 flex flex-col items-center gap-8 md:flex-row md:items-start md:justify-between md:gap-0 bg-gray-800 p-8 rounded-lg">
      <div className="flex flex-col gap-4 items-center md:items-start">
        <Link href="/" className="flex items-center">
          <Image src="/logo.svg" alt="Turbomeck" width={36} height={36} />
          <p className="hidden md:block text-xl font-semibold tracking-wider italic text-lightGreen ms-2 text-white">
            TURBO
          </p>
          <p className="hidden md:block text-xl font-semibold tracking-wider italic text-white">
            MECK
          </p>
        </Link>
        <p className="text-sm text-gray-400">© 2025 Turbomeck</p>
        <p className="text-sm text-gray-400">Alla rättigheter reserverade</p>
      </div>
      <div className="flex flex-col gap-4 text-sm text-gray-400 items-center md:items-start">
        <p className="text-sm text-amber-50">Snabb länkar</p>
        <Link href="/about">Start</Link>
        <Link href="/privacy">Integritetspolicy</Link>
        <Link href="/terms">Användarvillkor</Link>
        <Link href="/terms">Frågor och svar</Link>
      </div>
      <div className="flex flex-col gap-4 text-sm text-gray-400 items-center md:items-start">
        <p className="text-sm text-amber-50">Produkter</p>
        <Link href="/about">Alla produkter</Link>
        <Link href="/contact">Nyheter</Link>
        <Link href="/privacy">Bästsäljare</Link>
        <Link href="/terms">Rea</Link>
      </div>
      <div className="flex flex-col gap-4 text-sm text-gray-400 items-center md:items-start">
        <p className="text-sm text-amber-50">Företaget</p>
        <Link href="/about">Om oss</Link>
        <Link href="/contact">Kontakt</Link>
        <Link href="/privacy">Blog</Link>
        <Link href="/terms">Användarvillkor</Link>
      </div>
      <div className="flex flex-col gap-4 text-sm text-gray-400 items-center md:items-start">
        <p className="text-sm text-amber-50">Kontakt</p>
        <a
          href="tel:+46701234567"
          className="hover:text-amber-50 transition-colors"
        >
          +46 70 123 45 67
        </a>
        <a
          href="mailto:info@turbomeck.se"
          className="hover:text-amber-50 transition-colors"
        >
          info@turbomeck.se
        </a>
        <a
          href="https://www.google.com/maps/search/?api=1&query=Husholmsgatan+4+425+30+Hisings+Kärra"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-amber-50 transition-colors"
        >
          Husholmsgatan 4
          <br />
          425 30 Hisings Kärra
        </a>
      </div>
    </div>
  );
};

export default Footer;
