"use client";
import React, { useEffect } from "react";

const ChatIcon = () => {
  useEffect(() => {
    // Ensure the script logic is added on the client side
    (function (
      w: Window & { chatbotConfig?: [string, string, { apiHost: string }] },
      d,
      s,
      ...args
    ) {
      // Create and append the chatbot container div
      const div = d.createElement("div");
      div.id = "aichatbot";
      d.body.appendChild(div);

      // Assign chatbotConfig to window
      w.chatbotConfig = args as [string, string, { apiHost: string }];

      // Locate the first script tag and insert the chatbot script
      const f = d.getElementsByTagName(s)[0];
      const j = d.createElement(s) as HTMLScriptElement; // Explicit cast to HTMLScriptElement
      j.defer = true;
      j.type = "module";
      j.src = "https://aichatbot.sendbird.com/index.js";
      f.parentNode?.insertBefore(j, f);
    })(
      window,
      document,
      "script",
      "79384041-C53D-4DE6-924C-ED9E4FD437F5",
      "avbGzEaChBzd9pBTJhlaQ",
      {
        apiHost: "https://api-cf-ap-5.sendbird.com",
      }
    );

    return () => {
      // Clean up the chatbot container div when unmounted
      const div = document.getElementById("aichatbot");
      if (div) {
        document.body.removeChild(div);
      }
    };
  }, []);

  return <div>ChatIcon</div>;
};

export default ChatIcon;
