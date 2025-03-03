import React from "react";
import { Clock, Mail, MapPin, Phone } from "lucide-react";

interface Props {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}

const data: Props[] = [
  {
    title: "Besök oss",
    subtitle: "Husholmsgatan 4, 425 30 Hisings Kärra",
    icon: <MapPin className="h-8 w-8 text-lightGreen transition-colors" />,
  },
  {
    title: "Ring oss",
    subtitle: "+46 70-916 50 06",
    icon: <Phone className="h-8 w-8 text-lightGreen transition-colors" />,
  },
  {
    title: "Våra öppetider",
    subtitle: "24/7",
    icon: <Clock className="h-8 w-8 text-lightGreen transition-colors" />,
  },
  {
    title: "Maila oss",
    subtitle: "info@turbomeck.se",
    icon: <Mail className="h-8 w-8 text-lightGreen transition-colors" />,
  },
];
const FooterTop = () => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5 border-b py-4">
      {data?.map((item, index) => (
        <ContactItem
          key={index}
          icon={item?.icon}
          title={item?.title}
          subtitle={item?.subtitle}
        />
      ))}
    </div>
  );
};

const ContactItem = ({ icon, title, subtitle }: Props) => {
  return (
    <div className="py-10 w-full">
      <div className="flex items-center h-full gap-5 group bg-[#F5F5F5] hover:bg-neutral-50 transition-colors p-4 rounded">
        {icon}
        <div>
          <h3 className="font-semibold text-gray-900 group-hover:text-neutral-800 transition-colors">
            {title}
          </h3>
          <p className="text-gray-600 text-sm mt-1 group-hover:text-gray-900 transition-colors">
            {subtitle}
          </p>
        </div>
      </div>
    </div>
  );
};

export default FooterTop;
