import { cn } from "@/lib/utils";
import Link from "next/link";
import Image from "next/image";

interface Props {
  children: React.ReactNode;
  className?: string;
}

const Logo = ({ children, className }: Props) => {
  return (
    <Link href={"/"} className="flex md:gap-2">
      <Image
        priority
        src="/logo.svg"
        height={32}
        width={32}
        alt="Turbomeck"
        className="hidden lg:flex"
      />
      <h2
        className={cn(
          "text-2xl text-lightGreen font-semibold tracking-wider uppercase italic flex items-center",
          className
        )}>
        {children}
      </h2>
    </Link>
  );
};

export default Logo;
