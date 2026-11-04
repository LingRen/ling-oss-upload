const { installFakeXhr, parseUrl, makeGetSignedUrl } = require("./fakeXhr");
const LingOssUpload = require("../../.test-dist/index.js").default;
const { runWithConcurrency, uploadPart } = require("../../.test-dist/multipart.js");

const MB = 1024 * 1024;

function makeFile(size) {
  return new File([new Uint8Array(size)], "test.bin", {
    type: "application/octet-stream",
    lastModified: 1600000000000
  });
}

// 默认响应: 按 action 路由
function defaultHandler(method, url) {
  const q = parseUrl(url);
  switch (q.action) {
    case "init":
      return {
        status: 200,
        responseText:
          "<InitiateMultipartUploadResult><UploadId>upload-123</UploadId></InitiateMultipartUploadResult>"
      };
    case "part":
      return { status: 200, headers: { ETag: '\"etag-' + q.partNumber + '\"' } };
    case "complete":
      return { status: 200, responseText: "<CompleteMultipartUploadResult/>" };
    case "abort":
      return { status: 200, responseText: "" };
    case "listParts":
      return { status: 200, responseText: "<ListPartsResult/>" };
    default:
      return { status: 200, responseText: "" };
  }
}

beforeEach(() => {
  localStorage.clear();
});

describe("uploadLarge 分片上传", () => {
  test("5.1 成功路径: init -> 各分片 -> complete", async () => {
    installFakeXhr(defaultHandler);
    const uploader = new LingOssUpload();
    const file = makeFile(3 * MB); // 3 个 1MB 分片
    const calls = [];
    const getSignedUrl = makeGetSignedUrl(calls);

    const result = await uploader.uploadLarge({
      file,
      dirName: "formal/test",
      selfName: true,
      getSignedUrl,
      concurrency: 2
    });

    expect(result.success).toBe(true);
    expect(result.code).toBe(200);
    expect(result.data).toBe("formal/test/test.bin");

    const actions = calls.map((c) => c.action);
    expect(actions.filter((a) => a === "part").length).toBe(3);
    expect(actions).toContain("init");
    expect(actions).toContain("complete");
    // 全新上传没有已传分片，不应调用 ListParts(避免 oss:ListParts 权限依赖)
    expect(actions).not.toContain("listParts");

    // complete 请求带 application/xml, 签名必须一致, 否则 OSS 报 SignatureDoesNotMatch
    expect(calls.find((c) => c.action === "complete").contentType).toBe(
      "application/xml"
    );
  });

  test("5.6 分片签名携带 Blob 的 Content-Type", async () => {
    installFakeXhr(() => ({ status: 200, headers: { ETag: '"etag-1"' } }));
    const calls = [];
    const blob = new Blob(["hello"], { type: "image/png" });

    await uploadPart(
      makeGetSignedUrl(calls),
      "formal/test/a.png",
      "upload-1",
      1,
      blob
    );

    expect(calls[0].contentType).toBe("image/png");
  });

  test("5.2 断点续传: 复用 uploadId, 只补传剩余分片", async () => {
    // 预置续传状态: part 1 已传
    const MD5 = require("crypto-js/md5");
    const fp = MD5("test.bin:3145728:1600000000000").toString();
    localStorage.setItem(
      "ling-oss-upload:" + fp,
      JSON.stringify({
        objectKey: "formal/test/test.bin",
        uploadId: "upload-existing",
        chunkSize: 1 * MB,
        parts: [{ partNumber: 1, etag: '\"etag-1\"' }]
      })
    );

    // listParts 返回 part 1 已传
    installFakeXhr((method, url) => {
      const q = parseUrl(url);
      if (q.action === "listParts") {
        return {
          status: 200,
          responseText:
            "<ListPartsResult><Part><PartNumber>1</PartNumber><ETag>\"etag-1\"</ETag></Part></ListPartsResult>"
        };
      }
      return defaultHandler(method, url);
    });

    const uploader = new LingOssUpload();
    const file = makeFile(3 * MB);
    const calls = [];
    const getSignedUrl = makeGetSignedUrl(calls);

    const result = await uploader.uploadLarge({
      file,
      dirName: "formal/test",
      selfName: true,
      getSignedUrl
    });

    expect(result.success).toBe(true);
    expect(result.data).toBe("formal/test/test.bin");

    // 只有 part 2 / part 3 两个分片需要上传
    const partNumbers = calls
      .filter((c) => c.action === "part")
      .map((c) => c.partNumber);
    expect(partNumbers.sort()).toEqual([2, 3]);

    // init 不应再被调用(复用已有 uploadId)
    expect(calls.some((c) => c.action === "init")).toBe(false);

    // 成功后状态被清理
    expect(localStorage.getItem("ling-oss-upload:" + fp)).toBeNull();
  });

  test("5.3 完成失败: abort 并清理状态", async () => {
    installFakeXhr((method, url) => {
      const q = parseUrl(url);
      if (q.action === "complete") {
        return { status: 500, responseText: "<Error/>" };
      }
      return defaultHandler(method, url);
    });

    const uploader = new LingOssUpload();
    const file = makeFile(1 * MB);
    const calls = [];
    const getSignedUrl = makeGetSignedUrl(calls);

    await expect(
      uploader.uploadLarge({
        file,
        dirName: "d",
        selfName: true,
        getSignedUrl
      })
    ).rejects.toMatchObject({ success: false });

    // abort 被调用
    expect(calls.some((c) => c.action === "abort")).toBe(true);
    // 续传状态被清理
    expect(localStorage.length).toBe(0);
  });

  test("5.4 进度聚合上报到 100%", async () => {
    installFakeXhr((method, url) => {
      const q = parseUrl(url);
      if (q.action === "part") {
        return {
          status: 200,
          headers: { ETag: '\"etag-' + q.partNumber + '\"' },
          progress: { loaded: 1 * MB, total: 1 * MB }
        };
      }
      return defaultHandler(method, url);
    });

    const uploader = new LingOssUpload();
    const file = makeFile(2 * MB);
    const progressCalls = [];

    const result = await uploader.uploadLarge({
      file,
      dirName: "d",
      selfName: true,
      getSignedUrl: makeGetSignedUrl(),
      concurrency: 1,
      onProgress: (e) => progressCalls.push(e)
    });

    expect(result.success).toBe(true);
    expect(progressCalls.length).toBeGreaterThan(0);
    const last = progressCalls[progressCalls.length - 1];
    expect(last.loaded).toBe(file.size);
    expect(last.total).toBe(file.size);
  });
});

describe("并发队列", () => {
  test("5.4 并发数不超过 concurrency", async () => {
    let active = 0;
    let maxActive = 0;
    const items = [1, 2, 3, 4, 5, 6, 7, 8];

    await runWithConcurrency(items, 3, async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
    });

    expect(maxActive).toBeLessThanOrEqual(3);
    expect(maxActive).toBeGreaterThan(1);
  });
});
