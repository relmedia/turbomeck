import { TrendingDown, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export type DashboardStats = {
  revenue: { thisMonth: number; change: number };
  newCustomers: { count: number; change: number };
  totalUsers: { count: number; change: number };
  growthRate: number;
};

function formatChange(change: number): string {
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toLocaleString("sv-SE")}%`;
}

export function SectionCards({ stats }: { stats: DashboardStats }) {
  const { revenue, newCustomers, totalUsers, growthRate } = stats;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card>
        <CardHeader>
          <CardDescription>Totalt intäkter</CardDescription>
          <CardTitle className="font-semibold text-2xl tabular-nums xl:text-3xl">
            {revenue.thisMonth.toLocaleString("sv-SE")} kr
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              {revenue.change >= 0 ? (
                <><TrendingUp className="size-3" />{formatChange(revenue.change)}</>
              ) : (
                <><TrendingDown className="size-3" />{formatChange(revenue.change)}</>
              )}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="flex gap-2 font-medium">
            {revenue.change >= 0 ? (
              <>Uppåt denna månad <TrendingUp className="size-4" /></>
            ) : (
              <>Ned denna månad <TrendingDown className="size-4" /></>
            )}
          </div>
          <div className="text-muted-foreground">Intäkter denna månad (exkl. avbokade)</div>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>Nya kunder</CardDescription>
          <CardTitle className="font-semibold text-2xl tabular-nums xl:text-3xl">
            {newCustomers.count.toLocaleString("sv-SE")}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              {newCustomers.change >= 0 ? (
                <><TrendingUp className="size-3" />{formatChange(newCustomers.change)}</>
              ) : (
                <><TrendingDown className="size-3" />{formatChange(newCustomers.change)}</>
              )}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="flex gap-2 font-medium">
            {newCustomers.change >= 0 ? (
              <>Fler nya kunder <TrendingUp className="size-4" /></>
            ) : (
              <>Färre nya kunder <TrendingDown className="size-4" /></>
            )}
          </div>
          <div className="text-muted-foreground">Registrerade denna månad</div>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>Aktiva konton</CardDescription>
          <CardTitle className="font-semibold text-2xl tabular-nums xl:text-3xl">
            {totalUsers.count.toLocaleString("sv-SE")}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              {totalUsers.change >= 0 ? (
                <><TrendingUp className="size-3" />{formatChange(totalUsers.change)}</>
              ) : (
                <><TrendingDown className="size-3" />{formatChange(totalUsers.change)}</>
              )}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="flex gap-2 font-medium">
            {totalUsers.change >= 0 ? (
              <>Nyregistreringar upp <TrendingUp className="size-4" /></>
            ) : (
              <>Nyregistreringar ner <TrendingDown className="size-4" /></>
            )}
          </div>
          <div className="text-muted-foreground">Totalt antal registrerade användare</div>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>Tillväxttakt</CardDescription>
          <CardTitle className="font-semibold text-2xl tabular-nums xl:text-3xl">
            {formatChange(growthRate)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              {growthRate >= 0 ? (
                <><TrendingUp className="size-3" />{formatChange(growthRate)}</>
              ) : (
                <><TrendingDown className="size-3" />{formatChange(growthRate)}</>
              )}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="flex gap-2 font-medium">
            {growthRate >= 0 ? (
              <>Intäktstillväxt <TrendingUp className="size-4" /></>
            ) : (
              <>Intäktsminskning <TrendingDown className="size-4" /></>
            )}
          </div>
          <div className="text-muted-foreground">Månad mot månad (intäkter)</div>
        </CardFooter>
      </Card>
    </div>
  );
}
