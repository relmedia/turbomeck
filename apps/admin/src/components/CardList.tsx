import Image from "next/image";
import Link from "next/link";
import { Card, CardContent, CardFooter, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";

const PRODUCT_API = process.env.NEXT_PUBLIC_PRODUCT_API_URL || "http://localhost:8000";

const latestTransactions = [
  {
    id: 1,
    title: "Betalningsorder",
    badge: "John Doe",
    image:
      "https://images.pexels.com/photos/91227/pexels-photo-91227.jpeg?auto=compress&cs=tinysrgb&w=800",
    count: 1400,
  },
  {
    id: 2,
    title: "Betalningsorder",
    badge: "Jane Smith",
    image:
      "https://images.pexels.com/photos/4969918/pexels-photo-4969918.jpeg?auto=compress&cs=tinysrgb&w=800",
    count: 2100,
  },
  {
    id: 3,
    title: "Betalningsorder",
    badge: "Michael Johnson",
    image:
      "https://images.pexels.com/photos/1681010/pexels-photo-1681010.jpeg?auto=compress&cs=tinysrgb&w=800",
    count: 1300,
  },
  {
    id: 4,
    title: "Betalningsorder",
    badge: "Lily Adams",
    image:
      "https://images.pexels.com/photos/712513/pexels-photo-712513.jpeg?auto=compress&cs=tinysrgb&w=800",
    count: 2500,
  },
  {
    id: 5,
    title: "Betalningsorder",
    badge: "Sam Brown",
    image:
      "https://images.pexels.com/photos/1680175/pexels-photo-1680175.jpeg?auto=compress&cs=tinysrgb&w=800",
    count: 1400,
  },
];

const CardList = async ({ title }: { title: string }) => {
  let popularProducts: { id: number; name: string; price: number; image: string }[] = [];
  if (title === "Populära Produkter") {
    try {
      const res = await fetch(`${PRODUCT_API}/api/products`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        popularProducts = (data.slice(0, 5) || []).map((p: { id: number; name: string; price: number; image: string | null; thumbnails?: string[] }) => ({
          id: p.id,
          name: p.name,
          price: typeof p.price === "number" ? p.price : parseFloat(p.price) || 0,
          image: p.image || p.thumbnails?.[0] || "/products/1g.png",
        }));
      }
    } catch {
      popularProducts = [];
    }
  }

  return (
    <div className="">
      <h1 className="text-lg font-medium mb-6">{title}</h1>
      <div className="flex flex-col gap-2">
        {title === "Populära Produkter" ? (
          popularProducts.length > 0 ? (
            popularProducts.map((item) => (
              <Link key={item.id} href={`/studio/products/${item.id}`}>
                <Card className="flex-row items-center justify-between gap-4 p-4 hover:bg-muted/50 transition-colors">
                  <div className="w-12 h-12 rounded-sm relative overflow-hidden shrink-0">
                    <Image
                      src={item.image}
                      alt={item.name}
                      fill
                      className="object-cover"
                      unoptimized={item.image.startsWith("/uploads/")}
                    />
                  </div>
                  <CardContent className="flex-1 p-0 min-w-0">
                    <CardTitle className="text-sm font-medium truncate">
                      {item.name}
                    </CardTitle>
                  </CardContent>
                  <CardFooter className="p-0 shrink-0">
                    {item.price.toLocaleString("sv-SE")} Kr
                  </CardFooter>
                </Card>
              </Link>
            ))
          ) : (
            <p className="text-sm text-muted-foreground py-4">
              Inga produkter att visa. Lägg till produkter i produktlistan.
            </p>
          )
        ) : (
          latestTransactions.map((item) => (
            <Card
              key={item.id}
              className="flex-row items-center justify-between gap-4 p-4"
            >
              <div className="w-12 h-12 rounded-sm relative overflow-hidden shrink-0">
                <Image
                  src={item.image}
                  alt={item.title}
                  fill
                  className="object-cover"
                />
              </div>
              <CardContent className="flex-1 p-0">
                <CardTitle className="text-sm font-medium">
                  {item.title}
                </CardTitle>
                <Badge variant="secondary">{item.badge}</Badge>
              </CardContent>
              <CardFooter className="p-0">{(item.count / 1000).toFixed(1)}K</CardFooter>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default CardList;
