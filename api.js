const BraviaApi = (() => {
  const DEFAULT_TIMEOUT_MS = 6000;

  // Default Versions (funktioniert für viele Modelle)
  const SERVICE_DEFAULTS = {
    "/sony/system":    { path: "/sony/system",    version: "1.0" },
    "/sony/audio":     { path: "/sony/audio",     version: "1.0" },
    "/sony/appControl":{ path: "/sony/appControl",version: "1.0" },
    "/sony/avContent": { path: "/sony/avContent", version: "1.0" }
  };

  function normalizeBaseUrl(url) {
    if (!url) return "";
    return url.trim().replace(/\/+$/, "");
  }

  // -----------------------------
  function storageGet(area, keys) {
    return new Promise((resolve, reject) => {
      const normalizedKeys = (typeof keys === "undefined") ? null : keys;
      area.get(normalizedKeys, (result) => {
        const err = chrome.runtime?.lastError;
        if (err) reject(err);
        else resolve(result || {});
      });
    });
  }

  function storageSet(area, items) {
    return new Promise((resolve, reject) => {
      area.set(items, () => {
        const err = chrome.runtime?.lastError;
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async function getActiveProfile() {
    const { profiles, activeProfileId } = await storageGet(chrome.storage.local, ["profiles", "activeProfileId"]);
    const list = Array.isArray(profiles) ? profiles : [];
    const active = list.find(p => p.id === activeProfileId) || list[0] || null;
    return { list, active };
  }

  async function setProfiles(profiles, activeProfileId) {
    await storageSet(chrome.storage.local, { profiles, activeProfileId });
  }

  function withTimeout(timeoutMs) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    return { controller, clear: () => clearTimeout(t) };
  }

  function normalizeParams(params) {
    // Viele Bravia-Methoden mögen leere Params nicht -> [{}] statt []
    if (!Array.isArray(params) || params.length === 0) return [{}];
    return params;
  }

  async function rpc(servicePath, method, params = [], opts = {}) {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const version = opts.version ?? (SERVICE_DEFAULTS[servicePath]?.version ?? "1.0");

    const { active } = await getActiveProfile();
    if (!active?.url || !active?.psk) throw new Error("TV URL oder PSK fehlt.");

    const base = normalizeBaseUrl(active.url);
    const endpoint = `${base}${servicePath}`;

    const { controller, clear } = withTimeout(timeoutMs);
    try {
      const body = {
        jsonrpc: "2.0",
        method,
        params: normalizeParams(params),
        id: 1,
        version // <- WICHTIG
      };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Auth-PSK": active.psk
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      if (json?.error?.length) {
        throw new Error(`API Fehler: ${JSON.stringify(json.error)}`);
      }
      return json;
    } finally {
      clear();
    }
  }

  async function irccSend(code, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const { active } = await getActiveProfile();
    if (!active?.url || !active?.psk) throw new Error("TV URL oder PSK fehlt.");

    const base = normalizeBaseUrl(active.url);
    const endpoint = `${base}/sony/IRCC`;

    const { controller, clear } = withTimeout(timeoutMs);
    try {
      const xml =
`<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
            s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1">
      <IRCCCode>${code}</IRCCCode>
    </u:X_SendIRCC>
  </s:Body>
</s:Envelope>`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=UTF-8",
          "SOAPACTION": "\"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC\"",
          "X-Auth-PSK": active.psk
        },
        body: xml,
        signal: controller.signal
      });

      if (!res.ok) throw new Error(`IRCC HTTP ${res.status} ${res.statusText}`);
      return true;
    } finally {
      clear();
    }
  }

  // High-level APIs
  const System = {
    async getPowerStatus() {
      // Manche Modelle wollen version "1.0" und params [{}]
      const r = await rpc("/sony/system", "getPowerStatus", [], { version: "1.0" });
      return r?.result?.[0] || null;
    },
    async setPowerStatus(on) {
      // Manche Modelle nutzen "1.0"
      return rpc("/sony/system", "setPowerStatus", [{ status: !!on }], { version: "1.0" });
    },
    async getRemoteControllerInfo() {
      // Häufig "1.0"
      const r = await rpc("/sony/system", "getRemoteControllerInfo", [], { version: "1.0" });
      return r?.result || null;
    }
  };

  const Audio = {
    async getVolumeInformation() {
      const r = await rpc("/sony/audio", "getVolumeInformation", [], { version: "1.0" });
      return r?.result?.[0] || [];
    },
    async setAudioVolume(volume) {
      // Einige Modelle erwarten volume als String
      return rpc("/sony/audio", "setAudioVolume", [{ target: "speaker", volume: String(volume) }], { version: "1.0" });
    },
    async setAudioMute(mute) {
      return rpc("/sony/audio", "setAudioMute", [{ status: !!mute }], { version: "1.0" });
    }
  };

  const AppControl = {
    async getApplicationList() {
      const r = await rpc("/sony/appControl", "getApplicationList", [], { version: "1.0" });
      return r?.result?.[0] || [];
    },
    async setActiveApp(uri) {
      return rpc("/sony/appControl", "setActiveApp", [{ uri }], { version: "1.0" });
    }
  };

  const AvContent = {
    async getCurrentExternalInputsStatus() {
      const r = await rpc("/sony/avContent", "getCurrentExternalInputsStatus", [], { version: "1.0" });
      return r?.result?.[0] || [];
    },
    async setPlayContent(uri) {
      return rpc("/sony/avContent", "setPlayContent", [{ uri }], { version: "1.0" });
    }
  };

  return {
    normalizeBaseUrl,
    getActiveProfile,
    setProfiles,
    rpc,
    irccSend,
    System,
    Audio,
    AppControl,
    AvContent
  };
})();