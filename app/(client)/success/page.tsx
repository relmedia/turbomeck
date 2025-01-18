"use client";

import useCartStore from "@/store";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { motion } from "motion/react";
import { Check, Home, Package, ShoppingBag } from "lucide-react";
import Link from "next/link";

const SuccessPage = () => {
  const searchParams = useSearchParams();
  const orderNumber = searchParams.get("orderNumber");
  const sessionId = searchParams.get("session_id");
  const { resetCart } = useCartStore();
  const router = useRouter();
  useEffect(() => {
    if (!orderNumber && !sessionId) {
      router.push("/");
    } else {
      resetCart();
    }
  }, [orderNumber, sessionId, resetCart, router]);

  return (
    <div className="py-10 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-white rounded-2xl shadow-2xl px-8 py-12 max-w-xl w-full text-center">
        <motion.div className="w-24 h-24 bg-lightGreen rounded-full flex items-center justify-center mx-auto mb-8 shadow-lg">
          <Check className="text-white w-12 h-12" />
        </motion.div>
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Beställningen är bekräftad!
        </h1>
        <div className="space-y-4 mb-8 text-left">
          <p className="text-gray-700">
            Tack för ditt köp. Vi bearbetar din order och kommer att skicka den
            med Postnord snart. Ett bekräftelsemeddelande med dina
            beställningsuppgifter kommer skickas till din e-post inom kort.
          </p>
          <p className="text-gray-700">
            Order Nummer:{" "}
            <span className="text-black font-semibold">{orderNumber}</span>
          </p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-8">
          <h2 className="font-semibold text-gray-900 mb-2">
            Vad händer härnäst?
          </h2>
          <ul className="text-gray-700 text-sm space-y-1">
            <li>Kontrollera din e-post för orderbekräftelse</li>
            <li>Vi meddelar dig när din beställning har skickats</li>
            <li>Följ din beställningsstatus när som helst</li>
          </ul>
        </div>
        {/* Order tracker */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link
            href="/"
            className="flex items-center justify-center px-4 py-3 font-semibold bg-black text-white rounded-lg hover:bg-gray-800 transition-all duration-300 shadow-md">
            <Home className="w-5 h-5 mr-2" />
            Start
          </Link>
          <Link
            href="/orders"
            className="flex items-center justify-center px-4 py-3 font-semibold bg-white text-black border border-black rounded-lg hover:bg-gray-100 transition-all duration-300 shadow-md">
            <Package className="w-5 h-5 mr-2" />
            Ordrar
          </Link>
          <Link
            href="/"
            className="flex items-center justify-center px-4 py-3 font-semibold bg-black text-white rounded-lg hover:bg-gray-800 transition-all duration-300 shadow-md">
            <ShoppingBag className="w-5 h-5 mr-2" />
            Shoppa
          </Link>
        </div>
      </motion.div>
    </div>
  );
};

export default SuccessPage;
