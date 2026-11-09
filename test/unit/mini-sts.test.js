const LingOssUpload = require("../../.test-dist/index.js").default;

beforeEach(() => {
  localStorage.clear();
});

describe("createMiniUploadInfoBySigner 小程序零密钥上传", () => {
  test("4.1 成功路径: 回调返回签名字段, 组装正确", async () => {
    const uploader = new LingOssUpload(); // 无密钥
    const calls = [];

    const result = await uploader.createMiniUploadInfoBySigner({
      dirName: "formal",
      selfName: false,
      limitSize: 1024 * 1024,
      getMiniUploadInfo: async (req) => {
        calls.push(req);
        return {
          OSSAccessKeyId: "sts-access-id",
          policy: "policy-b64",
          signature: "signature-b64",
          "x-oss-security-token": "sts-token-123"
        };
      }
    });

    expect(result.success_action_status).toBe(200);
    expect(result.OSSAccessKeyId).toBe("sts-access-id");
    expect(result.policy).toBe("policy-b64");
    expect(result.signature).toBe("signature-b64");
    expect(result["x-oss-security-token"]).toBe("sts-token-123");
    expect(result.key).toContain("formal/");
    expect(result.name).toBeTruthy();

    // 回调收到 objectKey 与 limitSize
    expect(calls.length).toBe(1);
    expect(calls[0].objectKey).toBe(result.key);
    expect(calls[0].limitSize).toBe(1024 * 1024);
  });

  test("4.2 回调抛错时 reject", async () => {
    const uploader = new LingOssUpload();

    await expect(
      uploader.createMiniUploadInfoBySigner({
        dirName: "d",
        getMiniUploadInfo: () => Promise.reject(new Error("sign failed"))
      })
    ).rejects.toThrow("sign failed");
  });

  test("4.3 回归: 现有 createMiniUploadInfo 行为不变", () => {
    const uploader = new LingOssUpload({
      accessId: "ak",
      accessKey: "sk",
      securityToken: "token123"
    });

    const info = uploader.createMiniUploadInfo({ dirName: "formal" });

    expect(info.OSSAccessKeyId).toBe("ak");
    expect(info.key).toContain("formal/");
    expect(info.policy).toBeTruthy();
    expect(info.signature).toBeTruthy();
    expect(info["x-oss-security-token"]).toBe("token123");
  });

  test("4.4 createMiniUploadInfo 支持 fileName 原名", () => {
    const uploader = new LingOssUpload({
      accessId: "ak",
      accessKey: "sk"
    });

    const info = uploader.createMiniUploadInfo({
      dirName: "formal",
      selfName: true,
      fileName: "photo.jpg"
    });

    expect(info.name).toBe("photo.jpg");
    expect(info.key).toBe("formal/photo.jpg");
  });

  test("4.5 createMiniUploadInfoBySigner 支持 fileName 原名", async () => {
    const uploader = new LingOssUpload();
    let signedKey = "";

    const result = await uploader.createMiniUploadInfoBySigner({
      dirName: "formal",
      selfName: true,
      fileName: "photo.jpg",
      getMiniUploadInfo: async (req) => {
        signedKey = req.objectKey;
        return {
          OSSAccessKeyId: "sts-access-id",
          policy: "policy-b64",
          signature: "signature-b64"
        };
      }
    });

    expect(result.name).toBe("photo.jpg");
    expect(result.key).toBe("formal/photo.jpg");
    expect(signedKey).toBe("formal/photo.jpg");
  });
});
