/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置云备份设备授权、加密信封与本机密钥存储
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */

((root) => {
  "use strict";

  const cloud = root.STSettingsCloud;
  const crypto = root.crypto;
  const rsa = { name: "RSA-OAEP", hash: "SHA-256" };
  const ec = { name: "ECDSA", namedCurve: "P-256" };
  const es256 = { name: "ECDSA", hash: "SHA-256" };
  const aes = { name: "AES-GCM" };
  const utf8 = new TextEncoder();
  const decode = new TextDecoder("utf-8", { fatal: true });
  const format = 3;
  const objectLimit = 1024 * 1024;
  const envelopeLimit = 2 * 1024 * 1024;
  const pairLifetime = 15 * 60 * 1000;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const accountId = /^[1-9]\d{0,19}$/;
  const jwsProtected = encode(utf8.encode('{"alg":"ES256","typ":"steam-buff-vault+jws"}'));
  let opening;

  function invalid() {
    return cloud.error("vault-invalid", "加密备份格式或签名无效");
  }

  function encode(bytes) {
    return cloud.base64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  }

  function bytes(value, length) {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1
      || (length !== undefined && value.length !== Math.ceil(length * 4 / 3))) throw invalid();
    const encoded = value.replaceAll("-", "+").replaceAll("_", "/");
    const result = Uint8Array.from(root.atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")), c => c.charCodeAt(0));
    if (encode(result) !== value || (length !== undefined && result.length !== length)) throw invalid();
    return result;
  }

  function json(value) {
    return utf8.encode(cloud.canonical(value));
  }

  function fields(value, keys) {
    return value && typeof value === "object" && !Array.isArray(value)
      && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
  }

  function rsaPublic(key) {
    if (key?.kty !== "RSA" || key.e !== "AQAB") throw invalid();
    bytes(key.n, 256);
    return { kty: "RSA", n: key.n, e: key.e };
  }

  function ecPublic(key) {
    if (key?.kty !== "EC" || key.crv !== "P-256") throw invalid();
    bytes(key.x, 32);
    bytes(key.y, 32);
    return { kty: "EC", crv: "P-256", x: key.x, y: key.y };
  }

  async function recipient(extractable = false) {
    const pair = await crypto.subtle.generateKey({ ...rsa, modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1) },
      extractable, ["encrypt", "decrypt"]);
    const publicKey = rsaPublic(await crypto.subtle.exportKey("jwk", pair.publicKey));
    return { id: await cloud.hash(json(publicKey)), publicKey, privateKey: pair.privateKey };
  }

  function database() {
    if (!opening) opening = new Promise((resolve, reject) => {
      const request = root.indexedDB.open("SteamBuffSettingsVault", 3);
      request.onupgradeneeded = ({ oldVersion }) => {
        if (oldVersion < 1) request.result.createObjectStore("devices");
        if (oldVersion < 2) request.result.createObjectStore("shards");
        request.result.createObjectStore("restores");
        request.transaction.objectStore("devices").createIndex("vaultId", "vaultId");
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        request.result.onversionchange = () => { request.result.close(); opening = undefined; };
        resolve(request.result);
      };
    }).catch(error => { opening = undefined; throw error; });
    return opening;
  }

  async function storage(key, value, name = "devices") {
    const db = await database();
    const tx = db.transaction(name, value === undefined ? "readonly" : "readwrite");
    const store = tx.objectStore(name);
    const request = value === undefined ? store.get(key) : store.put(value, key);
    return storageResult(tx, request);
  }

  function storageResult(tx, request) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error || cloud.error("vault-invalid", "设备密钥存储事务已取消"));
    });
  }

  function shardCache(header, appId, slot, entry) {
    return storage([header.owner, header.vaultId, appId, slot], entry, "shards");
  }

  function keyFor(ctx) {
    const directory = ctx.channel.provider === "webdav" ? ctx.channel.dav.directory : "official";
    return ctx.userId + "\n" + directory;
  }

  async function readDevice(ctx) {
    return storage(keyFor(ctx));
  }

  async function saveDevice(ctx, device) {
    await ctx.check();
    await storage(keyFor(ctx), device);
  }

  async function newDevice(ctx) {
    const existing = await readDevice(ctx);
    if (existing) return existing;
    const created = await recipient();
    await saveDevice(ctx, created);
    return created;
  }

  async function pairRequest(ctx) {
    const device = await newDevice(ctx);
    if (device.vaultId) throw cloud.error("vault-authorized", "当前浏览器已经获得授权");
    const request = { type: "steam-buff-pair", owner: ctx.userId, kid: device.id, key: device.publicKey,
      proof: encode(crypto.getRandomValues(new Uint8Array(32))), expires: Date.now() + pairLifetime };
    await saveDevice(ctx, { ...device, request });
    return request;
  }

  async function parsePair(request, userId) {
    if (!fields(request, ["type", "owner", "kid", "key", "proof", "expires"]) || request.type !== "steam-buff-pair"
      || request.owner !== userId || !Number.isSafeInteger(request.expires) || request.expires < Date.now()
      || request.expires > Date.now() + pairLifetime || request.kid !== await cloud.hash(json(rsaPublic(request.key)))) {
      throw cloud.error("vault-pair", "配对请求已过期、无效或属于其他账号");
    }
    bytes(request.proof, 32);
    return { key: rsaPublic(request.key), proof: request.proof, expires: request.expires };
  }

  /** 初始化时只把恢复私钥交给独立设置页面下载，云端信封只持有其公钥的封装 */
  async function create(ctx, device) {
    if (device.vaultId) throw cloud.error("vault-authorized", "本机已有备份身份，请恢复原备份");
    if (device.draft) return device.draft;
    const signer = await crypto.subtle.generateKey(ec, true, ["sign", "verify"]);
    const signerKey = await crypto.subtle.exportKey("jwk", signer.privateKey);
    const vaultId = crypto.randomUUID();
    const rootKey = ecPublic(signerKey);
    const header = { owner: ctx.userId, vaultId, sequence: 0, rootKey };
    const recovery = await recoveryRecipient(header, { [device.id]: { key: device.publicKey } });
    const draft = { data: { signer: signerKey, members: recovery.members }, header, recovery: recovery.file };
    // 首次 PUT 即使回执丢失，本机仍能验证已发布备份并打开它
    await saveDevice(ctx, { ...device, draft });
    return draft;
  }

  async function recoveryRecipient(header, members) {
    const recovery = await recipient(true);
    return { members: { ...members, [recovery.id]: { key: recovery.publicKey, recovery: true } },
      file: { type: "steam-buff-recovery-v3", owner: header.owner, vaultId: header.vaultId, rootKey: header.rootKey,
        kid: recovery.id, key: await crypto.subtle.exportKey("jwk", recovery.privateKey) } };
  }

  function signingInput(jwe) {
    return utf8.encode(jwsProtected + "." + encode(json(jwe)));
  }

  function opaqueObjects(achievements) {
    if (!achievements || typeof achievements !== "object" || Array.isArray(achievements)) throw invalid();
    const objects = [...new Set(Object.values(achievements).map(row => row?.id))].sort();
    if (!objects.every(id => cloud.HASH.test(id))) throw invalid();
    return objects;
  }

  /** RFC 7516 多接收方 JWE。单个随机内容密钥经各设备的 RSA 公钥分别封装；JWS 签署整个 JWE */
  async function seal(header, data) {
    const protectedHeader = encode(json({ alg: "RSA-OAEP-256", enc: "A256GCM", ...header,
      objects: opaqueObjects(data.achievements) }));
    const cek = crypto.getRandomValues(new Uint8Array(32));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await crypto.subtle.importKey("raw", cek, aes, false, ["encrypt"]);
    const used = { ...aes, iv, additionalData: utf8.encode(protectedHeader), tagLength: 128 };
    const clear = json(data);
    if (clear.length > objectLimit) throw cloud.error("too-large", "加密设置备份超出允许大小");
    const [encrypted, recipients, signer] = await Promise.all([
      crypto.subtle.encrypt(used, key, clear),
      Promise.all(Object.entries(data.members).map(async ([kid, member]) => {
        const pub = await crypto.subtle.importKey("jwk", rsaPublic(member.key), rsa, false, ["encrypt"]);
        return { header: { kid }, encrypted_key: encode(new Uint8Array(await crypto.subtle.encrypt(rsa, pub, cek))) };
      })),
      crypto.subtle.importKey("jwk", data.signer, ec, false, ["sign"]),
    ]);
    cek.fill(0);
    const ct = new Uint8Array(encrypted);
    const jwe = { protected: protectedHeader, iv: encode(iv), ciphertext: encode(ct.subarray(0, -16)),
      tag: encode(ct.subarray(-16)), recipients };
    const signature = await crypto.subtle.sign(es256, signer, signingInput(jwe));
    return { jwe, jws: jwsProtected + ".." + encode(new Uint8Array(signature)) };
  }

  function readHeader(document) {
    if (!fields(document, ["jwe", "jws"]) || !fields(document.jwe, ["protected", "iv", "ciphertext", "tag", "recipients"])
      || typeof document.jws !== "string" || !document.jws.startsWith(jwsProtected + "..")) throw invalid();
    const { jwe } = document;
    const header = cloud.parseJson(decode.decode(bytes(jwe.protected)));
    if (!fields(header, ["alg", "enc", "owner", "vaultId", "sequence", "rootKey", "objects"]) || header.alg !== "RSA-OAEP-256"
      || header.enc !== "A256GCM" || typeof header.owner !== "string" || !accountId.test(header.owner)
      || typeof header.vaultId !== "string" || !uuid.test(header.vaultId) || !Array.isArray(jwe.recipients)
      || !Number.isSafeInteger(header.sequence) || header.sequence < 1) throw invalid();
    return header;
  }

  async function findArchiveDevice(document, userId) {
    const { owner, vaultId } = readHeader(document);
    if (userId && userId !== owner) throw cloud.error("owner-changed", "加密备份属于其他账号");
    const db = await database();
    const tx = db.transaction("devices", "readonly");
    const keys = await storageResult(tx, tx.objectStore("devices").index("vaultId").getAllKeys(vaultId));
    const recipients = new Set(document.jwe.recipients.map(item => item?.header?.kid));
    for (const key of keys) {
      if (!key.startsWith(owner + "\n")) continue;
      const device = await storage(key);
      if (device?.vaultId === vaultId && recipients.has(device.id)) return { owner, device };
    }
    return { owner, device: null };
  }

  function checkVersion(sequence, digest, seen) {
    if (seen && (sequence < seen.sequence || (sequence === seen.sequence && digest !== seen.digest))) {
      throw cloud.error("vault-rollback", "远端备份版本早于本机已验证版本");
    }
  }

  async function open(document, device, userId, recovery = false) {
    const header = readHeader(document);
    if (header.owner !== userId) throw invalid();
    const { jwe } = document;
    const rootKey = ecPublic(header.rootKey);
    if (device.vaultId && (device.vaultId !== header.vaultId || cloud.canonical(device.rootKey) !== cloud.canonical(rootKey))) throw invalid();
    const digest = await cloud.hash(json(document));
    checkVersion(header.sequence, digest, device.seen);
    const verifyKey = await crypto.subtle.importKey("jwk", rootKey, ec, false, ["verify"]);
    if (!await crypto.subtle.verify(es256, verifyKey, bytes(document.jws.slice(jwsProtected.length + 2), 64), signingInput(jwe))) throw invalid();
    const matches = jwe.recipients.filter(item => item?.header?.kid === device.id);
    if (!matches.length) {
      if (recovery) throw cloud.error("vault-file-mismatch", "这个恢复文件无法打开所选备份，请使用对应版本的恢复文件");
      throw cloud.error("vault-device", "请先用已授权设备确认配对");
    }
    if (matches.length !== 1) throw invalid();
    const cek = new Uint8Array(await crypto.subtle.decrypt(rsa, device.privateKey, bytes(matches[0].encrypted_key, 256)));
    const key = await crypto.subtle.importKey("raw", cek, aes, false, ["decrypt"]);
    cek.fill(0);
    const ct = bytes(jwe.ciphertext);
    if (ct.length > objectLimit) throw invalid();
    const encrypted = new Uint8Array(ct.length + 16);
    encrypted.set(ct);
    encrypted.set(bytes(jwe.tag, 16), ct.length);
    const data = cloud.parseJson(decode.decode(await crypto.subtle.decrypt({ ...aes, iv: bytes(jwe.iv, 12),
      additionalData: utf8.encode(jwe.protected), tagLength: 128 }, key, encrypted)));
    if (!fields(data, ["signer", "members", "settings", "achievements"]) || !data.members || Array.isArray(data.members)
      || cloud.canonical(ecPublic(data.signer)) !== cloud.canonical(rootKey)
      || !Array.isArray(header.objects) || cloud.canonical(header.objects) !== cloud.canonical(opaqueObjects(data.achievements))) throw invalid();
    const memberIds = Object.keys(data.members);
    if (memberIds.length !== jwe.recipients.length || new Set(jwe.recipients.map(item => item?.header?.kid)).size !== memberIds.length) throw invalid();
    for (const id of memberIds) {
      if (id !== await cloud.hash(json(rsaPublic(data.members[id]?.key))) || !jwe.recipients.some(item => item.header?.kid === id)) throw invalid();
    }
    const createdHere = device.draft?.header.vaultId === header.vaultId
      && cloud.canonical(device.draft.header.rootKey) === cloud.canonical(rootKey);
    if (!device.vaultId && !createdHere && (!device.request?.proof
      || device.request.proof !== data.members[device.id]?.proof)) throw cloud.error("vault-pair", "无法验证旧设备的授权，请重新配对");
    return { data, document, header: { owner: userId, vaultId: header.vaultId, rootKey, sequence: header.sequence }, digest };
  }

  async function openRemote(ctx, document, device, recovery) {
    const opened = await open(document, device, ctx.userId, recovery);
    const { vaultId, rootKey, sequence } = opened.header;
    const restored = await storage([keyFor(ctx), vaultId], undefined, "restores");
    if (restored && cloud.canonical(restored.rootKey) !== cloud.canonical(rootKey)) throw invalid();
    checkVersion(sequence, opened.digest, restored);
    return opened;
  }

  async function rememberRestore(ctx, opened) {
    const { vaultId, rootKey, sequence } = opened.header;
    const key = keyFor(ctx);
    const device = await storage(key);
    const next = device?.vaultId === vaultId && Object.hasOwn(opened.data.members, device.id)
      ? rememberedDevice(device, opened, false) : null;
    const db = await database();
    await ctx.check();
    const tx = db.transaction(next ? ["restores", "devices"] : "restores", "readwrite");
    if (next) tx.objectStore("devices").put(next, key);
    await storageResult(tx, tx.objectStore("restores").put({ rootKey, sequence, digest: opened.digest }, [key, vaultId]));
  }

  async function recoveryDevice(file) {
    if (!fields(file, ["type", "owner", "vaultId", "rootKey", "kid", "key"]) || file.type !== "steam-buff-recovery-v3"
      || !accountId.test(file.owner) || !uuid.test(file.vaultId) || file.kid !== await cloud.hash(json(rsaPublic(file.key)))) throw invalid();
    const privateKey = await crypto.subtle.importKey("jwk", file.key, rsa, false, ["decrypt"]);
    return { id: file.kid, privateKey, vaultId: file.vaultId, rootKey: ecPublic(file.rootKey) };
  }

  function rememberedDevice(device, opened, applied) {
    const { vaultId, rootKey, sequence } = opened.header;
    const initialRecovery = device.draft?.recovery;
    const recovery = device.pendingRecovery ?? initialRecovery;
    return { id: device.id, publicKey: device.publicKey, privateKey: device.privateKey,
      vaultId, rootKey, seen: { sequence, digest: opened.digest }, latest: opened.document,
      document: applied ? opened.document : device.document,
      ...(recovery?.vaultId === vaultId && opened.data.members[recovery.kid]?.recovery && { pendingRecovery: recovery }) };
  }

  async function remember(ctx, device, opened, applied = true) {
    await saveDevice(ctx, rememberedDevice(device, opened, applied));
  }

  async function recoverySaved(ctx, kid) {
    const device = await readDevice(ctx);
    if (device?.pendingRecovery?.kid !== kid) return;
    const { pendingRecovery, ...confirmed } = device;
    await saveDevice(ctx, confirmed);
  }

  function encodeDocument(document) {
    const payload = json(document);
    if (payload.length > envelopeLimit) throw cloud.error("too-large", "加密备份超出允许大小");
    return { formatVersion: format, extensionVersion: cloud.localVersion(), payload: cloud.base64(payload) };
  }

  function decodeDocument(bundle) {
    if (!fields(bundle, ["formatVersion", "extensionVersion", "payload"]) || bundle.formatVersion !== format
      || !cloud.validVersion(bundle.extensionVersion) || typeof bundle.payload !== "string"
      || bundle.payload.length > Math.ceil(envelopeLimit / 3) * 4 || bundle.payload.length % 4
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(bundle.payload)) throw invalid();
    const payload = Uint8Array.from(root.atob(bundle.payload), c => c.charCodeAt(0));
    if (payload.length > envelopeLimit || cloud.base64(payload) !== bundle.payload) throw invalid();
    return { document: cloud.parseJson(decode.decode(payload)), payload };
  }

  root.STSettingsVault = Object.freeze({ format, envelopeLimit, invalid, readDevice, findArchiveDevice, newDevice, pairRequest, parsePair, shardCache,
    create, open, openRemote, rememberRestore, seal, recoveryDevice, recoveryRecipient, recoverySaved, remember, encodeDocument, decodeDocument });
})(globalThis);
