"use client";

import type { ReactNode } from "react";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import confetti from "canvas-confetti";
import type { Options as ConfettiOptions } from "canvas-confetti";

export type ConfettiRef = {
  fire: (options?: ConfettiOptions) => void | Promise<void>;
} | null;

type Props = React.ComponentPropsWithoutRef<"canvas"> & {
  options?: ConfettiOptions;
  manualstart?: boolean;
  children?: ReactNode;
};

const ConfettiComponent = forwardRef<ConfettiRef, Props>((props, ref) => {
  const { options, manualstart = false, children, className, ...rest } = props;
  const instanceRef = useRef<ReturnType<typeof confetti.create> | null>(null);

  const canvasRef = useCallback((node: HTMLCanvasElement | null) => {
    if (node !== null) {
      if (instanceRef.current) return;
      instanceRef.current = confetti.create(node, {
        resize: true,
        disableForReducedMotion: true,
      });
    } else {
      if (instanceRef.current) {
        instanceRef.current.reset();
        instanceRef.current = null;
      }
    }
  }, []);

  const fire = useCallback(
    async (opts: ConfettiOptions = {}) => {
      try {
        const fn = instanceRef.current;
        if (fn) await fn({ ...options, ...opts });
      } catch (error) {
        console.error("Confetti error:", error);
      }
    },
    [options]
  );

  const api = useMemo(() => ({ fire }), [fire]);

  useImperativeHandle(ref, () => api, [api]);

  useEffect(() => {
    if (!manualstart) {
      fire();
    }
  }, [manualstart, fire]);

  return (
    <canvas ref={canvasRef} className={className} {...rest}>
      {children}
    </canvas>
  );
});

ConfettiComponent.displayName = "Confetti";

export const Confetti = ConfettiComponent;
