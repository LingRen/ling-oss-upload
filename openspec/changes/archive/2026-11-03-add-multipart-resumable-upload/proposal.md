## Why

当前 `ling-oss-upload` 只支持 OSS POST object 单次表单上传，无法上传大文件，也不能断点续传——网络中断后只能从头重传。为支持大文件稳定上传，需要新增分片上传 + 断点续传能力，并借此把密钥从前端移除（改由后端签名，STS 后端化）。

## What Changes

- **上传能力**
  - From: 只有单次 POST 表单上传（`upload()`），无分片、无续传。
  - To: 新增 `uploadLarge()`，走 OSS Multipart Upload API 完成大文件分片上传。
  - Reason: 支持大文件与弱网场景下的稳定上传。
  - Impact: 非破坏性，纯新增方法。

- **凭证模型**
  - From: 浏览器持有 `accessKeySecret` 自行签名。
  - To: 大文件路径改用签名 URL（后端签名），浏览器零密钥。
  - Reason: 避免长期密钥暴露在前端，STS 收敛到后端。
  - Impact: 旧 `upload()` 客户端签名保留不动；新路径需后端提供签名接口。

- **断点续传**
  - From: 无任何续传能力。
  - To: 分片状态持久化到 localStorage，支持中断后从断点恢复。
  - Reason: 大文件上传中断后无需重传已完成分片。
  - Impact: 纯新增。

## Capabilities

### New Capabilities
- `multipart-upload`: 大文件分片上传 + 断点续传，通过注入式 `getSignedUrl` 签名 URL 合同解耦后端签名。

### Modified Capabilities
（无 —— 现有 spec 为空，旧 POST 路径行为不变，无需 delta）

## Impact

- 源码：`src/index.ts`、`src/interface.ts`、`src/utils.ts`（新增分片引擎模块，不改旧路径）。
- 类型：`index.d.ts` 同步新增 `SignedUrlRequest` / `GetSignedUrl` / `MultipartUploadOptions` 等。
- 依赖：无需新增运行时依赖（浏览器侧不再需要签名运算）。
- 后端：需提供 `getSignedUrl` 签名接口，并配置 bucket CORS 放行 PUT/DELETE/POST。

