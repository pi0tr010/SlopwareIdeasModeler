import { DEFAULT_BRIDGE_URL, useBridge, type ConsentPolicy } from "../agent/bridge";
import { t } from "../i18n";

const CURSOR_CONFIG = `{
  "mcpServers": {
    "slopware": {
      "command": "<install dir>/slopware-mcp"
    }
  }
}`;

export function AgentButton({ onClick }: { onClick: () => void }) {
  const status = useBridge((s) => s.status);
  return (
    <button className={"agent-button " + status} onClick={onClick} title={t("agent.status." + status)}>
      <span className="agent-dot" />
      {t("agent.button")}
    </button>
  );
}

export function AgentDialog({ onClose }: { onClose: () => void }) {
  const b = useBridge();
  const policies: ConsentPolicy[] = ["each", "session"];
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal agent-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>{t("agent.title")}</h2>
        <p className="hint">{t("agent.intro")}</p>

        <label className="field">
          <span>{t("agent.url")}</span>
          <input value={b.url} disabled={b.status !== "off"} placeholder={DEFAULT_BRIDGE_URL} onChange={(e) => b.setUrl(e.target.value)} />
        </label>

        <fieldset className="role">
          <legend>{t("agent.consent")}</legend>
          {policies.map((p) => (
            <label key={p} className="check">
              <input type="radio" name="agent-policy" checked={b.policy === p} disabled={b.status !== "off"} onChange={() => b.setPolicy(p)} /> {t("agent.policy." + p)}
            </label>
          ))}
        </fieldset>
        {b.policy === "session" && b.status === "off" && <p className="hint">{t("agent.sessionWarning")}</p>}

        <div className="agent-status">
          <span className={"agent-dot " + b.status} /> {t("agent.status." + b.status)}
          {b.sessionApproved && <small> ({t("agent.allApproved")})</small>}
        </div>

        {b.log.length > 0 && (
          <ul className="agent-log">
            {b.log.map((l, i) => (
              <li key={i} className={l.ok ? "" : "error"}>
                <small>{new Date(l.time).toLocaleTimeString()}</small> {l.text}
              </li>
            ))}
          </ul>
        )}

        <details>
          <summary>{t("agent.setup")}</summary>
          <p className="hint">{t("agent.setupText")}</p>
          <pre className="agent-config">{CURSOR_CONFIG}</pre>
        </details>

        <div className="modal-foot">
          {b.status === "off" ? (
            <button className="primary" onClick={b.connect}>
              {t("agent.connect")}
            </button>
          ) : (
            <button onClick={b.disconnect}>{t("agent.disconnect")}</button>
          )}
          <button onClick={onClose}>{t("common.close")}</button>
        </div>
      </div>
    </div>
  );
}

export function AgentConfirm() {
  const prompt = useBridge((s) => s.prompt);
  if (!prompt) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal agent-modal">
        <h2>{t("agent.confirmTitle")}</h2>
        <p>{t("agent.confirmText")}</p>
        <pre className="agent-call">{prompt.text}</pre>
        <div className="modal-foot">
          <button onClick={() => prompt.resolve("deny")}>{t("agent.deny")}</button>
          <button onClick={() => prompt.resolve("allowAll")}>{t("agent.allowAll")}</button>
          <button className="primary" autoFocus onClick={() => prompt.resolve("allow")}>
            {t("agent.allow")}
          </button>
        </div>
      </div>
    </div>
  );
}
