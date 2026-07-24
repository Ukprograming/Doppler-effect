import {
  CheckIcon,
  MicrophoneIcon,
  NumberCircleFiveIcon,
  NumberCircleFourIcon,
  NumberCircleThreeIcon,
  NumberCircleTwoIcon,
} from "@phosphor-icons/react";

interface StepRailProps {
  baselineReady: boolean;
  measurementReady: boolean;
  analysisReady: boolean;
}

const steps = [
  { number: 1, label: "マイクの準備", Icon: MicrophoneIcon },
  { number: 2, label: "基準を測る", Icon: NumberCircleTwoIcon },
  { number: 3, label: "台車を測る", Icon: NumberCircleThreeIcon },
  { number: 4, label: "範囲を決める", Icon: NumberCircleFourIcon },
  { number: 5, label: "結果を見る", Icon: NumberCircleFiveIcon },
];

export function StepRail({
  baselineReady,
  measurementReady,
  analysisReady,
}: StepRailProps) {
  const completion = [
    true,
    baselineReady,
    measurementReady,
    analysisReady,
    analysisReady,
  ];

  return (
    <nav className="step-rail" aria-label="実験の手順">
      <p className="mb-5 text-xs font-bold tracking-[0.18em] text-slate-400">
        実験の手順
      </p>
      <ol className="space-y-1">
        {steps.map(({ number, label, Icon }, index) => (
          <li key={number}>
            <a className="step-link" href={`#step-${number}`}>
              <span
                className={`step-icon ${
                  completion[index] ? "step-icon-done" : ""
                }`}
              >
                {completion[index] && number !== 1 ? (
                  <CheckIcon size={16} weight="bold" aria-hidden="true" />
                ) : (
                  <Icon size={19} weight="regular" aria-hidden="true" />
                )}
              </span>
              <span>
                <span className="block font-mono text-[0.66rem] text-slate-400">
                  STEP {number}
                </span>
                <span className="text-sm font-semibold text-slate-700">
                  {label}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ol>
      <div className="mt-8 border-t border-slate-200 pt-5">
        <p className="text-xs leading-relaxed text-slate-500">
          音声と測定結果は、このブラウザ内だけで処理します。
        </p>
      </div>
    </nav>
  );
}
