"use client";

import { ShoppingCart } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import emptyCart from "@/images/emptyCart.png";

export default function EmptyCart() {
  return (
    <div className="py-10 md:py-20 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="p-8 max-w-md w-full space-y-8">
        <motion.div
          animate={{
            scale: [1, 1.1, 1],
            rotate: [0, 5, -5, 0],
          }}
          transition={{
            repeat: Infinity,
            duration: 5,
            ease: "easeInOut",
          }}
          className="relative w-48 h-48 mx-auto">
          <Image
            src={emptyCart}
            alt="Empty shopping cart"
            layout="fill"
            objectFit="contain"
            className="drop-shadow-lg"
          />
          <motion.div
            animate={{
              x: [0, -10, 10, 0],
              y: [0, -5, 5, 0],
            }}
            transition={{
              repeat: Infinity,
              duration: 3,
              ease: "linear",
            }}
            className="absolute -top-4 -right-4 bg-blue-500 rounded-full p-2">
            <ShoppingCart size={24} className="text-white" />
          </motion.div>
        </motion.div>

        <div className="text-center space-y-4">
          <h2 className="text-3xl font-bold text-gray-800">
            Din varukorg är tom
          </h2>
          <p className="text-gray-600">
            Det ser ut som om du inte har lagt till något i din kundvagn ännu.
            Låt oss ändra på det och hitta några fantastiska produkter till dig!
          </p>
        </div>

        <div>
          <Link
            href="/"
            className="block bg-darkColor/5 border border-darkColor/20 text-center py-2.5 rounded-full text-sm font-semibold tracking-wide hover:border-darkColor hover:bg-darkColor hover:text-white hoverEffect">
            Upptäck våra produkter
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
