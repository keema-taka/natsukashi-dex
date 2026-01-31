// app/providers.tsx
"use client";

import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";
import DiscordAssistant from "./components/DiscordAssistant";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <DiscordAssistant />
    </SessionProvider>
  );
}
