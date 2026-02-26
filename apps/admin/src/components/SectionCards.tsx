import { TrendingDown, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export function SectionCards() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card>
        <CardHeader>
          <CardDescription>Totalt intäkter</CardDescription>
          <CardTitle className="font-semibold text-2xl tabular-nums xl:text-3xl">1 250 kr</CardTitle>
          <CardAction>
            <Badge variant="outline">
              <TrendingUp className="size-3" />
              +12,5%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="flex gap-2 font-medium">
            Uppåt denna månad <TrendingUp className="size-4" />
          </div>
          <div className="text-muted-foreground">Besökare senaste 6 månaderna</div>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>Nya kunder</CardDescription>
          <CardTitle className="font-semibold text-2xl tabular-nums xl:text-3xl">1 234</CardTitle>
          <CardAction>
            <Badge variant="outline">
              <TrendingDown className="size-3" />
              -20%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="flex gap-2 font-medium">
            Ned 20% denna period <TrendingDown className="size-4" />
          </div>
          <div className="text-muted-foreground">Förvärv behöver uppmärksamhet</div>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>Aktiva konton</CardDescription>
          <CardTitle className="font-semibold text-2xl tabular-nums xl:text-3xl">45 678</CardTitle>
          <CardAction>
            <Badge variant="outline">
              <TrendingUp className="size-3" />
              +12,5%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="flex gap-2 font-medium">
            Stark användarretention <TrendingUp className="size-4" />
          </div>
          <div className="text-muted-foreground">Engagemang över målen</div>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>Tillväxttakt</CardDescription>
          <CardTitle className="font-semibold text-2xl tabular-nums xl:text-3xl">4,5%</CardTitle>
          <CardAction>
            <Badge variant="outline">
              <TrendingUp className="size-3" />
              +4,5%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="flex gap-2 font-medium">
            Stadig prestationsökning <TrendingUp className="size-4" />
          </div>
          <div className="text-muted-foreground">Möter tillväxtförväntningar</div>
        </CardFooter>
      </Card>
    </div>
  );
}
