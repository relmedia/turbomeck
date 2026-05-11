"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "../../lib/utils";

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const _values = React.useMemo<number[]>(
    () =>
      Array.isArray(value)
        ? (value as number[])
        : Array.isArray(defaultValue)
          ? (defaultValue as number[])
          : [min, max],
    [value, defaultValue, min, max],
  );

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none items-center select-none data-disabled:opacity-50",
        "data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn(
          "bg-muted/80 relative grow overflow-hidden rounded-full",
          "data-[orientation=horizontal]:h-1 data-[orientation=horizontal]:w-full",
          "data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1",
        )}
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className={cn(
            "bg-primary absolute",
            "data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full",
          )}
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          className={cn(
            "block size-5 shrink-0 rounded-full",
            "border-2 border-primary bg-background",
            "shadow-[0_1px_2px_rgba(0,0,0,0.08),0_2px_6px_rgba(0,0,0,0.06)]",
            "ring-0 ring-primary/15 transition-[box-shadow,transform] duration-150",
            "hover:ring-8 hover:scale-105",
            "focus-visible:ring-8 focus-visible:outline-none",
            "active:scale-95 cursor-grab active:cursor-grabbing",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
