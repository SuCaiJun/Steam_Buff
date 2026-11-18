/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 自动化本地任务与事件领取事务
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  let opening = null;
  function database() {
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      const request = root.indexedDB.open("SteamBuffAutomation", 6);
      let failed = false;
      request.onupgradeneeded = () => {
        const jobs = request.result.createObjectStore("jobs", { keyPath: "id" });
        jobs.createIndex("event", "eventKey", { unique: true });
        jobs.createIndex("owner-time", ["owner", "createdAt", "id"]);
        jobs.createIndex("status", "status");
        jobs.createIndex("deadline", ["status", "deadline"]);
        jobs.createIndex("delivery", "deliveryAt");
        jobs.createIndex("status-time", ["status", "createdAt", "id"]);
        jobs.createIndex("run-deadline", "runDeadlineAt");
      };
      request.onerror = () => {
        opening = null;
        reject(request.error);
      };
      request.onblocked = () => {
        failed = true;
        opening = null;
        reject(new Error("自动化任务库被旧窗口占用"));
      };
      request.onsuccess = () => {
        if (failed) {
          request.result.close();
          return;
        }
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          opening = null;
        };
        resolve(db);
      };
    });
    return opening;
  }
  const result = (request) =>
    new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  async function transaction(stores, mode, work) {
    const db = await database(),
      tx = db.transaction(stores, mode);
    const done = new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error || new Error("自动化任务未提交"));
      tx.onerror = () => {
        /* 事务 abort 统一拒绝并保留原始错误 */
      };
    });
    try {
      const value = await work(tx);
      await done;
      return value;
    } catch (error) {
      try {
        tx.abort();
      } catch (abortError) {
        if (abortError.name !== "InvalidStateError")
          throw new Error("取消自动化事务失败", { cause: error });
      }
      await Promise.allSettled([done]);
      throw error;
    }
  }
  function get(id) {
    return transaction(["jobs"], "readonly", (tx) => result(tx.objectStore("jobs").get(id)));
  }
  /** 同批候选中仍可领取的触发键；最终互斥由写事务保证 */
  function unclaimed(keys) {
    return transaction(["jobs"], "readonly", async (tx) => {
      const jobs = tx.objectStore("jobs");
      const claimed = await Promise.all(keys.map((key) => result(jobs.index("event").getKey(key))));
      return new Set(keys.filter((_, index) => claimed[index] === undefined));
    });
  }
  /** 同轮同一操作的触发一起领取；事务完成前不启动 AI 请求或副作用 */
  function create(job, current = () => true) {
    return transaction(["jobs"], "readwrite", async (tx) => {
      const jobs = tx.objectStore("jobs");
      const existing = await result(jobs.index("event").getKey(job.eventKey));
      if (!current()) return null;
      if (existing !== undefined) return { created: false, job: await result(jobs.get(existing)) };
      jobs.add(job);
      return { created: true, job };
    });
  }
  function change(id, mutate) {
    return transaction(["jobs"], "readwrite", async (tx) => {
      const store = tx.objectStore("jobs"),
        job = await result(store.get(id));
      if (!job) throw new Error("自动化任务已不存在");
      const next = mutate(job);
      if (next === null) return null;
      if (!next.outbox?.length && !next.noticeCleanup?.length) next.deliveryAt = 0;
      next.updatedAt = Date.now();
      store.put(next);
      return next;
    });
  }
  function byStatus(statuses) {
    return transaction(["jobs"], "readonly", async (tx) => {
      const index = tx.objectStore("jobs").index("status"),
        out = [];
      for (const status of statuses) out.push(...(await result(index.getAll(status))));
      return out;
    });
  }
  function queued(limit, occupied = new Set()) {
    return transaction(["jobs"], "readonly", tx => new Promise((resolve, reject) => {
      const request = tx.objectStore("jobs").index("status-time").openCursor(root.IDBKeyRange.bound(["queued", 0, ""], ["queued", Number.MAX_SAFE_INTEGER, []])), rows = [];
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || rows.length >= limit) { resolve(rows); return; }
        const job = cursor.value, key = JSON.stringify([job.owner, job.trigger?.id]);
        if (!occupied.has(key)) { rows.push(job); occupied.add(key); }
        cursor.continue();
      };
    }));
  }
  function deliveries(now, limit = 20) {
    return transaction(["jobs"], "readonly", (tx) =>
      result(tx.objectStore("jobs").index("delivery").getAll(root.IDBKeyRange.bound(1, now), limit)),
    );
  }
  function nextDelivery() {
    return transaction(["jobs"], "readonly", async (tx) => {
      const cursor = await result(
        tx.objectStore("jobs").index("delivery").openCursor(root.IDBKeyRange.lowerBound(1)),
      );
      return cursor?.value.deliveryAt ?? null;
    });
  }
  function due(now) {
    return transaction(["jobs"], "readonly", async (tx) => {
      const index = tx.objectStore("jobs").index("deadline"),
        out = [];
      for (const status of ["queued", "waiting-notification", "waiting-delay"])
        out.push(...(await result(index.getAll(root.IDBKeyRange.bound([status, 1], [status, now])))));
      return out;
    });
  }
  function dueRuns(now) {
    return transaction(["jobs"], "readonly", tx =>
      result(tx.objectStore("jobs").index("run-deadline").getAll(root.IDBKeyRange.bound(1, now))));
  }
  function nextDeadline() {
    return transaction(["jobs"], "readonly", async (tx) => {
      const jobs = tx.objectStore("jobs"), index = jobs.index("deadline");
      const run = await result(jobs.index("run-deadline").openCursor(root.IDBKeyRange.lowerBound(1)));
      let next = run?.value.runDeadlineAt ?? null;
      for (const status of ["queued", "waiting-notification", "waiting-delay"]) {
        const cursor = await result(
          index.openCursor(root.IDBKeyRange.bound([status, 1], [status, Number.MAX_SAFE_INTEGER])),
        );
        if (cursor && (next === null || cursor.value.deadline < next)) next = cursor.value.deadline;
      }
      return next;
    });
  }
  /** 设备级失败不含账号业务数据；与当前账号记录合并分页，始终保留全部可访问结果 */
  function list(owner, before = null) {
    return transaction(["jobs"], "readonly", async (tx) => {
      const index = tx.objectStore("jobs").index("owner-time");
      function readOwner(value) {
        return new Promise((resolve, reject) => {
          const range = before
            ? root.IDBKeyRange.bound([value, 0, ""], [value, before[0], before[1]], false, true)
            : root.IDBKeyRange.bound([value, 0, ""], [value, Number.MAX_SAFE_INTEGER, []]);
          const request = index.openCursor(range, "prev"), rows = [];
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor || rows.length === 21) {
              resolve(rows);
              return;
            }
            const job = cursor.value;
            rows.push({
              id: job.id, type: job.type, workflowName: job.workflow.name, triggerName: job.trigger.name, appid: job.appid,
              status: job.status, createdAt: job.createdAt, updatedAt: job.updatedAt,
              ...(job.status === "running-script" && job.workflow && job.flow ? { currentAction: root.STWorkflow.currentNode(job.workflow, job.flow)?.action } : {}),
              deadline: job.deadline || 0, error: job.error || "", summary: job.summary || "",
              deliveryPending: !!job.outbox?.length || !!job.noticeCleanup?.length,
              deliveryError: job.deliveryError || "",
            });
            cursor.continue();
          };
        });
      }
      const rows = await readOwner("");
      if (owner) rows.push(...await readOwner(owner));
      rows.sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
      const more = rows.length > 20;
      rows.length = Math.min(rows.length, 20);
      const last = rows.at(-1);
      return { rows, next: more ? [last.createdAt, last.id] : null };
    });
  }
  root.STAutomationStore = Object.freeze({
    get,
    unclaimed,
    create,
    change,
    byStatus,
    queued,
    deliveries,
    nextDelivery,
    due,
    dueRuns,
    nextDeadline,
    list,
  });
})(globalThis);
