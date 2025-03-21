import type React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import PriceFormatter from "./PriceFormatter";
import type { MY_ORDERS_QUERYResult } from "@/sanity.types";
import Image from "next/image";
import { urlFor } from "@/sanity/lib/image";
import { Button } from "./ui/button";
import Link from "next/link";

interface OrderDetailsDialogProps {
  order: MY_ORDERS_QUERYResult[number] | null;
  isOpen: boolean;
  onClose: () => void;
}

const OrderDetailsDialog: React.FC<OrderDetailsDialogProps> = ({
  order,
  isOpen,
  onClose,
}) => {
  if (!order) return null;

  console.log("order", order);

  // Calculate VAT (25% of the total price)
  const vatRate = 0.25;
  const totalPrice = order.totalPrice ?? 0;
  const vatAmount = Math.ceil((totalPrice * vatRate) / (1 + vatRate));
  const priceBeforeVat = totalPrice - vatAmount;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-auto overflow-hidden">
        <DialogHeader>
          <DialogTitle>Order Detaljer - {order.orderNumber}</DialogTitle>
        </DialogHeader>
        <div className="mt-4">
          <p>
            <strong>Kund:</strong> {order.customerName}
          </p>
          <p>
            <strong>E-post:</strong> {order.email}
          </p>
          <p>
            <strong>Datum:</strong>{" "}
            {order.orderDate && new Date(order.orderDate).toLocaleDateString()}
          </p>
          <p>
            <strong>Status:</strong>{" "}
            <span className="capitalize text-green-600 font-medium text-sm">
              {order.status}
            </span>
          </p>
          <p>
            <strong>Faktura Nummer:</strong> {order?.invoice?.number}
          </p>
          {order?.invoice && (
            <Button className="bg-transparent border text-darkColor/80 mt-2 hover:text-darkColor hover:bg-darkColor/10 hoverEffect ">
              {order?.invoice?.hosted_invoice_url && (
                <Link href={order?.invoice?.hosted_invoice_url} target="_blank">
                  Ladda ner Faktura
                </Link>
              )}
            </Button>
          )}
        </div>
        <Table className="border-b">
          <TableHeader>
            <TableRow>
              <TableHead>Produkt</TableHead>
              <TableHead>Antal</TableHead>
              <TableHead>Pris</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="border-b">
            {order.products?.map((product, index) => (
              <TableRow key={index}>
                <TableCell className="flex items-center gap-2">
                  {product?.product?.images && (
                    <Image
                      src={
                        urlFor(product?.product?.images[0]).url() ||
                        "/placeholder.svg"
                      }
                      alt="productImage"
                      width={50}
                      height={50}
                      className="border rounded-sm"
                    />
                  )}

                  {product?.product && product?.product?.name}
                </TableCell>
                <TableCell>{product?.quantity}</TableCell>
                <TableCell>
                  <PriceFormatter
                    amount={product?.product?.price}
                    className="text-black font-medium"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="mt-4 text-right flex items-center justify-end pt-4">
          <div className="w-56 flex flex-col gap-1">
            {order?.amountDiscount !== 0 && (
              <div className="w-full flex items-center justify-between">
                <strong>Rabatt: </strong>
                <PriceFormatter
                  amount={order?.amountDiscount}
                  className="text-black font-bold"
                />
              </div>
            )}
            {order?.amountDiscount !== 0 && (
              <div className="w-full flex items-center justify-between">
                <strong>Delsumma: </strong>
                <PriceFormatter
                  amount={
                    (order?.totalPrice as number) +
                    (order?.amountDiscount as number)
                  }
                  className="text-black font-bold"
                />
              </div>
            )}
            <div className="w-full flex items-center justify-between">
              <strong className="flex gap-1">
                Pris{" "}
                <p className="flex text-sm items-center font-normal">
                  (exkl. moms)
                </p>
                :{" "}
              </strong>
              <PriceFormatter
                amount={priceBeforeVat}
                className="text-black font-bold"
              />
            </div>
            <div className="w-full flex items-center justify-between">
              <strong>Moms: </strong>
              <PriceFormatter
                amount={vatAmount}
                className="text-black font-bold"
              />
            </div>
            <div className="w-full flex items-center justify-between">
              <strong className="flex gap-1">
                Totalt{" "}
                <p className="flex text-sm items-center font-normal">
                  (inkl. moms)
                </p>
                :{" "}
              </strong>
              <PriceFormatter
                amount={order?.totalPrice}
                className="text-black font-bold"
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OrderDetailsDialog;
