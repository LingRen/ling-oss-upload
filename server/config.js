/**
 * OSS 配置解析：环境变量优先，其次 test/ossInfo.js。
 * 支持 ossInfo 中的 bucketName / ossRegion / ossHost / host / securityToken。
 */
const fs = require("fs");
const path = require("path");

const TEST_DIR = path.resolve(__dirname, "../test");

// 读取本地 test/ossInfo.js(ESM 的 export default 转成 CommonJS 后执行)
function loadLocalOssInfo() {
  const file = path.join(TEST_DIR, "ossInfo.js");
  if (!fs.existsSync(file)) {
    return {};
  }
  try {
    const source = fs
      .readFileSync(file, "utf8")
      .replace(/export\s+default\s*/, "module.exports = ");
    const mod = { exports: {} };
    new Function("module", "exports", source)(mod, mod.exports);
    return mod.exports || {};
  } catch (e) {
    console.warn("[config] 读取 test/ossInfo.js 失败: " + e.message);
    return {};
  }
}

// 从 https://bucket.oss-cn-shenzhen.aliyuncs.com 解析 bucket / region
function parseOssHost(host) {
  const result = {};
  if (!host) {
    return result;
  }
  try {
    const hostname = new URL(host).hostname;
    const matched = /^(.+?)\.(oss-[a-z0-9-]+)\.aliyuncs\.com$/i.exec(hostname);
    if (matched) {
      result.bucket = matched[1];
      result.region = matched[2];
    }
  } catch (e) {
    // 不是合法 URL 时忽略
  }
  return result;
}

function resolveOssConfig() {
  const local = loadLocalOssInfo();
  const hostInfo = parseOssHost(process.env.OSS_HOST || local.ossHost);

  const accessKeyId = process.env.OSS_ACCESS_ID || local.accessId;
  const accessKeySecret = process.env.OSS_ACCESS_KEY || local.accessKey;

  const prefixList = [];
  [local.stsImgPrefixes, local.stsVideoPrefixes, process.env.STS_PREFIXES]
    .filter(Boolean)
    .forEach(function (value) {
      String(value)
        .split(",")
        .forEach(function (item) {
          const prefix = item.trim();
          if (prefix && prefixList.indexOf(prefix) === -1) {
            prefixList.push(prefix);
          }
        });
    });

  return {
    local,
    accessKeyId,
    accessKeySecret,
    // AssumeRole 可用单独的 STS key，未配置则复用主 AK/SK
    stsAccessId: process.env.STS_ACCESS_KEY_ID || local.stsKey || accessKeyId,
    stsAccessKey:
      process.env.STS_ACCESS_KEY_SECRET || local.stsSecret || accessKeySecret,
    bucket: process.env.OSS_BUCKET || local.bucketName || hostInfo.bucket,
    region:
      process.env.OSS_REGION ||
      local.ossRegion ||
      hostInfo.region ||
      "oss-cn-hangzhou",
    stsToken:
      process.env.OSS_SECURITY_TOKEN ||
      local.securityToken ||
      local.stsToken ||
      undefined,
    roleArn:
      process.env.STS_ROLE_ARN ||
      local.stsRoleArn ||
      local.roleArn ||
      "",
    stsEndpoint:
      process.env.STS_ENDPOINT ||
      local.stsEndpoint ||
      (local.stsRegionId || local.stsRegion
        ? "https://sts." +
          (local.stsRegionId || local.stsRegion) +
          ".aliyuncs.com"
        : ""),
    stsDuration: Number(
      process.env.STS_DURATION ||
        local.stsDurationSeconds ||
        local.stsDuration ||
        3600
    ),
    stsPrefixes: prefixList,
    cdnHost: (process.env.OSS_CDN_HOST || local.host || local.cdnHost || "").replace(
      /\/$/,
      ""
    ),
    secure: process.env.OSS_SECURE !== "0",
    expires: Number(process.env.OSS_EXPIRES || 3600)
  };
}

module.exports = { TEST_DIR, loadLocalOssInfo, parseOssHost, resolveOssConfig };
