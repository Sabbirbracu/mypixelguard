// Sidebar update card, first-run consent question and the feedback popup. Port of the views in AppServices.swift.
import { useState } from "react";
import { BarChart3, CheckCircle2, CircleArrowDown, Heart, Star, X, XCircle } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { t } from "../i18n";
import { useServices } from "../services";
import { Button, Modal } from "./ui";

export function UpdateBanner() {
  const update = useServices((s) => s.update);
  const dismiss = useServices((s) => s.dismissUpdate);
  if (!update) return null;
  return (
    <div className="update-banner">
      <button type="button" className="grow" title={update.notes || t("update.download")} onClick={() => void openUrl(update.url)}>
        <CircleArrowDown size={20} color="var(--orange)" style={{ flex: "none" }} />
        <span className="stack" style={{ gap: 2 }}>
          <span style={{ fontSize: 11.5, fontWeight: 600 }}>{t("update.title")}</span>
          <span className="caption" style={{ color: "var(--accent-text)" }}>{t("update.body", update.version)}</span>
        </span>
      </button>
      <button type="button" className="icon-btn bare" title={t("update.dismiss")} aria-label={t("update.dismiss")} onClick={dismiss}><X size={11} strokeWidth={3} /></button>
    </div>
  );
}

const noop = () => undefined;

export function UsageConsentDialog() {
  const answer = useServices((s) => s.answerConsent);
  return (
    // Must be answered: Esc and clicks outside do nothing.
    <Modal onClose={noop} width={460}>
      <div className="stack sheet" style={{ gap: 16 }}>
        <div className="sheet-icon"><BarChart3 size={22} /></div>
        <div className="sheet-title">{t("consent.title")}</div>
        <div className="muted">{t("consent.body")}</div>
        <div className="stack" style={{ gap: 7, padding: 12, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="row top" style={{ gap: 8 }}><CheckCircle2 size={16} color="var(--success)" style={{ flex: "none", marginTop: 2 }} /><span>{t("consent.yes")}</span></div>
          <div className="row top" style={{ gap: 8 }}><XCircle size={16} color="var(--danger)" style={{ flex: "none", marginTop: 2 }} /><span>{t("consent.never")}</span></div>
        </div>
        <div className="caption">{t("consent.note")}</div>
        <div className="row">
          <Button variant="secondary" onClick={() => answer(false)}>{t("consent.decline")}</Button>
          <div className="spacer" />
          <Button autoFocus onClick={() => answer(true)}>{t("consent.accept")}</Button>
        </div>
      </div>
    </Modal>
  );
}

export function FeedbackDialog() {
  const { closeFeedback, feedbackLater, feedbackNever, sendFeedback } = useServices();
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const message = text.trim();
  return (
    <Modal onClose={sent ? closeFeedback : feedbackLater} width={460}>
      <div className="stack sheet" style={{ gap: 16 }}>
        {sent ? (
          <div className="stack" style={{ alignItems: "center", gap: 12, padding: "20px 0", textAlign: "center" }}>
            <Heart size={30} color="var(--orange)" fill="var(--orange)" />
            <div className="sheet-title" style={{ fontSize: 18 }}>{t("feedback.thanks")}</div>
            <div className="muted">{t("feedback.thanks.body")}</div>
          </div>
        ) : (
          <>
            <div className="sheet-title">{t("feedback.title")}</div>
            <div className="muted">{t("feedback.body")}</div>
            <div className="row" style={{ gap: 6 }} role="radiogroup">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" className="star" role="radio" aria-checked={rating === n} title={t("feedback.stars", n)} aria-label={t("feedback.stars", n)} onClick={() => setRating(n)}>
                  <Star size={26} color={n <= rating ? "var(--orange)" : "color-mix(in srgb, var(--secondary) 60%, transparent)"} fill={n <= rating ? "var(--orange)" : "none"} />
                </button>
              ))}
            </div>
            <textarea className="field" rows={5} value={text} placeholder={t("feedback.placeholder")} onChange={(e) => setText(e.target.value)} style={{ resize: "none", height: 110 }} />
            <div className="caption">{t("feedback.note")}</div>
          </>
        )}
        <div className="row">
          {sent ? (
            <><div className="spacer" /><Button autoFocus onClick={closeFeedback}>{t("feedback.close")}</Button></>
          ) : (
            <>
              <button type="button" className="link-btn" style={{ color: "var(--secondary)" }} onClick={feedbackNever}>{t("feedback.never")}</button>
              <div className="spacer" />
              <Button variant="secondary" onClick={feedbackLater}>{t("feedback.later")}</Button>
              <Button disabled={rating === 0 && !message} onClick={() => { setSent(true); void sendFeedback(rating, message); }}>{t("feedback.send")}</Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
