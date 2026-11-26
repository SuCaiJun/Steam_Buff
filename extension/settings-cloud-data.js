/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 云加密数据分区、工具凭据绑定及成就译文合并
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */

((root) => {
  "use strict";

  const cloud = root.STSettingsCloud;
  const vault = root.STSettingsVault;
  const text = new TextEncoder();
  const model = root.STAchievementTranslations;
  const sections = ["achievements", "groups"];
  const object = value => value && typeof value === "object" && !Array.isArray(value);
  const same = (a, b) => cloud.canonical(a) === cloud.canonical(b);
  const empty = () => ({ achievements: [], groups: [] });

  function toolBindings(workflow) {
    const bindings = new Map();
    for (const tool of workflow.tools) {
      for (const node of root.STWorkflow.walk(tool.steps)) {
        if (node.action === "http-request" && node.keyHeader)
          bindings.set(tool.id + "." + node.id, { origin: node.origin, header: node.keyHeader, executionId: tool.executionId ?? "" });
      }
    }
    return bindings;
  }

  /** Only credentials with the exact imported tool definition may be restored */
  function credentialsFor(workflow, value, restoredWorkflow = workflow) {
    if (!object(value) || !Object.hasOwn(value, "search") || !object(value.tools)) throw vault.invalid();
    const bindings = toolBindings(workflow);
    const restored = restoredWorkflow === workflow ? bindings : toolBindings(restoredWorkflow);
    const tools = {};
    for (const [id, saved] of Object.entries(value.tools)) {
      const expected = bindings.get(id);
      const installed = restored.get(id);
      if (!expected || !installed || installed.origin !== expected.origin || installed.header !== expected.header
        || saved?.origin !== expected.origin || saved.header !== expected.header || saved.executionId !== expected.executionId
        || typeof saved.value !== "string" || !saved.value) throw vault.invalid();
      new Headers({ [saved.header]: saved.value });
      tools[id] = { ...installed, value: saved.value };
    }
    return { tools, search: root.STAI.normalizeSearchSettings(value.search) };
  }

  async function settingsFingerprint(panel, credentials) {
    // 恢复会重新分配本机运行用的修订和执行标识，比较时只使用可编辑内容
    const { epoch, revision, nextIds, ...workflow } = panel.workflow;
    for (const section of ["workflows", "tools", "libraries", "prompts", "triggers"]) {
      if (workflow[section]) workflow[section] = workflow[section].map(({ revision, executionId, ...row }) => row);
    }
    const { revision: aiRevision, ...ai } = panel.ai;
    ai.connections = ai.connections.map(connection => ({ ...connection,
      models: connection.models.map(({ revision, ...row }) => row) }));
    const tools = Object.fromEntries(Object.entries(credentials.tools).map(([id, { executionId, ...record }]) => [id, record]));
    return cloud.hash(text.encode(cloud.canonical({ panel: { ...panel, workflow, ai }, credentials: { ...credentials, tools } })));
  }

  async function captureSettings() {
    const snapshot = await root.STSettings.panelSnapshot.pack({ strict: true });
    const credentialKey = root.STAutomation.TOOL_CREDENTIALS_KEY;
    const [search, local, packed] = await Promise.all([root.STSettings.storage.getAiSearch(),
      root.chrome.storage.local.get(credentialKey), cloud.pack(snapshot)]);
    const saved = local[credentialKey];
    if (saved !== undefined && !object(saved)) throw vault.invalid();
    const tools = {};
    for (const [id, binding] of toolBindings(snapshot.workflow)) {
      const record = saved?.[id];
      if (record?.origin === binding.origin && record.header === binding.header) tools[id] = { ...binding, value: record.value };
    }
    const credentials = { search, tools };
    credentialsFor(snapshot.workflow, credentials);
    return { panel: packed.bundle, credentials, fingerprint: await settingsFingerprint(snapshot, credentials) };
  }

  function settingsEqual(left, right) {
    return left.fingerprint === right.fingerprint;
  }

  async function unpackSettings(settings) {
    if (!object(settings) || !object(settings.panel) || !object(settings.credentials) || !cloud.HASH.test(settings.fingerprint)) throw vault.invalid();
    const panel = await cloud.unpack(settings.panel);
    credentialsFor(panel.workflow, settings.credentials);
    if (await settingsFingerprint(panel, settings.credentials) !== settings.fingerprint) throw vault.invalid();
    return { panel, credentials: settings.credentials };
  }

  function achievementValue(row) {
    if (!row) return "";
    return cloud.canonical([row.language, row.sourceTitle, row.sourceDescription, row.translatedTitle, row.translatedDescription,
      row.origin, row.cleared === true]);
  }

  function normalizeGame(game, appId) {
    if (!object(game) || Object.keys(game).length !== sections.length) throw vault.invalid();
    const result = {};
    for (const section of sections) {
      const rows = model.records(game[section], appId, "chinese_simplified");
      if (section === "groups" && rows.some(row => !/^(0|[1-9]\d*)$/.test(row.id) || !Number.isSafeInteger(Number(row.id))
        || row.sourceDescription !== "" || row.translatedDescription !== "")) throw vault.invalid();
      result[section] = rows.slice().sort((a, b) => a.id === b.id ? 0 : a.id < b.id ? -1 : 1);
    }
    return result;
  }

  function gameEqual(left, right) {
    return sections.every(section => left[section].length === right[section].length
      && left[section].every((row, index) => row.id === right[section][index].id && achievementValue(row) === achievementValue(right[section][index])));
  }

  /** Merge on the stable achievement/group ID. Device-local revision numbers never order cross-device edits */
  function mergeGame(base, local, remote, choice) {
    const game = {};
    let conflict = false;
    for (const section of sections) {
      const previous = new Map(base[section].map(row => [row.id, row]));
      const here = new Map(local[section].map(row => [row.id, row]));
      const there = new Map(remote[section].map(row => [row.id, row]));
      const ids = [...new Set([...previous.keys(), ...here.keys(), ...there.keys()])].sort();
      game[section] = [];
      for (const id of ids) {
        const old = achievementValue(previous.get(id));
        const one = here.get(id);
        const two = there.get(id);
        const left = achievementValue(one);
        const right = achievementValue(two);
        const contested = left !== right && left !== old && right !== old;
        if (contested) conflict = true;
        const row = contested ? (choice === "use-local" ? one : two) : left === old ? two : one;
        if (row) game[section].push(row);
      }
    }
    return { game, conflict };
  }

  function decodeBase64(value, maximum, size) {
    if (typeof value !== "string" || value.length > Math.ceil(maximum / 3) * 4
      || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw vault.invalid();
    const raw = Uint8Array.from(root.atob(value), c => c.charCodeAt(0));
    if (raw.length > maximum || (size !== undefined && raw.length !== size) || cloud.base64(raw) !== value) throw vault.invalid();
    return raw;
  }

  function shardMetadata(index) {
    if (!object(index)) throw vault.invalid();
    for (const [appId, ref] of Object.entries(index)) {
      if (!/^[1-9]\d*$/.test(appId) || !Number.isSafeInteger(Number(appId)) || !cloud.HASH.test(ref?.id))
        throw vault.invalid();
      decodeBase64(ref.key, 32, 32);
    }
    return index;
  }

  const algorithm = (header, appId, iv) => ({ name: "AES-GCM", iv,
    additionalData: text.encode(cloud.canonical(["achievements-v3", header.owner, header.vaultId, appId])), tagLength: 128 });

  async function sealGame(header, appId, game) {
    const keyBytes = root.crypto.getRandomValues(new Uint8Array(32));
    const key = await root.crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
    const iv = root.crypto.getRandomValues(new Uint8Array(12));
    const json = text.encode(cloud.canonical(game));
    const packed = root.fflate.gzipSync(json, { mtime: 0 });
    if (packed.length + 28 > vault.envelopeLimit || json.length > 8 * 1024 * 1024)
      throw cloud.error("too-large", "单个游戏的成就译文分片过大");
    const cipher = new Uint8Array(await root.crypto.subtle.encrypt(algorithm(header, appId, iv), key, packed));
    const buffer = new Uint8Array(iv.length + cipher.length);
    buffer.set(iv);
    buffer.set(cipher, iv.length);
    const ref = { id: await cloud.hash(buffer), key: cloud.base64(keyBytes) };
    keyBytes.fill(0);
    return { ref, payload: cloud.base64(buffer) };
  }

  async function openGame(header, appId, ref, encoded) {
    const value = decodeBase64(encoded, vault.envelopeLimit);
    if (value.length < 29 || await cloud.hash(value) !== ref.id) throw vault.invalid();
    const key = await root.crypto.subtle.importKey("raw", decodeBase64(ref.key, 32, 32), "AES-GCM", false, ["decrypt"]);
    const gzip = await root.crypto.subtle.decrypt(algorithm(header, appId, value.subarray(0, 12)), key, value.subarray(12));
    const reader = new Blob([gzip]).stream().pipeThrough(new DecompressionStream("gzip"));
    return normalizeGame(cloud.parseJson(await cloud.readText(reader, 8 * 1024 * 1024)), appId);
  }

  async function readGame(adapter, header, appId, ref, slot) {
    const cached = adapter.offline ? null : await vault.shardCache(header, appId, slot);
    const fromCache = cached?.id === ref.id;
    const payload = fromCache ? cached.payload : await adapter.readObject(ref.id);
    const game = await openGame(header, appId, ref, payload);
    if (!fromCache && !adapter.offline) await vault.shardCache(header, appId, slot, { id: ref.id, payload });
    return { game, payload };
  }

  async function achievementPlan(adapter, header, base, remote, choice, canApply) {
    const store = root.STAchievementTranslationStore;
    const pending = await store.cloudPending(header.owner);
    const before = shardMetadata(base);
    const index = { ...shardMetadata(remote) };
    const candidates = new Set([...pending.keys(), ...new Set([...Object.keys(before), ...Object.keys(index)]
      .filter(id => before[id]?.id !== index[id]?.id).map(Number))]);
    const changes = [];
    let conflict = false;
    for (const appId of candidates) {
      await canApply();
      const stamp = pending.get(appId);
      const old = before[appId];
      const latest = index[appId];
      const ours = normalizeGame(await store.cloudGame(appId), appId);
      const theirs = latest ? (await readGame(adapter, header, appId, latest, "remote")).game : empty();
      const original = old?.id === latest?.id ? theirs : old ? (await readGame(adapter, header, appId, old, "baseline")).game : empty();
      const result = mergeGame(original, ours, theirs, choice);
      conflict ||= result.conflict;
      changes.push({ appId, stamp, before: ours, game: result.game, upload: !gameEqual(result.game, theirs) });
    }
    return { index, changes, conflict, upload: changes.some(row => row.upload) };
  }

  async function publishAchievements(adapter, header, plan, canSend) {
    for (const row of plan.changes) {
      if (!row.upload) continue;
      const digest = await cloud.hash(text.encode(cloud.canonical(row.game)));
      let value = await vault.shardCache(header, row.appId, "upload");
      if (value?.digest !== digest) {
        value = { ...await sealGame(header, row.appId, row.game), digest };
        await vault.shardCache(header, row.appId, "upload", value);
      }
      if (!value.acknowledged) {
        await adapter.putObject(value.ref.id, value.payload, canSend);
        await vault.shardCache(header, row.appId, "upload", { ...value, acknowledged: true });
      } else if (adapter.verifyStagedObject) {
        await adapter.verifyStagedObject(value.ref.id, value.payload, canSend);
      }
      plan.index[row.appId] = value.ref;
    }
    return plan.index;
  }

  async function exportArchive(adapter, opened) {
    const objects = {};
    let size = JSON.stringify({ type: "steam-buff-encrypted-backup-v3", document: opened.document, objects }).length;
    for (const [appId, ref] of Object.entries(shardMetadata(opened.data.achievements))) {
      const { payload: value } = await readGame(adapter, opened.header, Number(appId), ref, "remote");
      size += ref.id.length + value.length + 6;
      if (size > cloud.ARCHIVE_FILE_LIMIT) throw cloud.error("too-large", "离线备份文件超过允许的导出大小");
      objects[ref.id] = value;
    }
    return { type: "steam-buff-encrypted-backup-v3", document: opened.document, objects };
  }

  function archiveReader(file) {
    if (!object(file) || file.type !== "steam-buff-encrypted-backup-v3" || !object(file.objects)) throw vault.invalid();
    return {
      offline: true,
      readObject(id) {
        if (!Object.hasOwn(file.objects, id) || typeof file.objects[id] !== "string") throw vault.invalid();
        return file.objects[id];
      },
    };
  }

  root.STSettingsCloudData = Object.freeze({ captureSettings, unpackSettings, settingsEqual, credentialsFor, achievementValue,
    mergeGame, achievementPlan, publishAchievements, exportArchive, archiveReader });
})(globalThis);
