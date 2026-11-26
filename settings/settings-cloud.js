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

  const FORMAT = 2;
  const CHANNEL_KEY = "st.settings.cloud.channelV3";
  const META_KEY = "st.settings.cloud.metaV3";
  const LEGACY_KEYS = Object.freeze(["st.settings.cloud.enabled", "st.settings.cloud.secret", "st.settings.cloud.syncMeta"]);
  const PACKED_LIMIT = 64 * 1024;
  const JSON_LIMIT = 8 * 1024 * 1024;
  const ENVELOPE_LIMIT = 90 * 1024;
  const ARCHIVE_FILE_LIMIT = 32 * 1024 * 1024;
  const VERSION = /^[0-9]{1,4}(?:\.[0-9]{1,4}){0,3}$/;
  const HASH = /^[0-9a-f]{64}$/;
  const PROVIDERS = Object.freeze(["official", "webdav"]);
  const options = { owner: "background:settings-cloud", strict: true };

  function error(code, message) {
    return Object.assign(new Error(message), { code });
  }

  function bus() {
    return root.STSettingsBus;
  }

  function emptyMeta() {
    return { revision: null, payloadHash: "", extensionVersion: "", editSeq: 0, dirty: false,
      lastCheckedAt: 0, lastSyncedAt: 0, lastError: "", conflict: null, pending: null };
  }

  /** 按通道代次读取同步状态，前台只获得 WebDAV 地址和用户名 */
  async function readChannel({ credentials = false } = {}) {
    const saved = await bus().rawGet([CHANNEL_KEY, META_KEY], options);
    const channel = saved[CHANNEL_KEY] || null;
    if (channel && (!PROVIDERS.includes(channel.provider) || !channel.id || !channel.userId || !channel.session)) {
      throw error("channel-invalid", "云同步配置无效，请重新设置备份位置");
    }
    const meta = channel && saved[META_KEY]?.id === channel.id ? saved[META_KEY] : emptyMeta();
    if (!channel || credentials || !channel.dav) return { channel, meta };
    return { channel: { ...channel, dav: { directory: channel.dav.directory, username: channel.dav.username } }, meta };
  }

  async function saveChannel(channel) {
    if (!await bus().rawSet({ [CHANNEL_KEY]: channel, [META_KEY]: { ...emptyMeta(), id: channel.id } },
      { ...options, reason: "settings-cloud-channel" })) {
      throw error("cloud-storage", "保存云同步配置失败");
    }
  }

  async function saveMeta(id, meta) {
    if (!await bus().rawSet({ [META_KEY]: { ...meta, id } }, options)) {
      throw error("cloud-storage", "保存云同步状态失败");
    }
  }

  // 新通道独立于旧开关，旧备份不会自动上传到新位置
  async function removeLegacy() {
    const data = await bus().rawGet(LEGACY_KEYS, options);
    const found = LEGACY_KEYS.filter(key => Object.hasOwn(data, key));
    if (found.length && !await bus().rawRemove(found, { ...options, reason: "settings-cloud-v1-cleanup" })) {
      throw error("cloud-storage", "清理旧版云同步状态失败");
    }
    return found.length;
  }

  function canonical(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    const keys = Object.keys(value).filter(key => !["__proto__", "constructor", "prototype"].includes(key)).sort();
    return `{${keys.map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }

  function base64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return root.btoa(binary);
  }

  function validVersion(version) {
    return typeof version === "string" && VERSION.test(version);
  }

  function compareVersion(local, remote) {
    const left = local.split(".").map(Number);
    const right = remote.split(".").map(Number);
    for (let i = 0; i < 4; i++) {
      const diff = (left[i] || 0) - (right[i] || 0);
      if (diff) return Math.sign(diff);
    }
    return 0;
  }

  function localVersion() {
    const version = root.chrome.runtime.getManifest().version;
    if (!validVersion(version)) throw error("version-invalid", "当前扩展版本无效");
    return version;
  }

  function validateBundle(bundle) {
    if (!bundle || typeof bundle !== "object" || !validVersion(bundle.extensionVersion)
      || !Number.isInteger(bundle.formatVersion)) {
      throw error("bundle-invalid", "远端备份格式无效");
    }
    if (bundle.formatVersion > FORMAT || compareVersion(localVersion(), bundle.extensionVersion) < 0) {
      throw error("upgrade", "远端备份需要更高版本的扩展");
    }
    if (bundle.formatVersion !== FORMAT || Object.keys(bundle).length !== 3
      || typeof bundle.payload !== "string" || bundle.payload.length > Math.ceil(PACKED_LIMIT / 3) * 4
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(bundle.payload) || bundle.payload.length % 4) {
      throw error("bundle-invalid", "远端备份格式无效");
    }
    const bytes = Uint8Array.from(root.atob(bundle.payload), ch => ch.charCodeAt(0));
    if (bytes.length > PACKED_LIMIT || bytes[0] !== 0x1f || bytes[1] !== 0x8b || base64(bytes) !== bundle.payload) {
      throw error("bundle-invalid", "远端备份不是有效的压缩数据");
    }
    return bytes;
  }

  async function hash(bytes) {
    const digest = await root.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  }

  /** 使用现有面板快照构造两个远端共用的包。gzip 是传输格式，不是加密 */
  async function pack(settingsValue = undefined) {
    settingsValue ??= await settings.panelSnapshot.pack({ strict: true });
    const input = new TextEncoder().encode(canonical(settingsValue));
    const fail = () => error("too-large", "设置备份体积过大，请精简设置后再同步");
    if (input.length > JSON_LIMIT) throw fail();
    const bytes = root.fflate.gzipSync(input, { mtime: 0 });
    if (bytes.length > PACKED_LIMIT) throw fail();
    return {
      bundle: { formatVersion: FORMAT, extensionVersion: localVersion(), payload: base64(bytes) },
      payloadHash: await hash(bytes),
      payloadBytes: bytes.length,
    };
  }

  /** 限制远端响应和解压的实际字节数，超限即停止读取 */
  async function readText(stream, limit) {
    const reader = stream.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let size = 0, result = "";
    let complete = false;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) {
          complete = true;
          return result + decoder.decode();
        }
        size += value.byteLength;
        if (size > limit) throw error("bundle-invalid", "远端备份内容超出大小限制");
        result += decoder.decode(value, { stream: true });
      }
    } finally {
      if (!complete) void reader.cancel().catch(error => {
        root.STLoggerFactory.reportError(error, { domain: "background", feature: "settings-cloud",
          event: "settings-cloud-stream-cancel-failed", message: "释放备份读取流失败", level: "warn" });
      });
      reader.releaseLock();
    }
  }

  function parseJson(text) {
    try {
      return JSON.parse(text);
    } catch (cause) {
      root.STLoggerSchema.markJsonError(cause);
      throw new Error("远端备份不是有效的 JSON", { cause });
    }
  }

  /** 完整校验后才交给面板写回，空文件或缺失分区不会被填成默认设置 */
  async function unpack(bundle, expectedHash) {
    const bytes = validateBundle(bundle);
    if (expectedHash && await hash(bytes) !== expectedHash) {
      throw error("bundle-invalid", "远端备份内容校验失败");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    const data = parseJson(await readText(stream, JSON_LIMIT));
    const sections = settings.panelSnapshot.SECTIONS;
    if (!data || typeof data !== "object" || Object.keys(data).length !== sections.length
      || !sections.every(key => Object.hasOwn(data, key)
        && (key === "uiLocale" ? settings.panelSnapshot.LOCALES.includes(data[key])
          : settings.panelSnapshot.isPlainObject(data[key])))) {
      throw error("bundle-invalid", "远端备份的设置分区不完整");
    }
    return data;
  }

  function webdavDirectory(value) {
    const address = typeof value === "string" ? value.trim() : "";
    const url = /^https:\/\//i.test(address) && URL.canParse(address) ? new URL(address) : null;
    if (!url || url.protocol !== "https:" || !url.hostname || url.hostname.includes("*")
      || url.username || url.password || url.search || url.hash || /[?#]/.test(url.href)) {
      throw error("webdav-url", "请输入不含登录信息、查询参数或片段的 HTTPS WebDAV 文件夹地址");
    }
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    return url;
  }

  function webdavConfig(value) {
    const directory = webdavDirectory(value?.directory).href;
    const username = value?.username;
    const password = value?.password;
    if (typeof username !== "string" || !username.trim() || /[:\u0000-\u001f\u007f]/.test(username)
      || typeof password !== "string" || !password || /[\u0000-\u001f\u007f]/.test(password)
      || username.length > 1024 || password.length > 4096) {
      throw error("webdav-credentials", "请输入有效的 WebDAV 用户名和密码或应用密码");
    }
    return { directory, username, password };
  }

  const api = Object.freeze({
    ready: true, CHANNEL_KEY, META_KEY, PACKED_LIMIT, ENVELOPE_LIMIT, ARCHIVE_FILE_LIMIT, HASH, PROVIDERS,
    error, emptyMeta, readChannel, saveChannel, saveMeta, removeLegacy,
    compareVersion, localVersion, validVersion, pack, unpack, validateBundle, hash, base64, canonical, readText, parseJson,
    webdavDirectory, webdavConfig,
    isSyncedKey: key => key === root.STConfig.aiSearchKey || key === root.STAutomation.TOOL_CREDENTIALS_KEY
      || settings.catalog.isPanelStorageKey(key),
  });
  settings.cloud = api;
  root.STSettingsCloud = api;
})(globalThis);
