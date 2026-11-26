/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置云同步的官方云与 WebDAV 传输
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */

((root) => {
  "use strict";

  const cloud = root.STSettingsCloud;
  const vault = root.STSettingsVault;
  const cfg = root.STConfig;
  const TIMEOUT_MS = 15 * 1000;
  const ETAG = /^"[\x21\x23-\x7e\x80-\xff]*"$/;
  let authClient;

  function officialMeta(data) {
    if (typeof data?.exists !== "boolean" || !Number.isInteger(data.revision)
      || data.revision < 0 || data.revision > 2147483647
      || (data.exists ? (data.revision === 0 || !cloud.HASH.test(data.payloadHash)
        || !cloud.validVersion(data.extensionVersion) || !Number.isInteger(data.payloadBytes)
        || data.payloadBytes < 1 || data.payloadBytes > vault.envelopeLimit)
        : (data.payloadHash !== "" || data.extensionVersion !== "" || data.payloadBytes !== 0))) {
      throw cloud.error("reply-invalid", "官方云备份响应格式无效");
    }
    const { exists, revision, payloadHash, extensionVersion, payloadBytes, bundle } = data;
    return { exists, revision, payloadHash, extensionVersion, payloadBytes, ...(bundle && { bundle }) };
  }

  async function officialRequest(ctx, method, url, body, canSend) {
    await ctx.check();
    authClient ??= root.STAuthClient.createClient({ storage: root.STSettings.storage, refreshUrl: cfg.loginAuth("/auth/refresh") });
    const result = await authClient.authedRequest(url, {
      method, body, operationId: ctx.operationId, ownerId: ctx.userId, sessionKey: ctx.sessionKey,
      timeoutMs: TIMEOUT_MS, throwOnMissingAuth: true, logFailures: false, touchAuth: false,
      privateRequest: true,
      readResponse: response => response.body ? cloud.readText(response.body, Math.ceil(vault.envelopeLimit / 3) * 4 + 8192) : "",
      async beforeSend() {
        await ctx.check();
        if (canSend && !canSend()) throw cloud.error("local-changed", "本机设置已变化");
      },
    });
    await ctx.check();
    const status = result.response.status;
    if (status === 409) throw Object.assign(cloud.error("remote-changed", "远端备份已变化"), { status, remote: officialMeta(result.body) });
    if (status !== 200) {
      const message = { 401: "登录已过期，请重新登录", 403: "当前权益不包含设置云同步",
        404: "找不到加密成就译文分片", 422: "加密备份缺少成就译文分片", 429: "请求过于频繁，请稍后再试",
        503: "官方云备份或独立归档暂不可用" }[status];
      throw Object.assign(cloud.error("official-http", message || "官方云备份请求失败"), { status });
    }
    if (result.body?.code !== 200) throw cloud.error("reply-invalid", "官方云备份响应格式无效");
    return result.body;
  }

  function official(ctx) {
    const call = (method, url, body, canSend) => officialRequest(ctx, method, url, body, canSend);
    return {
      async check() { return officialMeta(await call("GET", cfg.urls.userSettingsMeta)); },
      async read() { return officialMeta(await call("GET", cfg.urls.userSettings)); },
      async put(revision, bundle, canSend) {
        const saved = officialMeta(await call("PUT", cfg.urls.userSettings, { basedOnRevision: revision, bundle }, canSend));
        if (!saved.exists || saved.revision !== revision + 1) throw cloud.error("reply-invalid", "官方云备份写入回执无效");
        return saved;
      },
      async remove(revision) {
        const deleted = officialMeta(await call("DELETE", cfg.urls.userSettings, { basedOnRevision: revision }));
        if (deleted.exists || deleted.revision !== revision + 1) throw cloud.error("reply-invalid", "官方云备份删除回执无效");
      },
      async readObject(digest) {
        const result = await call("GET", cfg.urls.userSettingsObject(digest));
        if (result.digest !== digest || typeof result.payload !== "string") throw vault.invalid();
        return result.payload;
      },
      async putObject(digest, payload, canSend) {
        const result = await call("PUT", cfg.urls.userSettingsObject(digest), { payload }, canSend);
        if (result.digest !== digest) throw vault.invalid();
      },
    };
  }

  async function verifyEntitlement(ctx) {
    const body = await officialRequest(ctx, "GET", cfg.urls.userSettingsAccess);
    if (String(body.userId ?? "") !== ctx.userId) {
      throw cloud.error("owner-changed", "请先在用户中心确认当前账号");
    }
  }

  function tag(response) {
    const value = response.headers.get("ETag");
    if (!value || !ETAG.test(value)) {
      throw cloud.error("webdav-etag", "WebDAV 未返回强 ETag，无法安全同步");
    }
    return value;
  }

  function webdavHttp(status) {
    const message = {
      401: "WebDAV 用户名或密码不正确", 403: "WebDAV 拒绝访问，请检查文件夹读写权限",
      404: "找不到 WebDAV 文件或文件夹", 405: "WebDAV 服务器不允许所需操作",
      409: "WebDAV 文件夹不存在或有冲突", 423: "WebDAV 文件已锁定", 429: "WebDAV 请求过于频繁",
      507: "WebDAV 空间不足",
    }[status];
    return Object.assign(cloud.error("webdav-http", message || "WebDAV 请求失败"), { status });
  }

  function precondition(revision) {
    return revision === null ? { "If-None-Match": "*" } : { "If-Match": revision };
  }

  function davConnection(ctx, config) {
    const { directory, username, password } = cloud.webdavConfig(config);
    const origin = root.STAI.hostPermissionPattern(directory);
    const authorization = "Basic " + cloud.base64(new TextEncoder().encode(username + ":" + password));
    return async (name, method, headers, body, read, signal, canSend) => {
      if (!await root.chrome.permissions.contains({ origins: [origin] })) {
        throw cloud.error("webdav-permission", "请在云同步设置中授权 WebDAV 站点");
      }
      await ctx.check();
      if (canSend && !canSend()) throw cloud.error("local-changed", "本机设置已变化");
      return root.STNetworkRequest.run(TIMEOUT_MS, async requestSignal => {
        const response = await root.fetch(new URL(name, directory), {
          method,
          headers: { Authorization: authorization, ...(body !== undefined && { "Content-Type": "application/json" }), ...headers },
          body, credentials: "omit", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer", signal: requestSignal,
        });
        try {
          return await read(response);
        } finally {
          if (response.body && !response.bodyUsed) await response.body.cancel();
        }
      }, signal);
    };
  }

  function webdav(ctx, config) {
    const request = davConnection(ctx, config);
    // 同一个 WebDAV 文件夹可以被多个 Steam Buff 账号使用，各自使用稳定文件名
    const file = cloud.hash(new TextEncoder().encode("steam-buff-settings-v3:" + ctx.userId));
    const filename = async () => "steam-buff-settings-v3-" + await file + ".json";
    const objectName = async digest => "steam-buff-settings-v3-" + await file + "-" + digest + ".json";
    const empty = { exists: false, revision: null, payloadHash: "", extensionVersion: "", payloadBytes: 0 };
    async function read(known) {
      const headers = known?.revision ? { "If-None-Match": known.revision } : {};
      const response = await request(await filename(), "GET", headers, undefined, async res => {
        if (res.status === 404) return empty;
        if (res.status === 304 && known?.revision && tag(res) === known.revision) {
          return { ...known, exists: true };
        }
        if (res.status !== 200) throw webdavHttp(res.status);
        const revision = tag(res);
        if (!res.body) throw cloud.error("reply-invalid", "WebDAV 备份文件为空");
        const bundle = cloud.parseJson(await cloud.readText(res.body, Math.ceil(vault.envelopeLimit / 3) * 4 + 256));
        const remote = { exists: true, revision, extensionVersion: bundle?.extensionVersion, bundle };
        if (!cloud.validVersion(bundle?.extensionVersion)) throw vault.invalid();
        if (cloud.compareVersion(cloud.localVersion(), bundle.extensionVersion) < 0)
          return { ...remote, requiresUpgrade: true };
        const { payload } = vault.decodeDocument(bundle);
        return { ...remote, payloadHash: await cloud.hash(payload), payloadBytes: payload.length };
      });
      await ctx.check();
      return response;
    }

    async function put(revision, bundle, canSend) {
      await request(await filename(), "PUT", precondition(revision), JSON.stringify(bundle), res => {
        if (res.status === 412) throw cloud.error("remote-changed", "WebDAV 备份已变化");
        if (res.status !== 200 && res.status !== 201 && res.status !== 204) throw webdavHttp(res.status);
        if ((res.status === 201) !== (revision === null)) {
          throw cloud.error("webdav-conditions", "WebDAV 未正确执行条件写入");
        }
      }, undefined, canSend);
      // PUT 回执可省略 ETag；通过 GET 核对服务器保存的是刚刚发送的同一个包
      const saved = await read();
      if (saved.bundle?.payload !== bundle.payload || saved.extensionVersion !== bundle.extensionVersion || saved.requiresUpgrade) {
        throw cloud.error("remote-changed", "WebDAV 备份已变化");
      }
      return saved;
    }

    async function remove(revision) {
      await request(await filename(), "DELETE", precondition(revision), undefined, res => {
        if (res.status === 412 || res.status === 404) throw cloud.error("remote-changed", "WebDAV 备份已变化");
        if (res.status !== 200 && res.status !== 204) throw webdavHttp(res.status);
      });
      await ctx.check();
    }

    async function readObject(digest) {
      return request(await objectName(digest), "GET", {}, undefined, async res => {
        if (res.status !== 200) throw webdavHttp(res.status);
        if (!res.body) throw vault.invalid();
        const value = cloud.parseJson(await cloud.readText(res.body, Math.ceil(vault.envelopeLimit / 3) * 4 + 256));
        if (typeof value?.payload !== "string") throw vault.invalid();
        return value.payload;
      });
    }

    async function putObject(digest, payload, canSend) {
      const created = await request(await objectName(digest), "PUT", precondition(null), JSON.stringify({ payload }), res => {
        if (res.status === 412) return false;
        if (res.status !== 201) throw webdavHttp(res.status);
        return true;
      }, undefined, canSend);
      if (!created && await readObject(digest) !== payload) throw vault.invalid();
      await ctx.check();
    }

    async function verifyStagedObject(digest, payload, canSend) {
      let remote;
      try {
        remote = await readObject(digest);
      } catch (error) {
        if (error.code !== "webdav-http" || error.status !== 404) throw error;
        await putObject(digest, payload, canSend);
        return;
      }
      if (remote !== payload) throw vault.invalid();
    }

    return { check: read, read: () => read(), put, remove, readObject, putObject, verifyStagedObject };
  }

  /** 使用独占随机文件确认强 ETag、首次创建和更新/删除前置条件，不接触实际备份 */
  async function testWebdav(ctx, config) {
    const name = "steam-buff-webdav-test-" + root.crypto.randomUUID() + ".json";
    const first = '{"probe":1}', second = '{"probe":2}';
    const request = davConnection(ctx, config);
    let created = false;
    try {
      await root.STNetworkRequest.run(TIMEOUT_MS, async signal => {
        const send = (method, headers, body, read) => request(name, method, headers, body, read, signal);
        const get = expected => send("GET", {}, undefined, async res => {
          if (res.status !== 200) throw webdavHttp(res.status);
          const etag = tag(res);
          if (!res.body || await cloud.readText(res.body, 128) !== expected) {
            throw cloud.error("webdav-conditions", "WebDAV 没有正确保存测试文件");
          }
          return etag;
        });
        const expectFailed = res => {
          if (res.status === 412) return;
          if (!res.ok) throw webdavHttp(res.status);
          throw cloud.error("webdav-conditions", "WebDAV 未拒绝过期的写入条件，不能安全同步");
        };
        await send("PUT", precondition(null), first, res => {
          if (res.status !== 201) throw webdavHttp(res.status);
          created = true;
        });
        const initial = await get(first);
        const stale = '"' + root.crypto.randomUUID() + '"';
        await send("PUT", precondition(null), second, expectFailed);
        await send("PUT", precondition(stale), second, expectFailed);
        await send("DELETE", precondition(stale), undefined, expectFailed);
        await send("PUT", precondition(initial), second, res => {
          if (res.status !== 200 && res.status !== 204) throw webdavHttp(res.status);
        });
        const latest = await get(second);
        if (latest === initial) throw cloud.error("webdav-etag", "WebDAV 文件变化后未更新 ETag");
        await send("DELETE", precondition(latest), undefined, res => {
          if (res.status !== 200 && res.status !== 204) throw webdavHttp(res.status);
          created = false;
        });
      });
    } catch (error) {
      if (created) {
        try {
          // 此处只清理刚创建的随机测试文件。真实备份的删除始终需要强 ETag
          await request(name, "DELETE", {}, undefined, res => {
            if (![200, 204, 404].includes(res.status)) throw webdavHttp(res.status);
          });
        } catch (cause) {
          throw Object.assign(new Error("WebDAV 测试未完成，可能留有 steam-buff-webdav-test 临时文件", {
            cause: new AggregateError([error, cause], "连接测试及临时文件清理失败"),
          }), { code: "webdav-cleanup" });
        }
      }
      throw error;
    }
  }

  root.STSettingsCloudRemotes = Object.freeze({ official, webdav, testWebdav, verifyEntitlement });
})(globalThis);
