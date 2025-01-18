"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

const NoProductAvailable = ({
  selectedTab,
  className,
}: {
  selectedTab: string;
  className?: string;
}) => {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-10 min-h-80 space-y-4 text-center bg-gray-100 rounded-lg w-full mt-10",
        className
      )}>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}>
        <h2 className="text-2xl font-bold text-gray-800">
          Inga produkter finns tillgängliga
        </h2>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="text-gray-600">
        Vi är ledsna, men det finns inga produkter i{" "}
        <span className="text-base font-semibold text-darkColor capitalize">
          {selectedTab}
        </span>{" "}
        kategorin för tillfället.
      </motion.p>

      <motion.div
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ repeat: Infinity, duration: 1.5 }}
        className="flex items-center space-x-2 text-blue-600">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Vi fyller på lagret inom kort</span>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="text-sm text-gray-500">
        Kom gärna tillbaka senare eller utforska våra andra produktkategorier.
      </motion.p>
    </div>
  );
};

export default NoProductAvailable;
