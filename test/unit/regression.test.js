const LingOssUpload = require("../../.test-dist/index.js").default;

function makeFile(size) {
  return new File([new Uint8Array(size)], "test.bin", {
    type: "application/octet-stream",
    lastModified: 1600000000000
  });
}

beforeEach(() => {
  localStorage.clear();
});

describe("5.5 回归: 旧 upload() / createMiniUploadInfo() 行为不变", () => {
  test("构造函数仍接受 accessId/accessKey, 且不再强校验(大文件路径无需密钥)", () => {
    expect(() => new LingOssUpload()).not.toThrow();
    expect(() => new LingOssUpload({ accessId: "ak", accessKey: "sk" })).not.toThrow();
  });

  test("upload() 仍使用客户端签名 POST, 返回完整 URL", async () => {
    const uploader = new LingOssUpload({ accessId: "ak", accessKey: "sk" });
    const file = makeFile(100);

    let capturedFormData = null;
    const mockUploadFile = (host, formData) => {
      capturedFormData = formData;
      return Promise.resolve();
    };

    const result = await uploader.upload({
      file,
      host: "https://cdn.example.com",
      dirName: "formal",
      selfName: true,
      uploadFile: mockUploadFile
    });

    expect(result.success).toBe(true);
    expect(result.data).toBe("https://cdn.example.com/formal/test.bin");

    expect(capturedFormData.get("OSSAccessKeyId")).toBe("ak");
    expect(capturedFormData.get("key")).toBe("formal/${filename}");
    expect(capturedFormData.get("policy")).toBeTruthy();
    expect(capturedFormData.get("signature")).toBeTruthy();
  });

  test("uploadBySts() 获取临时凭证后直传, 携带 security-token", async () => {
    const uploader = new LingOssUpload();
    const file = makeFile(100);

    let capturedFormData = null;
    const result = await uploader.uploadBySts({
      file,
      host: "https://cdn.example.com",
      dirName: "formal",
      selfName: true,
      getStsToken: () =>
        Promise.resolve({
          accessId: "sts-ak",
          accessKey: "sts-sk",
          securityToken: "sts-token"
        }),
      uploadFile: (host, formData) => {
        capturedFormData = formData;
        return Promise.resolve();
      }
    });

    expect(result.success).toBe(true);
    expect(result.data).toBe("https://cdn.example.com/formal/test.bin");
    expect(capturedFormData.get("OSSAccessKeyId")).toBe("sts-ak");
    expect(capturedFormData.get("x-oss-security-token")).toBe("sts-token");

    // OSS PostObject 要求 file 最后，security-token 必须在 file 之前
    const keys = Array.from(capturedFormData.keys());
    expect(keys.indexOf("x-oss-security-token")).toBeLessThan(
      keys.indexOf("file")
    );
  });

  test("uploadBySts() 兼容阿里云 SDK 的 PascalCase 凭证字段", async () => {
    const uploader = new LingOssUpload();
    let capturedFormData = null;

    await uploader.uploadBySts({
      file: makeFile(10),
      host: "https://cdn.example.com",
      dirName: "formal",
      getStsToken: () =>
        Promise.resolve({
          AccessKeyId: "STS.pascal",
          AccessKeySecret: "sk",
          SecurityToken: "pascal-token"
        }),
      uploadFile: (host, formData) => {
        capturedFormData = formData;
        return Promise.resolve();
      }
    });

    expect(capturedFormData.get("OSSAccessKeyId")).toBe("STS.pascal");
    expect(capturedFormData.get("x-oss-security-token")).toBe("pascal-token");
  });

  test("createMiniUploadInfo() 返回结构不变, 支持 STS token", () => {
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
    expect(info.success_action_status).toBe(200);
    expect(info["x-oss-security-token"]).toBe("token123");
  });

  test("缺少密钥时, 旧方法抛错(校验移到方法内), 大文件方法不抛", async () => {
    const noSecret = new LingOssUpload();

    expect(() => noSecret.createMiniUploadInfo({ dirName: "d" })).toThrow(
      "check oss accessId || accessKey"
    );

    await expect(
      noSecret.upload({
        file: makeFile(10),
        host: "h",
        dirName: "d",
        uploadFile: () => Promise.resolve()
      })
    ).rejects.toThrow("check oss accessId || accessKey");
  });

  test("STS AccessId 缺少 securityToken 时提前报错", async () => {
    const uploader = new LingOssUpload({
      accessId: "STS.test-id",
      accessKey: "sk"
    });

    expect(() => uploader.createMiniUploadInfo({ dirName: "d" })).toThrow(
      "securityToken"
    );

    await expect(
      uploader.upload({
        file: makeFile(10),
        host: "h",
        dirName: "d",
        uploadFile: () => Promise.resolve()
      })
    ).rejects.toThrow("securityToken");
  });
});
