"use client";

import useCartStore from "@/store";
import { Check, Home, Package, ShoppingBag } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { MY_ORDERS_QUERYResult } from "@/sanity.types";
import { client } from "@/sanity/lib/client";
import { defineQuery } from "next-sanity";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/router";

const SuccessPage = () => {
  const [orders, setOrders] = useState<MY_ORDERS_QUERYResult>([]);
  const searchParams = useSearchParams();
  const orderNumber = searchParams.get("orderNumber");
  const clearCart = useCartStore((state) => state.resetCart);
  const { user } = useUser();
  const userId = user?.id;
  const sessionId = searchParams.get("sesssion_id");
  const router = useRouter();

  useEffect(() => {
    if (!orderNumber && !sessionId) {
      router.push("/");
    }
  });

  const query =
    defineQuery(`*[_type == 'order' && clerkUserId == $userId] | order(orderData desc){
  ...,products[]{
    ...,product->
  }
}`);

  useEffect(() => {
    if (orderNumber) {
      clearCart();
    }
  }, [orderNumber, clearCart]);

  useEffect(() => {
    const fetchData = async () => {
      if (!userId) {
        console.log("User ID not found. Cannot fetch orders.");
        return;
      }

      try {
        const ordersData = await client.fetch(query, { userId });
        setOrders(ordersData);
        console.log("Fetched orders:", ordersData);
      } catch (error) {
        console.error("Error fetching orders:", error);
      }
    };

    fetchData();
  }, [userId, query]);

  return (
    <div className="py-10 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-white rounded-2xl shadow-2xl px-8 py-12 max-w-xl w-full text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="w-24 h-24 bg-lightGreen rounded-full flex items-center justify-center mx-auto mb-8 shadow-lg">
          <Check className="text-white w-12 h-12" />
        </motion.div>

        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Beställning bekräftad!
        </h1>
        <div className="space-y-4 mb-8 text-left">
          <p className="text-gray-700">
            Tack för ditt köp! Vi bearbetar din beställning och kommer att
            skicka den snart. Ett bekräftelsemail med dina beställningsuppgifter
            kommer skickas till din inkorg inom kort.
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
            <li>Kolla din e-post för orderbekräftelse</li>
            <li>Vi meddelar dig när din beställning skickats</li>
            <li>Följ din beställningsstatus när som helst</li>
          </ul>
        </div>

        <div className="mb-8">
          <h3 className="font-semibold text-gray-900 mb-2">
            Senaste beställningarna
          </h3>
          <div className="space-y-2">
            {orders.map((order) => (
              <div
                key={order?._id}
                className="flex justify-between items-center bg-gray-50 p-2 rounded">
                <span className="text-gray-700 text-sm font-medium">
                  {order?._id}
                </span>
                <span className="text-sm font-medium px-2 py-1 bg-gray-200 rounded-full">
                  {order.status}
                </span>
              </div>
            ))}
          </div>
        </div>

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
