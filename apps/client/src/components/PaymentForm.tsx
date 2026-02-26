import { PaymentFormInputs, paymentFormSchema } from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { ShoppingBagIcon } from "lucide-react";
import Image from "next/image";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import type { FC } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PaymentFormProps = {
  onComplete?: () => void;
};

const PaymentForm: FC<PaymentFormProps> = ({ onComplete }) => {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<PaymentFormInputs>({
    resolver: zodResolver(paymentFormSchema as any),
  });

  const handlePaymentForm: SubmitHandler<PaymentFormInputs> = (data) => {
    if (onComplete) onComplete();
  };

  const handleExpirationDateChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    let value = e.target.value.replace(/\D/g, ""); // Remove non-digits

    // Validate month as user types
    if (value.length >= 1) {
      const firstDigit = Number.parseInt(value.charAt(0), 10);
      // If first digit is > 1, it must be 0X format
      if (firstDigit > 1) {
        value = "0" + value;
      }
    }

    if (value.length >= 2) {
      const month = Number.parseInt(value.slice(0, 2));
      // Ensure month is between 01-12
      if (month > 12) {
        value = "12" + value.slice(2);
      } else if (month === 0) {
        value = "01" + value.slice(2);
      }
      value = value.slice(0, 2) + "/" + value.slice(2, 4);
    }

    setValue("expirationDate", value, { shouldValidate: true });
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={handleSubmit(handlePaymentForm)}
    >
      <div className="space-y-2">
        <Label htmlFor="cardHolder">Namn på kortinnehavare</Label>
        <Input
          id="cardHolder"
          placeholder="Ditt namn"
          {...register("cardHolder")}
          className={errors.cardHolder ? "border-destructive" : ""}
        />
        {errors.cardHolder && (
          <p className="text-xs text-destructive">{errors.cardHolder.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="cardNumber">Kortnummer</Label>
        <Controller
          name="cardNumber"
          control={control}
          render={({ field }) => (
            <Input
              {...field}
              id="cardNumber"
              type="text"
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="1234 5678 9012 3456"
              maxLength={19}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 16);
                const formatted = digits.replace(/(\d{4})(?=\d)/g, "$1 ");
                field.onChange(formatted);
              }}
              className={errors.cardNumber ? "border-destructive" : ""}
            />
          )}
        />
        {errors.cardNumber && (
          <p className="text-xs text-destructive">{errors.cardNumber.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="expirationDate">Utgångsdatum (MM/ÅÅ)</Label>
        <Input
          id="expirationDate"
          placeholder="MM/ÅÅ"
          maxLength={5}
          {...register("expirationDate")}
          onChange={handleExpirationDateChange}
          className={errors.expirationDate ? "border-destructive" : ""}
        />
        {errors.expirationDate && (
          <p className="text-xs text-destructive">
            {errors.expirationDate.message}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="cvv">CVV</Label>
        <Input
          id="cvv"
          placeholder="123"
          {...register("cvv")}
          className={errors.cvv ? "border-destructive" : ""}
        />
        {errors.cvv && (
          <p className="text-xs text-destructive">{errors.cvv.message}</p>
        )}
      </div>
      <div className="flex items-center gap-2 mt-4">
        <Image
          src="/klarna.png"
          alt="klarna"
          width={50}
          height={25}
          className="rounded-md"
        />
        <Image
          src="/cards.png"
          alt="klarna"
          width={50}
          height={25}
          className="rounded-md"
        />
        <Image
          src="/stripe.png"
          alt="klarna"
          width={50}
          height={25}
          className="rounded-md"
        />
      </div>
      <Button type="submit" className="w-full">
        Slutför köpet
        <ShoppingBagIcon className="w-4 h-4" />
      </Button>
    </form>
  );
};

export default PaymentForm;
