/**
 * OSS 签名核心逻辑（供 sts-server / demo-server 复用）
 * 只负责签名，不对外暴露 accessKey。
 */
const crypto = require("crypto");
const OSS = require("ali-oss");

// action -> 请求方法; 其余子资源(uploadId/partNumber)按 query 动态拼接
const ACTION_MAP = {
  init: { method: "POST", subResource: { uploads: "" } },
  part: { method: "PUT" },
  complete: { method: "POST" },
  abort: { method: "DELETE" },
  listParts: { method: "GET" }
};

/**
 * @param {{accessKeyId:string, accessKeySecret:string, bucket:string, region:string, stsToken?:string, secure?:boolean, expires?:number}} config
 */
function createSigner(config) {
  const {
    accessKeyId,
    accessKeySecret,
    bucket,
    region,
    stsToken,
    secure = true,
    expires = 3600
  } = config;

  const client = new OSS({
    region,
    accessKeyId,
    accessKeySecret,
    stsToken,
    bucket,
    secure
  });

  /**
   * 分片上传各步骤的签名 URL
   * @param {object} query { objectKey, action, uploadId?, partNumber? }
   */
  function sign(query) {
    const objectKey = String(query.objectKey || "");
    const action = String(query.action || "");

    if (!objectKey) {
      throw new Error("缺少 objectKey");
    }

    const conf = ACTION_MAP[action];
    if (!conf) {
      throw new Error("未知 action: " + action);
    }

    const subResource = Object.assign({}, conf.subResource || {});
    if (query.uploadId) {
      subResource.uploadId = String(query.uploadId);
    }
    if (query.partNumber) {
      subResource.partNumber = String(query.partNumber);
    }

    const options = {
      method: conf.method,
      expires,
      subResource
    };

    // 请求实际会携带 Content-Type(分片 PUT 的 blob.type、complete 的 application/xml),
    // 签名时必须纳入, 否则 OSS 返回 SignatureDoesNotMatch
    if (query.contentType) {
      options["Content-Type"] = String(query.contentType);
    }

    return client.signatureUrl(objectKey, options);
  }

  /**
   * 小程序 POST 表单签名: 构建 policy + HMAC-SHA1 签名
   */
  function signMiniPost(objectKey, limitSize) {
    if (!objectKey) {
      throw new Error("缺少 objectKey");
    }

    const expiration = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const conditions = [
      ["eq", "$key", objectKey],
      ["starts-with", "$bucket", ""]
    ];
    if (limitSize && !isNaN(+limitSize)) {
      conditions.push(["content-length-range", 0, +limitSize]);
    }

    const policy = Buffer.from(
      JSON.stringify({ expiration, conditions })
    ).toString("base64");
    const signature = crypto
      .createHmac("sha1", accessKeySecret)
      .update(policy)
      .digest("base64");

    const fields = {
      OSSAccessKeyId: accessKeyId,
      policy,
      signature
    };
    if (stsToken) {
      fields["x-oss-security-token"] = stsToken;
    }
    return fields;
  }

  return { sign, signMiniPost };
}

module.exports = { createSigner, ACTION_MAP };
