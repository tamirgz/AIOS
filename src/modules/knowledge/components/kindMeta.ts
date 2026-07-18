import {
  Camera,
  FileText,
  FolderGit2,
  Link2,
  Music2,
  Quote,
  Video,
  type LucideIcon,
} from "lucide-react";
import type { KnowledgeKind, KnowledgeStatus } from "../schema";

export const KIND_META: Record<
  KnowledgeKind,
  { icon: LucideIcon; label: string; color: string }
> = {
  github: { icon: FolderGit2, label: "repo", color: "var(--color-ion)" },
  instagram: { icon: Camera, label: "insta", color: "var(--color-flare)" },
  tiktok: { icon: Music2, label: "tiktok", color: "var(--color-plasma)" },
  youtube: { icon: Video, label: "video", color: "var(--color-flare)" },
  link: { icon: Link2, label: "link", color: "var(--color-solar)" },
  quote: { icon: Quote, label: "quote", color: "var(--color-violet)" },
  text: { icon: FileText, label: "note", color: "var(--color-ink-dim)" },
};

export const STATUS_META: Record<
  KnowledgeStatus,
  { label: string; color: string; pulse: boolean }
> = {
  captured: { label: "queued", color: "var(--color-ink-faint)", pulse: true },
  fetching: { label: "fetching…", color: "var(--color-ion)", pulse: true },
  enriching: {
    label: "analyzing…",
    color: "var(--color-solar)",
    pulse: true,
  },
  ready: { label: "ready", color: "var(--color-plasma)", pulse: false },
  error: { label: "error", color: "var(--color-flare)", pulse: false },
};
