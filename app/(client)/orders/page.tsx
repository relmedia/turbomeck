import Container from "@/components/Container";
import { Card } from "@/components/ui/card";
import { getMyOrders } from "@/sanity/helpers";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import React from "react";

const OrdersPage = async () => {
  const { userId } = await auth();
  if (!userId) {
    return redirect("/");
  }
  const orders = await getMyOrders(userId);

  return (
    <Container className="py-10">
      {orders?.length ? (
        <Card>
          <p>Orders</p>
        </Card>
      ) : (
        <div>
          <h2>No Orders Found</h2>
        </div>
      )}
    </Container>
  );
};

export default OrdersPage;
