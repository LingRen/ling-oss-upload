/**
 * STS 本地服务 —— 为 ling-oss-upload 的 uploadLarge() 提供签名 URL
 *
 * 作用: 充当 getSignedUrl 回调的后端, 用配置的 OSS 凭证(支持 STS 临时凭证)签名 URL。
 * 浏览器端零密钥: 库只拿签名 URL, 后端负责签名。
 *
 * 环境变量:
 *   OSS_ACCESS_ID     必需  AccessKeyId(或 STS 临时 AccessKeyId)
 *   OSS_ACCESS_KEY    必需  AccessKeySecret(或 STS 临时 AccessKeySecret)
 *   OSS_BUCKET        必需  bucket 名称
 *   OSS_SECURITY_TOKEN 可选 STS 安全令牌(使用临时凭证时传入)
 *   OSS_REGION        可选  默认 oss-cn-hangzhou
 *   OSS_SECURE        可选  默认 1 (生成 https URL), 传 0 用 http
 *   OSS_EXPIRES       可选  签名过期秒数, 默认 3600
 *   PORT              可选  默认 8080
 *
 * 启动:
 *   OSS_ACCESS_ID=xxx OSS_ACCESS_KEY=xxx OSS_BUCKET=my-bucket node server/sts-server.js
 *
 * 接口:
 *   GET /sign?verb=POST&objectKey=formal/a.jpg&action=init
 *   GET /sign?verb=PUT&objectKey=formal/a.jpg&partNumber=1&uploadId=xxx&action=part
 *   GET /sign?verb=POST&objectKey=formal/a.jpg&uploadId=xxx&action=complete
 *   GET /sign?verb=DELETE&objectKey=formal/a.jpg&uploadId=xxx&action=abort
 *   GET /sign?verb=GET&objectKey=formal/a.jpg&uploadId=xxx&action=listParts
 *   返回: { "url": "https://..." }
 */

const http = require("http");
const url = require("url");
const OSS = require("ali-oss");

const region = process.env.OSS_REGION || "oss-cn-hangzhou";
const bucket = process.env.OSS_BUCKET;
const accessKeyId = process.env.OSS_ACCESS_ID;
const accessKeySecret = process.env.OSS_ACCESS_KEY;
const stsToken = process.env.OSS_SECURITY_TOKEN || undefined;
const secure = process.env.OSS_SECURE !== "0";
const port = Number(process.env.PORT || 8080);
const expires = Number(process.env.OSS_EXPIRES || 3600);

if (!accessKeyId || !accessKeySecret || !bucket) {
  console.error("缺少配置: 需要 OSS_ACCESS_ID / OSS_ACCESS_KEY / OSS_BUCKET");
  process.exit(1);
}

const client = new OSS({
  region,
  accessKeyId,
  accessKeySecret,
  stsToken,
  bucket,
  secure
});

// action -> 请求方法; 其余子资源(uploadId/partNumber)按 query 动态拼接
const ACTION_MAP = {
  init: { method: "POST", subResource: { uploads: "" } },
  part: { method: "PUT" },
  complete: { method: "POST" },
  abort: { method: "DELETE" },
  listParts: { method: "GET" }
};

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

  return client.signatureUrl(objectKey, {
    method: conf.method,
    expires,
    subResource
  });
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsed = url.parse(req.url, true);

  if (parsed.pathname === "/sign") {
    try {
      const signedUrl = sign(parsed.query);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ url: signedUrl }));
    } catch (e) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(port, () => {
  console.log(
    "STS sign server: http://localhost:" +
      port +
      " (region=" +
      region +
      " bucket=" +
      bucket +
      " sts=" +
      (stsToken ? "yes" : "no") +
      ")"
  );
});
