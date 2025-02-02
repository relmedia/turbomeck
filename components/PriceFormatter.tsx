import { twMerge } from "tailwind-merge";

interface Props {
  amount: number | undefined;
  className?: string;
}

const PriceFormatter = ({ amount, className }: Props) => {
  const roundedAmount = amount ? Math.ceil(amount) : 0;
  const formattedPrice = roundedAmount
    .toLocaleString("sv-SE", {
      currency: "SEK",
      style: "currency",
      minimumFractionDigits: 0,
    })
    .replace(/,/g, "");
  return (
    <span
      className={twMerge("text-sm font-semibold text-darkColor", className)}>
      {formattedPrice}
    </span>
  );
};

export default PriceFormatter;
