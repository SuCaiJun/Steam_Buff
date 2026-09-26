/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置云同步面板打包、加解密与冲突判定
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */

((root) => {
  "use strict";

  const settings = root.STSettings = root.STSettings || {};
  if (settings.cloud?.ready) {
    return;
  }

  const ALG = "aes-256-gcm-gzip-v1";
  const ENABLED_KEY = "st.settings.cloud.enabled";
  const SECRET_KEY = "st.settings.cloud.secret";
  const META_KEY = "st.settings.cloud.syncMeta";
  const PLAIN_LIMIT = 64 * 1024;
  const SALT_BYTES = 16;
  const NONCE_BYTES = 12;
  const PBKDF2_ITERATIONS = 600000;
  const log = root.STLoggerFactory?.createLogger?.("settings", "settings-cloud") || {
    info() {},
    warn() {},
    error() {},
  };

  let applyLock = 0;
  let applyDirty = false;
  // 本进程已经发出的修改代次。存储写回完成前，其他写 meta 的路径也要看见它
  let memorySeq = 0;

  function snapshot() {
    return settings.panelSnapshot || {};
  }

  function catalog() {
    return settings.catalog || {};
  }

  function area() {
    return root.chrome?.storage?.local;
  }

  function emptyMeta() {
    return {
      schemaVersion: 1,
      userId: "",
      revision: 0,
      payloadHash: "",
      dirty: false,
      editSeq: 0,
      conflict: null,
      decryptBlocked: false,
      lastCheckedAt: 0,
      lastSyncedAt: 0,
      lastError: "",
    };
  }

  function userIdOf(value) {
    return String(value || "").trim();
  }

  function localGet(keys) {
    const box = area();
    if (!box) {
      return Promise.resolve({});
    }
    return new Promise((resolve) => {
      try {
        box.get(keys, (data) => {
          resolve(root.chrome?.runtime?.lastError ? {} : (data || {}));
        });
      } catch {
        resolve({});
      }
    });
  }

  function localSet(data) {
    const box = area();
    if (!box) {
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      try {
        box.set(data, () => {
          resolve(!root.chrome?.runtime?.lastError);
        });
      } catch {
        resolve(false);
      }
    });
  }

  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function canonical(value) {
    if (value === null || typeof value !== "object") {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map(canonical).join(",")}]`;
    }
    const keys = Object.keys(value).filter((key) => (
      key !== "__proto__" && key !== "constructor" && key !== "prototype"
    )).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }

  function utf8(text) {
    return new TextEncoder().encode(String(text || ""));
  }

  function fromUtf8(bytes) {
    return new TextDecoder().decode(bytes);
  }

  function concatBytes(chunks) {
    const size = chunks.reduce((sum, item) => sum + item.length, 0);
    const out = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }

  function bytesToBase64(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
    }
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(String(value || ""));
    const out = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      out[index] = binary.charCodeAt(index);
    }
    return out;
  }

  function gzipBytes(bytes) {
    const gzip = root.fflate?.gzipSync;
    if (typeof gzip !== "function") {
      throw new Error("gzip 不可用");
    }
    return gzip(bytes);
  }

  function gunzipBytes(bytes) {
    const gunzip = root.fflate?.gunzipSync;
    if (typeof gunzip !== "function") {
      throw new Error("gzip 不可用");
    }
    return gunzip(bytes);
  }

  function randomBytes(size) {
    const out = new Uint8Array(size);
    root.crypto.getRandomValues(out);
    return out;
  }

  async function deriveKey(secret, salt) {
    const material = await root.crypto.subtle.importKey("raw", utf8(secret), "PBKDF2", false, ["deriveKey"]);
    return root.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256",
      },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }

  function normalize(settingsValue) {
    return snapshot().normalize(settingsValue);
  }

  function defaultsPack() {
    return snapshot().defaultsPack();
  }

  async function pack() {
    return snapshot().pack();
  }

  function isDefaultPack(settingsValue) {
    return canonical(normalize(settingsValue)) === canonical(defaultsPack());
  }

  async function apply(settingsValue) {
    const next = normalize(settingsValue);
    applyLock += 1;
    try {
      const ok = await snapshot().write(next, { reason: "settings-cloud-apply" });
      if (ok !== true) {
        throw new Error("设置写入失败");
      }
      return next;
    } finally {
      applyLock -= 1;
      if (applyLock === 0 && applyDirty) {
        applyDirty = false;
        const issued = ++memorySeq;
        const stored = await readStoredMeta();
        const editSeq = Math.max(issued, stored.editSeq + 1, memorySeq);
        memorySeq = editSeq;
        await setMeta({ ...stored, dirty: true, editSeq });
      }
    }
  }

  async function encrypt(settingsValue, secret) {
    const pass = String(secret || "").trim();
    if (!pass) {
      throw new Error("同步密钥不能为空");
    }
    const json = canonical(normalize(settingsValue));
    const plain = gzipBytes(utf8(json));
    if (plain.length > PLAIN_LIMIT) {
      const error = new Error("设置体积过大，请精简评论规则后再同步");
      error.code = "too-large";
      throw error;
    }
    const salt = randomBytes(SALT_BYTES);
    const nonce = randomBytes(NONCE_BYTES);
    const key = await deriveKey(pass, salt);
    const cipher = new Uint8Array(await root.crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plain));
    return {
      alg: ALG,
      ciphertext: bytesToBase64(concatBytes([salt, nonce, cipher])),
      payloadBytes: salt.length + nonce.length + cipher.length,
    };
  }

  async function decrypt(ciphertext, secret, alg = ALG) {
    if (alg !== ALG) {
      const error = new Error("云端设置格式需要升级扩展");
      error.code = "alg";
      throw error;
    }
    const pass = String(secret || "").trim();
    if (!pass) {
      const error = new Error("同步密钥不能为空");
      error.code = "decrypt";
      throw error;
    }
    let packed;
    try {
      const raw = base64ToBytes(ciphertext);
      if (raw.length < SALT_BYTES + NONCE_BYTES + 16) {
        throw new Error("密文长度无效");
      }
      const salt = raw.subarray(0, SALT_BYTES);
      const nonce = raw.subarray(SALT_BYTES, SALT_BYTES + NONCE_BYTES);
      const body = raw.subarray(SALT_BYTES + NONCE_BYTES);
      const key = await deriveKey(pass, salt);
      const plain = new Uint8Array(await root.crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, body));
      const unzipped = gunzipBytes(plain);
      if (unzipped.length > PLAIN_LIMIT) {
        throw new Error("解压结果过大");
      }
      packed = JSON.parse(fromUtf8(unzipped));
    } catch (error) {
      if (error?.code === "alg") {
        throw error;
      }
      const fail = new Error("无法解密云端设置");
      fail.code = "decrypt";
      fail.cause = error;
      throw fail;
    }
    if (!isPlainObject(packed)) {
      const error = new Error("云端设置格式无效");
      error.code = "decrypt";
      throw error;
    }
    return normalize(packed);
  }

  function cmpVer(left, right) {
    const parts = (value) => String(value || "").replace(/^v/i, "").split(".").map((item) => Number.parseInt(item, 10) || 0);
    const a = parts(left);
    const b = parts(right);
    const len = Math.max(a.length, b.length);
    for (let index = 0; index < len; index += 1) {
      const diff = (a[index] || 0) - (b[index] || 0);
      if (diff !== 0) {
        return diff > 0 ? 1 : -1;
      }
    }
    return 0;
  }

  function localVersion() {
    try {
      return String(root.chrome?.runtime?.getManifest?.()?.version || "");
    } catch {
      return "";
    }
  }

  function normalizeMeta(value) {
    const src = isPlainObject(value) ? value : {};
    return {
      schemaVersion: 1,
      userId: userIdOf(src.userId),
      revision: Number.isInteger(src.revision) && src.revision >= 0 ? src.revision : 0,
      payloadHash: String(src.payloadHash || ""),
      dirty: src.dirty === true,
      editSeq: Number.isInteger(src.editSeq) && src.editSeq >= 0 ? src.editSeq : 0,
      conflict: src.conflict == null ? null : src.conflict,
      decryptBlocked: src.decryptBlocked === true,
      lastCheckedAt: Number(src.lastCheckedAt) || 0,
      lastSyncedAt: Number(src.lastSyncedAt) || 0,
      lastError: String(src.lastError || ""),
    };
  }

  async function getEnabled() {
    const data = await localGet([ENABLED_KEY]);
    return data[ENABLED_KEY] === true;
  }

  async function setEnabled(value) {
    return localSet({ [ENABLED_KEY]: value === true });
  }

  async function getSecret() {
    const data = await localGet([SECRET_KEY]);
    return String(data[SECRET_KEY] || "");
  }

  async function setSecret(value) {
    return localSet({ [SECRET_KEY]: String(value || "") });
  }

  function withMemory(meta) {
    if (memorySeq > meta.editSeq) {
      meta.editSeq = memorySeq;
      meta.dirty = true;
    }
    return meta;
  }

  async function readStoredMeta() {
    const data = await localGet([META_KEY]);
    return normalizeMeta(data[META_KEY]);
  }

  async function getMeta() {
    return withMemory(await readStoredMeta());
  }

  // 清 dirty 时如果传入的代次已经落后，必须保留待同步，不能用旧代次覆盖新修改
  async function setMeta(value) {
    const incoming = normalizeMeta(value);
    if (memorySeq > incoming.editSeq) {
      incoming.editSeq = memorySeq;
      incoming.dirty = true;
    }
    const stored = await readStoredMeta();
    if (stored.editSeq > incoming.editSeq) {
      incoming.editSeq = stored.editSeq;
      incoming.dirty = true;
    }
    memorySeq = Math.max(memorySeq, incoming.editSeq);
    return localSet({ [META_KEY]: incoming });
  }

  async function readChannel() {
    const data = await localGet([ENABLED_KEY, SECRET_KEY, META_KEY]);
    return {
      enabled: data[ENABLED_KEY] === true,
      secret: String(data[SECRET_KEY] || ""),
      meta: withMemory(normalizeMeta(data[META_KEY])),
    };
  }

  // 退出登录或换账号时切断通道，避免上一账号的密钥/revision 被下一账号继续使用
  async function resetChannel() {
    memorySeq = 0;
    return localSet({
      [ENABLED_KEY]: false,
      [SECRET_KEY]: "",
      [META_KEY]: emptyMeta(),
    });
  }

  async function bindUser(userId) {
    const id = userIdOf(userId);
    if (!id) {
      return false;
    }
    const meta = await getMeta();
    if (meta.userId === id) {
      return true;
    }
    return setMeta({ ...meta, userId: id });
  }

  // 通道必须绑到当前 user_id；对不上就重置，不能把上一账号的面板加密上传到新账号
  async function adoptForUser(userId) {
    const id = userIdOf(userId);
    const channel = await readChannel();
    const bound = userIdOf(channel.meta.userId);
    if (bound && id && bound !== id) {
      await resetChannel();
      return {
        userId: id,
        bound: "",
        enabled: false,
        secret: "",
        meta: emptyMeta(),
        switched: true,
        unbound: true,
      };
    }
    return {
      userId: id,
      bound,
      enabled: channel.enabled,
      secret: channel.secret,
      meta: channel.meta,
      switched: false,
      unbound: !bound,
    };
  }

  function isApplying() {
    return applyLock > 0;
  }

  function isSyncedKey(name) {
    return catalog().isPanelStorageKey?.(name) === true;
  }

  // 已经 dirty 时也要加代次。上传开始时的 true 不能和上传期间的新修改当成同一次
  async function markDirty() {
    if (applyLock > 0) {
      applyDirty = true;
      return true;
    }
    const issued = ++memorySeq;
    const stored = await readStoredMeta();
    const editSeq = Math.max(issued, stored.editSeq + 1, memorySeq);
    memorySeq = editSeq;
    return setMeta({ ...stored, dirty: true, editSeq });
  }

  function decide(input = {}) {
    if (input.enabled !== true || input.loggedIn !== true || input.hasPermission !== true) {
      return { action: "skip", reason: "unavailable" };
    }
    const cloud = input.cloud && typeof input.cloud === "object" ? input.cloud : {};
    const meta = normalizeMeta(input.meta);
    const local = String(input.localVersion || "");
    if (cloud.exists === true && cmpVer(local, cloud.extensionVersion) < 0) {
      return { action: "upgrade", reason: "version-low" };
    }
    if (cloud.exists !== true) {
      // 登录/后台自动同步在通道未绑定或刚换账号时不得把本机残留面板上传到空云端
      if (input.allowEmptyUpload === false) {
        return { action: "skip", reason: "hold-empty" };
      }
      return { action: "upload", reason: "cloud-empty" };
    }
    // 解不开或「稍后」期间禁止自动 PUT/GET 覆盖；打开设置或立即同步再处理
    if (meta.decryptBlocked === true) {
      return { action: "decrypt", reason: "decrypt-blocked" };
    }
    if (meta.conflict && meta.conflict !== "upgrade") {
      return { action: "conflict", reason: String(meta.conflict) };
    }
    if (!meta.revision && !meta.payloadHash) {
      return input.localIsDefault === true
        ? { action: "download", reason: "fresh-device" }
        : { action: "conflict", reason: "fresh-local-dirty" };
    }
    if (String(cloud.payloadHash || "") === meta.payloadHash && meta.dirty !== true) {
      return { action: "skip", reason: "unchanged" };
    }
    const remoteRev = Number(cloud.revision) || 0;
    if (remoteRev === meta.revision && meta.dirty === true) {
      return { action: "upload", reason: "local-dirty" };
    }
    if (remoteRev >= meta.revision && meta.dirty !== true) {
      return { action: "download", reason: "cloud-newer" };
    }
    if (remoteRev > meta.revision && meta.dirty === true) {
      return { action: "conflict", reason: "both-dirty" };
    }
    return { action: "conflict", reason: "revision-mismatch" };
  }

  const api = Object.freeze({
    ready: true,
    ALG,
    ENABLED_KEY,
    SECRET_KEY,
    META_KEY,
    get SECTIONS() {
      return catalog().panelSections || [];
    },
    emptyMeta,
    canonical,
    cmpVer,
    localVersion,
    normalize,
    defaultsPack,
    isDefaultPack,
    pack,
    apply,
    encrypt,
    decrypt,
    getEnabled,
    setEnabled,
    getSecret,
    setSecret,
    getMeta,
    setMeta,
    readChannel,
    resetChannel,
    bindUser,
    adoptForUser,
    markDirty,
    isApplying,
    isSyncedKey,
    decide,
  });

  settings.cloud = api;
  root.STSettingsCloud = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
