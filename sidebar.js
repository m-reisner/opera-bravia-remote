const UI = (() => {
  const els = {
    tvSelect: document.getElementById("tvSelect"),
    profileEditor: document.getElementById("profileEditor"),
    tvName: document.getElementById("tvName"),
    tvUrl: document.getElementById("tvUrl"),
    psk: document.getElementById("psk"),
    btnEditProfile: document.getElementById("btnEditProfile"),
    btnAddProfile: document.getElementById("btnAddProfile"),
    btnRemoveProfile: document.getElementById("btnRemoveProfile"),
    btnSave: document.getElementById("btnSave"),
    btnTest: document.getElementById("btnTest"),
    msg: document.getElementById("msg"),

    statusLine: document.getElementById("statusLine"),
    stPower: document.getElementById("stPower"),
    stVol: document.getElementById("stVol"),
    stMute: document.getElementById("stMute"),

    volSlider: document.getElementById("volSlider"),
    volHint: document.getElementById("volHint"),
    btnMute: document.getElementById("btnMute"),
    btnPower: document.getElementById("btnPower"),

    appSelect: document.getElementById("appSelect"),
    btnLoadApps: document.getElementById("btnLoadApps"),
    btnLaunchApp: document.getElementById("btnLaunchApp"),

    inputSelect: document.getElementById("inputSelect"),
    btnLoadInputs: document.getElementById("btnLoadInputs"),
    btnSwitchInput: document.getElementById("btnSwitchInput")
  };

  function uid() {
    return "tv_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  function setMsg(text) {
    els.msg.textContent = text || "";
  }

  function setStatusLine(text) {
    els.statusLine.textContent = text || "—";
  }

  function option(el, value, label) {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = label;
    el.appendChild(o);
  }

  function clearSelect(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function formatPower(status) {
    if (!status) return "—";
    if (status === "active") return "An";
    if (status === "standby") return "Standby";
    return status;
  }

  function showEditor(show) {
    els.profileEditor.classList.toggle("hidden", !show);
  }

  return { els, uid, setMsg, setStatusLine, option, clearSelect, formatPower, showEditor };
})();

const IR = (() => {
  const fallback = {
    Power: "AAAAAQAAAAEAAAAVAw==",
    VolumeUp: "AAAAAQAAAAEAAAASAw==",
    VolumeDown: "AAAAAQAAAAEAAAATAw==",
    Mute: "AAAAAQAAAAEAAAAUAw==",
    ChannelUp: "AAAAAQAAAAEAAAAQAw==",
    ChannelDown: "AAAAAQAAAAEAAAARAw==",
    Up: "AAAAAQAAAAEAAAB0Aw==",
    Down: "AAAAAQAAAAEAAAB1Aw==",
    Left: "AAAAAQAAAAEAAAA0Aw==",
    Right: "AAAAAQAAAAEAAAAzAw==",
    Confirm: "AAAAAQAAAAEAAABlAw==",
    Home: "AAAAAQAAAAEAAABgAw==",
    Return: "AAAAAgAAAJcAAAAjAw==",
    Options: "AAAAAgAAAJcAAAA2Aw==",
    Input: "AAAAAQAAAAEAAAAlAw==",
    Display: "AAAAAQAAAAEAAAA6Aw=="
  };

  let map = { ...fallback };
  let editorForcedVisible = false;

  function setMapFromRemoteControllerInfo(result) {
    const list = Array.isArray(result) ? result[1] : null;
    if (!Array.isArray(list) || list.length === 0) return false;

    const m = {};
    for (const item of list) {
      if (!item?.name || !item?.value) continue;
      m[item.name] = item.value;
    }
    map = { ...fallback, ...m };
    return true;
  }

  function get(name) {
    return map[name] || null;
  }

  return { setMapFromRemoteControllerInfo, get };
})();

let pollTimer = null;
let busyVol = false;
let editorForcedVisible = false;

async function ensureDefaultProfile() {
  const { list, active } = await BraviaApi.getActiveProfile();
  if (list.length > 0 && active) return;

  const def = [{
    id: "tv_default",
    name: "Bravia",
    url: "",
    psk: ""
  }];
  await BraviaApi.setProfiles(def, def[0].id);
}

function shouldShowEditor(active) {
  if (editorForcedVisible) return true;
  if (!active) return false;
  return !active.url || !active.psk;
}

async function renderProfiles() {
  const { list, active } = await BraviaApi.getActiveProfile();

  UI.clearSelect(UI.els.tvSelect);
  for (const p of list) {
    UI.option(UI.els.tvSelect, p.id, p.name || p.id);
  }

  if (active) {
    UI.els.tvSelect.value = active.id;
    UI.els.tvName.value = active.name || "";
    UI.els.tvUrl.value = active.url || "";
    UI.els.psk.value = active.psk || "";
    UI.setStatusLine(active.url ? BraviaApi.normalizeBaseUrl(active.url) : "Nicht konfiguriert");
    UI.showEditor(shouldShowEditor(active));
  } else {
    UI.setStatusLine("—");
    UI.showEditor(false);
  }
}

async function setActiveProfile(profileId) {
  const { list } = await BraviaApi.getActiveProfile();
  const exists = list.find(p => p.id === profileId);
  if (!exists) return;

  editorForcedVisible = false;
  await BraviaApi.setProfiles(list, profileId);
  await renderProfiles();
  await reloadCapabilities();
}

async function saveCurrentProfile() {
  const { list, active } = await BraviaApi.getActiveProfile();
  if (!active) return;

  const updated = list.map(p => {
    if (p.id !== active.id) return p;
    return {
      ...p,
      name: UI.els.tvName.value.trim() || p.name,
      url: UI.els.tvUrl.value.trim(),
      psk: UI.els.psk.value
    };
  });

  await BraviaApi.setProfiles(updated, active.id);
  UI.setMsg("Gespeichert.");
  editorForcedVisible = false;

  await renderProfiles();
  await reloadCapabilities();
}

async function addProfile() {
  const { list } = await BraviaApi.getActiveProfile();
  const id = UI.uid();
  const p = { id, name: "Neuer TV", url: "", psk: "" };
  const updated = [...list, p];

  editorForcedVisible = true;
  await BraviaApi.setProfiles(updated, id);

  UI.setMsg("Profil hinzugefügt.");
  await renderProfiles();

  UI.els.tvName.focus();
  UI.els.tvName.select();
}

async function editProfile() {
  editorForcedVisible = true;
  const { active } = await BraviaApi.getActiveProfile();
  UI.showEditor(shouldShowEditor(active));
  UI.els.tvName.focus();
  UI.els.tvName.select();
}
 
async function removeProfile() {
  const { list, active } = await BraviaApi.getActiveProfile();
  if (!active) return;

  if (list.length <= 1) {
    UI.setMsg("Mindestens ein Profil muss vorhanden sein.");
    return;
  }

  const updated = list.filter(p => p.id !== active.id);
  const newActiveId = updated[0].id;

  editorForcedVisible = false;
  await BraviaApi.setProfiles(updated, newActiveId);

  UI.setMsg("Profil gelöscht.");
  await renderProfiles();
  await reloadCapabilities();
}

async function testConnection() {
  UI.setMsg("Teste Verbindung …");
  try {
    const power = await BraviaApi.System.getPowerStatus();
    UI.setMsg(`OK. PowerStatus: ${power?.status ?? "?"}`);
  } catch (e) {
    UI.setMsg(`Fehler: ${e.message}`);
  }
}

async function reloadCapabilities() {
  try {
    const rc = await BraviaApi.System.getRemoteControllerInfo();
    const ok = IR.setMapFromRemoteControllerInfo(rc);
    if (ok) UI.setMsg("IRCC-Codes geladen.");
  } catch {
    // fallback bleibt
  }
}

async function updateStatusOnce() {
  try {
    const power = await BraviaApi.System.getPowerStatus();
    UI.els.stPower.textContent = UI.formatPower(power?.status);

    const vols = await BraviaApi.Audio.getVolumeInformation();
    const sp = vols.find(v => v?.target === "speaker") || vols[0] || null;

    const vol = sp?.volume != null ? Number(sp.volume) : null;
    const mute = sp?.mute != null ? !!sp.mute : null;

    const isOn = power?.status === "active";
    UI.els.btnPower.classList.toggle("power-on", isOn);
    UI.els.btnPower.classList.toggle("power-off", !isOn);
    UI.els.stVol.textContent = vol == null ? "—" : String(vol);
    UI.els.stMute.textContent = mute == null ? "—" : (mute ? "Ja" : "Nein");

    if (!busyVol && vol != null && !Number.isNaN(vol)) {
      UI.els.volSlider.value = String(vol);
      UI.els.volHint.textContent = `Aktuell: ${vol}`;
    } else if (!busyVol) {
      UI.els.volHint.textContent = "—";
    }

    const { active } = await BraviaApi.getActiveProfile();
    UI.setStatusLine(active?.url ? BraviaApi.normalizeBaseUrl(active.url) : "Nicht konfiguriert");

    UI.showEditor(shouldShowEditor(active));
  } catch {
    UI.els.stPower.textContent = "—";
    UI.els.stVol.textContent = "—";
    UI.els.stMute.textContent = "—";
    UI.setStatusLine("Keine Verbindung");
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(updateStatusOnce, 5000);
  updateStatusOnce();
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

async function irccByName(name) {
  const code = IR.get(name);
  if (!code) throw new Error(`IRCC Code fehlt: ${name}`);
  await BraviaApi.irccSend(code);
}

async function toggleMute() {
  const vols = await BraviaApi.Audio.getVolumeInformation();
  const sp = vols.find(v => v?.target === "speaker") || vols[0] || null;
  const mute = sp?.mute != null ? !!sp.mute : false;
  await BraviaApi.Audio.setAudioMute(!mute);
  await updateStatusOnce();
}

async function togglePower() {
  const p = await BraviaApi.System.getPowerStatus();
  const isOn = p?.status === "active";
  await BraviaApi.System.setPowerStatus(!isOn);
  await updateStatusOnce();
}

async function setVolumeFromSlider() {
  const vol = Number(UI.els.volSlider.value);
  if (Number.isNaN(vol)) return;

  busyVol = true;
  UI.els.volHint.textContent = `Setze: ${vol} …`;
  try {
    await BraviaApi.Audio.setAudioVolume(vol);
    UI.els.volHint.textContent = `Gesetzt: ${vol}`;
  } catch (e) {
    UI.els.volHint.textContent = `Fehler: ${e.message}`;
  } finally {
    busyVol = false;
    await updateStatusOnce();
  }
}

async function loadApps() {
  UI.setMsg("Lade Apps …");
  try {
    const apps = await BraviaApi.AppControl.getApplicationList();
    UI.clearSelect(UI.els.appSelect);

    for (const a of apps) {
      const title = a?.title || a?.name || a?.uri || "App";
      UI.option(UI.els.appSelect, a?.uri || "", title);
    }

    UI.setMsg(`Apps geladen: ${apps.length}`);
  } catch (e) {
    UI.setMsg(`Fehler: ${e.message}`);
  }
}

async function launchSelectedApp() {
  const uri = UI.els.appSelect.value;
  if (!uri) {
    UI.setMsg("Keine App ausgewählt.");
    return;
  }
  UI.setMsg("Starte App …");
  try {
    await BraviaApi.AppControl.setActiveApp(uri);
    UI.setMsg("App gestartet.");
  } catch (e) {
    UI.setMsg(`Fehler: ${e.message}`);
  }
}

async function loadInputs() {
  UI.setMsg("Lade Inputs …");
  try {
    const inputs = await BraviaApi.AvContent.getCurrentExternalInputsStatus();
    UI.clearSelect(UI.els.inputSelect);

    for (const i of inputs) {
      const title = i?.title || i?.label || i?.uri || "Input";
      UI.option(UI.els.inputSelect, i?.uri || "", title);
    }

    UI.setMsg(`Inputs geladen: ${inputs.length}`);
  } catch (e) {
    UI.setMsg(`Fehler: ${e.message}`);
  }
}

async function switchSelectedInput() {
  const uri = UI.els.inputSelect.value;
  if (!uri) {
    UI.setMsg("Kein Input ausgewählt.");
    return;
  }
  UI.setMsg("Wechsle Input …");
  try {
    await BraviaApi.AvContent.setPlayContent(uri);
    UI.setMsg("Input gewechselt.");
  } catch (e) {
    UI.setMsg(`Fehler: ${e.message}`);
  }
}

function wireEvents() {
  UI.els.tvSelect.addEventListener("change", async () => {
    await setActiveProfile(UI.els.tvSelect.value);
    UI.setMsg("");
  });

  UI.els.btnAddProfile.addEventListener("click", addProfile);
  UI.els.btnEditProfile.addEventListener("click", editProfile);
  UI.els.btnRemoveProfile.addEventListener("click", removeProfile);

  UI.els.btnSave.addEventListener("click", saveCurrentProfile);
  UI.els.btnTest.addEventListener("click", testConnection);

  UI.els.btnMute.addEventListener("click", async () => {
    try { await toggleMute(); } catch (e) { UI.setMsg(`Fehler: ${e.message}`); }
  });

  UI.els.btnPower.addEventListener("click", async () => {
    try { await togglePower(); } catch (e) { UI.setMsg(`Fehler: ${e.message}`); }
  });

  UI.els.volSlider.addEventListener("input", () => {
    UI.els.volHint.textContent = `Wert: ${UI.els.volSlider.value}`;
  });

  UI.els.volSlider.addEventListener("change", async () => {
    try { await setVolumeFromSlider(); } catch (e) { UI.setMsg(`Fehler: ${e.message}`); }
  });

  document.querySelectorAll("button[data-ir]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const name = btn.dataset.ir;
      try {
        await irccByName(name);
      } catch (e) {
        UI.setMsg(`IR Fehler: ${e.message}`);
      }
    });
  });

  UI.els.btnLoadApps.addEventListener("click", loadApps);
  UI.els.btnLaunchApp.addEventListener("click", launchSelectedApp);

  UI.els.btnLoadInputs.addEventListener("click", loadInputs);
  UI.els.btnSwitchInput.addEventListener("click", switchSelectedInput);
}

async function init() {
  await ensureDefaultProfile();
  await renderProfiles();
  wireEvents();
  await reloadCapabilities();
  startPolling();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopPolling();
    else startPolling();
  });
}

init();