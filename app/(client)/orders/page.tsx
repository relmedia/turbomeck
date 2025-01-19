import { requiredUser } from "@/hooks/requiredUser";
import { getMyOrders } from "@/sanity/helpers";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import React from "react";

const OrdersPage = async () => {
  await requiredUser();
  const { userId } = await auth();
  if (!userId) {
    return redirect("/");
  }
  const orders = await getMyOrders(userId);
  console.log(orders);

  return <div>OrdersPage</div>;
};

export default OrdersPage;
