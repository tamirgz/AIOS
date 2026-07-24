import { Mail } from "lucide-react";
import type { ModuleManifest } from "@/core/modules/types";

export const gmailManifest: ModuleManifest = {
  id: "gmail",
  title: "Mail",
  icon: Mail,
  accent: "var(--color-flare)",
  nav: { order: 17 }, // after Calendar
  commands: [
    {
      id: "gmail.open",
      title: "Go to Mail",
      keywords: ["gmail", "mail", "email", "inbox"],
      href: "/m/gmail",
    },
  ],
};
