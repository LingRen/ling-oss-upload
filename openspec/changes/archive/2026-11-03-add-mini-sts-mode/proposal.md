## Why

小程序上传到 OSS 目前在小程序端用 accessKeySecret 计算 POST policy 签名，密钥暴露在小程序包里，存在泄露风险。大文件路径已改为后端签名（零密钥），小程序路径也需要同样做到「不持有密钥、通过接口获取签名」。

## What Changes

- **小程序凭证模型**
  - From: 小程序端持有 accessKeySecret 自行计算 POST policy + signature。
  - To: 新增 createMiniUploadInfoBySigner()，通过注入的 getMiniUploadInfo 回调向后端获取签名 POST 表单字段，小程序零密钥。
  - Reason: 消除小程序包内密钥泄露风险，与大文件路径的零密钥模型对齐。
  - Impact: 非破坏性，纯新增方法。

- **STS 本地服务**
  - From: 只给大文件路径签 URL（/sign）。
  - To: 新增 /mini-post 接口，返回签名后的 POST 表单字段（policy/signature/OSSAccessKeyId/x-oss-security-token）。

- **兼容性**
  - From: createMiniUploadInfo() 客户端签名。
  - To: 保留不动，新方法并存。

## Capabilities

### New Capabilities
- mini-upload-sts: 小程序零密钥上传（后端签名 POST 表单）

### Modified Capabilities
（无 —— 现有 createMiniUploadInfo 行为不变，无需 delta）

## Impact

- 源码: src/index.ts、src/interface.ts（新增方法 + 类型，不改旧路径）。
- 类型: index.d.ts 同步新增。
- STS 服务: server/sts-server.js 新增 /mini-post 接口。
- 测试: test/unit/ 新增用例。
