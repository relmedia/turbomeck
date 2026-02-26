"use client";

import { Payment, columns } from "./columns";
import { DataTable } from "./data-table";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useState } from "react";

const MOCK_DATA: Payment[] = [
  { id: "728ed521", orderId: 812312, amount: 134, status: "pending", fullName: "John Doe", userId: "44", email: "johndoe@gmail.com", productName: "Wireless Headphones", productImage: "/products/1g.png", date: "2023-01-28", type: "sale" },
  { id: "728ed522", orderId: 812313, amount: 124, status: "success", fullName: "Jane Doe", userId: "35", email: "janedoe@gmail.com", productName: "Bluetooth Speaker", productImage: "/products/1g.png", date: "2023-01-27", type: "sale" },
  { id: "728ed523", orderId: 812314, amount: 167, status: "success", fullName: "Mike Galloway", userId: "11", email: "mikegalloway@gmail.com", productName: "Running Shoes", productImage: "/products/1g.png", date: "2023-01-26", type: "return" },
  { id: "728ed524", orderId: 812315, amount: 156, status: "failed", fullName: "Minerva Robinson", userId: "20", email: "minerbarobinson@gmail.com", productName: "Leather Wallet", productImage: "/products/1g.png", date: "2023-01-25", type: "sale" },
  { id: "728ed525", orderId: 812316, amount: 145, status: "success", fullName: "Mable Clayton", userId: "21", email: "mableclayton@gmail.com", productName: "Smart Watch", productImage: "/products/1g.png", date: "2023-01-24", type: "sale" },
  { id: "728ed526", orderId: 812317, amount: 189, status: "pending", fullName: "Nathan McDaniel", userId: "64", email: "nathanmcdaniel@gmail.com", productName: "Laptop Stand", productImage: "/products/1g.png", date: "2023-01-23", type: "sale" },
  { id: "728ed527", orderId: 812318, amount: 178, status: "success", fullName: "Myrtie Lamb", userId: "18", email: "myrtielamb@gmail.com", productName: "Desk Lamp", productImage: "/products/1g.png", date: "2023-01-22", type: "sale" },
  { id: "728ed528", orderId: 812319, amount: 190, status: "success", fullName: "Leona Bryant", userId: "59", email: "leonabryant@gmail.com", productName: "Backpack", productImage: "/products/1g.png", date: "2023-01-21", type: "sale" },
  { id: "728ed529", orderId: 812320, amount: 134, status: "failed", fullName: "Aaron Willis", userId: "69", email: "aaronwillis@gmail.com", productName: "USB Hub", productImage: "/products/1g.png", date: "2023-01-20", type: "return" },
  { id: "728ed52a", orderId: 812321, amount: 543, status: "success", fullName: "Joel Keller", userId: "18", email: "joelkeller@gmail.com", productName: "Office Chair", productImage: "/products/1g.png", date: "2023-01-19", type: "sale" },
  { id: "728ed52b", orderId: 812322, amount: 234, status: "pending", fullName: "Daniel Ellis", userId: "88", email: "danielellis@gmail.com", productName: "Monitor", productImage: "/products/1g.png", date: "2023-01-18", type: "sale" },
  { id: "728ed52c", orderId: 812323, amount: 345, status: "success", fullName: "Gordon Kennedy", userId: "80", email: "gordonkennedy@gmail.com", productName: "Keyboard", productImage: "/products/1g.png", date: "2023-01-17", type: "sale" },
];

type StatusTab = "all" | "completed" | "processed" | "returned" | "canceled";

const PaymentsPage = () => {
  const [statusTab, setStatusTab] = useState<StatusTab>("all");

  const filteredData = MOCK_DATA.filter((row) => {
    if (statusTab === "all") return true;
    if (statusTab === "completed") return row.status === "success";
    if (statusTab === "processed") return row.status === "success";
    if (statusTab === "returned") return row.type === "return";
    if (statusTab === "canceled") return row.status === "failed";
    return true;
  });

  const tabs: { value: StatusTab; label: string }[] = [
    { value: "all", label: "Alla" },
    { value: "completed", label: "Slutförda" },
    { value: "processed", label: "Behandlade" },
    { value: "returned", label: "Returer" },
    { value: "canceled", label: "Avbrutna" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Ordrar</h1>
          <Button size="sm" className="bg-foreground text-background hover:bg-foreground/90">
            <Plus className="w-4 h-4 mr-2" />
            Skapa order
          </Button>
        </div>
        <div className="flex gap-1 p-1 rounded-lg bg-muted/50 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusTab(tab.value)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                statusTab === tab.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <DataTable columns={columns} data={filteredData} />
    </div>
  );
};

export default PaymentsPage;
