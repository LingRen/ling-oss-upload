/**
 * Demo 服务 —— 一条命令同时提供:
 *   1. 静态页面 /demo.html 与构建产物 /index.js
 *   2. 签名接口 /sign 与 /mini-post(浏览器在这个服务里取签名, 不持有密钥)
 *   3. 配置接口 /api/config(前端通过接口拿到 bucket/region/CDN 域名等非敏感配置)
 *   4. STS 接口 /api/sts(返回临时凭证, 供 uploadBySts 直传, 不分片)
 *
 * 凭证来源(优先级从高到低):
 *   - 环境变量 OSS_ACCESS_ID / OSS_ACCESS_KEY / OSS_BUCKET / OSS_REGION / OSS_SECURITY_TOKEN
 *   - test/ossInfo.js 里的 accessId / accessKey / bucketName / ossRegion / ossHost / host(本地开发用, 已被 gitignore)
 *   - 若没有 bucketName / ossRegion, 会从 ossHost 解析出 bucket 与 region
 *
 * 启动:
 *   npm run demo
 *   或 PORT=3000 node server/demo-server.js
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const OSS = require("ali-oss");
const { createSigner } = require("./sign");
const { TEST_DIR, resolveOssConfig } = require("./config");

const port = Number(process.env.PORT || 3000);
// 默认只监听本机：页面会读取 test/ossInfo.js 的凭证，避免暴露到局域网
const host = process.env.DEMO_HOST || "127.0.0.1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml"
};

// 配置优先读环境变量，其次读 test/ossInfo.js
const {
  accessKeyId,
  accessKeySecret,
  bucket,
  region,
  stsToken,
  cdnHost,
  secure,
  expires,
  roleArn: stsRoleArn,
  stsAccessId,
  stsAccessKey,
  stsEndpoint,
  stsDuration,
  stsPrefixes
} = resolveOssConfig();

// /api/sts 配置: 已有临时凭证直接用; 否则用配置的 AK/SK 调 AssumeRole
const stsRoleSession = process.env.STS_ROLE_SESSION || "ling-oss-upload-demo";
const stsPolicy = process.env.STS_POLICY || "";

function stsEndpointUrl() {
  if (!stsEndpoint) {
    return undefined;
  }
  return /^https?:\/\//i.test(stsEndpoint)
    ? stsEndpoint
    : "https://" + stsEndpoint;
}

if (!accessKeyId || !accessKeySecret || !bucket) {
  console.error(
    "缺少 OSS 凭证。请设置环境变量 OSS_ACCESS_ID / OSS_ACCESS_KEY / OSS_BUCKET,\n" +
      "或在 test/ossInfo.js 中提供 accessId / accessKey / bucketName / ossRegion。"
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

let stsClient = null;
let stsCache = null;

function defaultStsPolicy() {
  // ossInfo.js 里的 stsImgPrefixes / stsVideoPrefixes 限制可写目录
  const resources = (stsPrefixes.length ? stsPrefixes : [""]).map(function (prefix) {
    return "acs:oss:*:*:" + bucket + "/" + prefix + "*";
  });

  return {
    Version: "1",
    Statement: [
      {
        Effect: "Allow",
        Action: ["oss:PutObject"],
        Resource: resources
      }
    ]
  };
}

async function getStsCredentials(roleArnFromQuery) {
  const roleArn = roleArnFromQuery || stsRoleArn;
  // 1. 配置本身就是 STS 临时凭证
  if (stsToken) {
    return {
      accessId: accessKeyId,
      accessKey: accessKeySecret,
      securityToken: stsToken,
      expiration: null,
      temporary: true
    };
  }

  // 命中缓存（过期前 5 分钟刷新）
  if (
    stsCache &&
    stsCache.roleArn === roleArn &&
    stsCache.expiration &&
    new Date(stsCache.expiration).getTime() - Date.now() > 5 * 60 * 1000
  ) {
    return stsCache;
  }

  // 2. 配置了角色 ARN：AssumeRole
  if (roleArn) {
    if (!stsClient) {
      stsClient = new OSS.STS({
        accessKeyId: stsAccessId,
        accessKeySecret: stsAccessKey,
        endpoint: stsEndpointUrl()
      });
    }
    const result = await stsClient.assumeRole(
      roleArn,
      stsPolicy || defaultStsPolicy(),
      Math.max(900, stsDuration),
      stsRoleSession
    );
    const credentials = result.credentials || {};
    stsCache = {
      accessId: credentials.AccessKeyId,
      accessKey: credentials.AccessKeySecret,
      securityToken: credentials.SecurityToken,
      expiration: credentials.Expiration,
      temporary: true,
      roleArn
    };
    return stsCache;
  }

  // 3. 没有角色 ARN：无法生成 STS，回退长期 AK/SK
  return {
    accessId: accessKeyId,
    accessKey: accessKeySecret,
    securityToken: null,
    expiration: null,
    temporary: false,
    warning:
      "未生成 STS：阿里云 STS 需要 RAM 角色 ARN。请在 test/ossInfo.js 增加 roleArn，或设置 STS_ROLE_ARN"
  };
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

function serveStatic(pathname, res) {
  const relative = pathname === "/" ? "/demo.html" : pathname;
  const file = path.resolve(TEST_DIR, "." + relative);

  // 防止 ../ 越界
  if (file !== TEST_DIR && !file.startsWith(TEST_DIR + path.sep)) {
    sendJson(res, 403, { error: "forbidden" });
    return;
  }

  fs.readFile(file, (err, content) => {
    if (err) {
      sendJson(res, 404, { error: "not found: " + relative });
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(content);
  });
}

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

  // 前端通过接口获取非敏感配置
  if (parsed.pathname === "/api/config") {
    sendJson(res, 200, {
      bucket,
      region,
      cdnHost,
      submitUrl: "https://" + bucket + "." + region + ".aliyuncs.com",
      dirName: process.env.DEMO_DIR || "formal/test/demo",
      hasSts: Boolean(stsToken || stsRoleArn),
      roleArn: stsRoleArn || ""
    });
    return;
  }

  // STS 临时凭证，供 uploadBySts 直传（不分片）
  if (parsed.pathname === "/api/sts") {
    const roleArn = parsed.query.roleArn ? String(parsed.query.roleArn) : "";
    if (roleArn && !/^acs:ram::\d+:role\/.+$/.test(roleArn)) {
      sendJson(res, 400, {
        error: "roleArn 格式应为 acs:ram::<账号ID>:role/<角色名>"
      });
      return;
    }
    getStsCredentials(roleArn)
      .then(function (credentials) {
        sendJson(res, 200, credentials);
      })
      .catch(function (e) {
        sendJson(res, 400, { error: e.message });
      });
    return;
  }

  if (parsed.pathname === "/sign") {
    try {
      sendJson(res, 200, { url: sign(parsed.query) });
    } catch (e) {
      sendJson(res, 400, { error: e.message });
    }
    return;
  }

  if (parsed.pathname === "/mini-post") {
    try {
      const objectKey = String(parsed.query.objectKey || "");
      const limitSize = Number(parsed.query.limitSize || 0);
      sendJson(res, 200, signMiniPost(objectKey, limitSize));
    } catch (e) {
      sendJson(res, 400, { error: e.message });
    }
    return;
  }

  serveStatic(parsed.pathname, res);
});

server.listen(port, host, () => {
  console.log("Demo server: http://localhost:" + port + "/demo.html");
  console.log(
    "  bucket=" + bucket +
      " region=" + region +
      " sts=" + (stsToken ? "token" : stsRoleArn ? "assume-role" : "disabled")
  );
  if (cdnHost) {
    console.log("  cdnHost=" + cdnHost);
  }
  if (!fs.existsSync(path.join(TEST_DIR, "index.js"))) {
    console.warn(
      "  [警告] test/index.js 不存在, 请先执行 npm run build 或使用 npm run demo"
    );
  }
});
