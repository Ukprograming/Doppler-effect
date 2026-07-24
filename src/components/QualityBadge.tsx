import {
  CheckCircleIcon,
  WarningCircleIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import type { QualityLabel } from "../types";

interface QualityBadgeProps {
  label: QualityLabel;
  score?: number;
}

export function QualityBadge({ label, score }: QualityBadgeProps) {
  const Icon =
    label === "良好"
      ? CheckCircleIcon
      : label === "注意"
        ? WarningCircleIcon
        : XCircleIcon;
  const tone =
    label === "良好"
      ? "quality-good"
      : label === "注意"
        ? "quality-caution"
        : "quality-difficult";

  return (
    <span className={`quality-badge ${tone}`}>
      <Icon size={17} weight="bold" aria-hidden="true" />
      <span>{label}</span>
      {score !== undefined ? (
        <span className="font-mono text-[0.72rem] opacity-70">
          {Math.round(score * 100)}
        </span>
      ) : null}
    </span>
  );
}
