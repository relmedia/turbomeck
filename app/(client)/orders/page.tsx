import { requiredUser } from "@/hooks/requiredUser";
import React from "react";

const page = async () => {
  await requiredUser();
  return <div>OrderPage</div>;
};

export default page;
