/**
 * STS 本地服务 —— 为 ling-oss-upload 的 uploadLarge() 提供签名 URL
 *
 * 作用: 充当 getSignedUrl 回调的后端, 用配置的 OSS 凭证(支持 STS 临时凭证)签名 URL。
 * 浏览器端零密钥: 库只拿签名 URL, 后端负责签名。
 *
 * 环境变量:
 *   OSS_ACCESS_ID      必需  AccessKeyId(或 STS 临时 AccessKeyId)
 *   OSS_ACCESS_KEY     必需  AccessKeySecret(或 STS 临时 AccessKeySecret)
 *   OSS_BUCKET         必需  bucket 名称
 *   OSS_SECURITY_TOKEN 可选  STS 安全令牌(使用临时凭证时传入)
 *   OSS_REGION         可选  默认 oss-cn-hangzhou
 *   OSS_SECURE         可选  默认 1 (生成 https URL), 传 0 用 http
 *   OSS_EXPIRES        可选  签名过期秒数, 默认 3600
 *   PORT               可选  默认 8080
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
 *
 *   GET /mini-post?objectKey=formal/a.jpg&limitSize=1048576
 *   返回: { "OSSAccessKeyId", "policy", "signature", "x-oss-security-token" }
 */

const http = require("http");
const url = require("url");

const { createSigner } = require("./sign");
const { resolveOssConfig } = require("./config");

const port = Number(process.env.PORT || 8080);
// 环境变量优先，其次 test/ossInfo.js(accessId/accessKey/bucketName/ossRegion)
const {
  accessKeyId,
  accessKeySecret,
  bucket,
  region,
  stsToken,
  secure,
  expires
} = resolveOssConfig();

if (!accessKeyId || !accessKeySecret || !bucket) {
  console.error(
    "缺少配置: 请设置 OSS_ACCESS_ID / OSS_ACCESS_KEY / OSS_BUCKET，" +
      "或在 test/ossInfo.js 中提供 accessId / accessKey / bucketName / ossRegion"
  );
  process.exit(1);
}

const { sign, signMiniPost } = createSigner({
  accessKeyId,
  accessKeySecret,
  bucket,
  region,
  stsToken,
  secure,
  expires
});

function applyCors(req, res) {
  const origin = req.headers.origin;
  // 只允许本机页面跨端口访问，避免任意网站读取 /api/sts 的临时凭证
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
}

const server = http.createServer((req, res) => {
  applyCors(req, res);

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

  if (parsed.pathname === "/mini-post") {
    try {
      const objectKey = String(parsed.query.objectKey || "");
      const limitSize = Number(parsed.query.limitSize || 0);
      const fields = signMiniPost(objectKey, limitSize);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(fields));
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
