import { CircleCheck, GitBranch, ScanText, ShieldCheck, Sparkles, UserCheck, Database, Zap } from "lucide-react";
import type { NodeType } from "@/config/pages/neo/agent-nodes";

export const NODE_ICON: Record<NodeType, typeof Zap> = {
  trigger: Zap,
  input: Database,
  processing: ScanText,
  validation: ShieldCheck,
  decision: GitBranch,
  ai: Sparkles,
  human: UserCheck,
  action: CircleCheck,
};

/** Colour says the family; the icon and the word say the type. */
export const NODE_TINT: Record<NodeType, string> = {
  trigger: "bg-pi-fill text-pi-ink-2",
  input: "bg-pi-fill text-pi-ink-2",
  processing: "bg-pi-brand-tint text-pi-brand",
  validation: "bg-pi-brand-tint text-pi-brand",
  decision: "bg-pi-brand-tint text-pi-brand",
  ai: "bg-pi-brand-tint text-pi-brand",
  human: "bg-pi-warning-bg text-pi-warning",
  action: "bg-pi-success-bg text-pi-success",
};
