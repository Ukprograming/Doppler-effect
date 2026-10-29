import { useEffect, useRef, useState } from "react";

interface Props {
  devices: MediaDeviceInfo[];
  selectedDeviceId: string;
  onDeviceChange: (id: string) => void;
  onPrepare: () => Promise<boolean>;
  onClose: () => void;
  error: string | null;
}

export function MicrophoneDialog({ devices, selectedDeviceId, onDeviceChange, onPrepare, onClose, error }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [preparing, setPreparing] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal?.();
    return () => dialog?.close?.();
  }, []);

  const prepare = async () => {
    setPreparing(true);
    try {
      if (await onPrepare()) onClose();
    } finally {
      setPreparing(false);
    }
  };

  return (
    <dialog ref={dialogRef} className="microphone-dialog" aria-labelledby="microphone-title"
      onCancel={(event) => { event.preventDefault(); if (!preparing) onClose(); }}>
      <h2 id="microphone-title">マイクの準備</h2>
      <p>ブラウザでマイクの使用を許可してください。</p>
      {devices.length > 0 ? (
        <select className="compact-select" aria-label="使用する入力デバイス" value={selectedDeviceId}
          disabled={preparing} onChange={(event) => onDeviceChange(event.target.value)}>
          {devices.map((device, index) => (
            <option key={device.deviceId} value={device.deviceId}>{device.label || `マイク ${index + 1}`}</option>
          ))}
        </select>
      ) : null}
      {error ? <p role="alert" className="microphone-error">{error}</p> : null}
      <button type="button" className="action-button action-button-primary" disabled={preparing} onClick={() => void prepare()}>
        {preparing ? "マイクを確認中…" : error ? "もう一度試す" : "マイクを使う"}
      </button>
      <button type="button" className="action-button" disabled={preparing} onClick={onClose}>あとで</button>
    </dialog>
  );
}
