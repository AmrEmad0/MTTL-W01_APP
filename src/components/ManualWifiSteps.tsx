import { localize } from "../i18n";
import type { ProvisionTarget } from "../types";
import { stripJoinPassword } from "../provisioning";

interface Props {
  stage: "join" | "reconnect";
  target: ProvisionTarget;
  homeSsid: string;
  busy: boolean;
  onContinue: () => void;
  onCancel: () => void;
}

export function ManualWifiSteps({
  stage,
  target,
  homeSsid,
  busy,
  onContinue,
  onCancel,
}: Props) {
  return localize(
    <div className="manual-wifi-steps">
      {stage === "join" ? (
        <>
          <h4>Join the strip's setup Wi-Fi</h4>
          <ol>
            <li>
              Open this computer's Wi-Fi menu and choose the strip's setup
              network.
            </li>
            <li>Enter the strip password shown below.</li>
            <li>
              The strip network may show “No internet”. Stay connected until
              settings have been sent.
            </li>
          </ol>
          {target.ssid ? (
            <div className="manual-wifi-credentials">
              <label className="field-label">
                Strip Wi-Fi name
                <input
                  className="input-field"
                  dir="auto"
                  readOnly
                  value={target.ssid}
                />
              </label>
              <label className="field-label">
                Password to join the strip
                <input
                  className="input-field"
                  dir="ltr"
                  readOnly
                  value={stripJoinPassword(target.ssid, target.password)}
                />
              </label>
            </div>
          ) : (
            <p>
              Use the strip's setup Wi-Fi password. To show its derived
              password, enter the setup Wi-Fi name under manual setup.
            </p>
          )}
          <p>
            This password joins the strip's temporary network. Your destination
            Wi-Fi credentials above will be sent to the strip.
          </p>
          <p>
            If you already joined the strip's Wi-Fi, continue now. Scanning
            again is not required.
          </p>
        </>
      ) : (
        <>
          <h4>Return to your destination Wi-Fi</h4>
          <p>
            The strip has accepted the settings and is restarting. Open this
            computer's Wi-Fi menu and reconnect to the network below.
          </p>
          <label className="field-label">
            Destination Wi-Fi SSID
            <input
              className="input-field"
              dir="auto"
              readOnly
              value={homeSsid}
            />
          </label>
          <p>
            After reconnecting, check the connection. This does not send the
            setup settings again.
          </p>
        </>
      )}
      <div className="manual-wifi-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={onContinue}
        >
          {stage === "join"
            ? "I am connected — send settings"
            : "I reconnected — check connection"}
        </button>
        <button
          type="button"
          className="btn btn-subtle"
          disabled={busy}
          onClick={onCancel}
        >
          Back to available devices
        </button>
      </div>
    </div>,
  );
}
