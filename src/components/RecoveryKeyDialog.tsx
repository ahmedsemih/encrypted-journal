import { useState } from "react";
import { useI18n } from "../i18n";

interface Props {
  code: string;
  onDone: () => void;
}

/** Shows a freshly created recovery key exactly once. */
export function RecoveryKeyDialog({ code, onDone }: Props) {
  const { t } = useI18n();
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      /* clipboard unavailable: the key is selectable text */
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal recovery-dialog" role="dialog" aria-modal="true" aria-label={t.recovery.dialogTitle}>
        <h2>🔑 {t.recovery.dialogTitle}</h2>
        <p>{t.recovery.dialogIntro}</p>
        {/* Four groups per line so no group is ever split; copying still yields the dashed form. */}
        <div className="recovery-code" tabIndex={0} aria-label={code}>
          {code.split("-").map((group, i, all) => (
            <span key={i}>
              {group}
              {i < all.length - 1 && <span className="dash">-</span>}
            </span>
          ))}
        </div>
        <button onClick={copy}>{copied ? t.recovery.copied : t.recovery.copy}</button>
        <p className="warning">⚠️ {t.recovery.dialogWarning}</p>
        <label className="checkbox-line">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          {t.recovery.confirm}
        </label>
        <button className="primary" disabled={!saved} onClick={onDone}>
          {t.recovery.continue}
        </button>
      </div>
    </div>
  );
}
