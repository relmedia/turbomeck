import Container from "@/components/Container";
import OrdersComponent from "@/components/OrdersComponent";
import Title from "@/components/Title";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Table, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getMyOrders } from "@/sanity/helpers";
import { auth } from "@clerk/nextjs/server";
import { FileX } from "lucide-react";
import Link from "next/link";
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
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-2xl md:text-3xl">Order Lista</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-auto">Order nummer</TableHead>
                    <TableHead className="hidden md:table-cell">
                      Datum
                    </TableHead>
                    <TableHead>Kund</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      E-post
                    </TableHead>
                    <TableHead>Totalt</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      Faktura nummer
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <OrdersComponent orders={orders} />
                <ScrollBar orientation="horizontal" />
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col items-center justify-center py-5 md:py-10 px-4">
          <FileX className="h-24 w-24 text-gray-400 mb-4" />
          <Title>Inga Ordrar hittades</Title>
          <div className="max-w-md text-center">
            <p className="mt-2 text-gray-600">
              Det ser ut som att du inte har genomfört några köp ännu.
            </p>
            <p className="text-gray-600">
              Börja shoppa för att se dina ordrar här.
            </p>
            <Button asChild className="mt-6">
              <Link href={"/"}>Utforska våra produkter</Link>
            </Button>
          </div>
        </div>
      )}
    </Container>
  );
};

export default OrdersPage;
