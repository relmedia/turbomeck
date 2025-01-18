"use client";

import Logo from "./Logo";
import { motion } from "motion/react";
import { Loader2 } from "lucide-react";

const Loading = () => {
  return (
    <div className="fixed min-h-screen w-full bg-white left-0 top-0 flex items-center justify-center">
      <div className="flex flex-col justify-center items-center gap-1">
        <Logo>
          Turbo<p className="text-neutral-800 items-center">meck</p>
        </Logo>
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="flex items-center space-x-2 text-darkColor">
          <Loader2 className="animate-spin text-lightGreen" />
          <span className="font-semibold tracking-wide">
            Turbomeck sidan laddas...
          </span>
        </motion.div>
      </div>
    </div>
  );
};

export default Loading;
