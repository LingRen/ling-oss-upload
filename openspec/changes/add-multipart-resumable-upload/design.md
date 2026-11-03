## Context

`ling-oss-upload` 目前只有一条上传路径：OSS **POST object** 单次表单上传，由浏览器用 `accessKeySecret` 自行计算 policy 签名（`src/index.ts` 的 `getPolicyBase64` / `getSignature`）。没有分片、没有断点续传。

本次新增**大文件分片上传 + 断点续传**：采用签名 URL（后端签名，STS 后端化）+ 注入式 `getSignedUrl` 回调。浏览器不再持有或使用任何密钥（旧 `upload()` 的客户端签名逻辑保留不动，供小文件路径继续使用）。

## Goals / Non-Goals

**Goals:**
- 新增 `uploadLarge()`，走 OSS Multipart Upload API 完成大文件分片上传。
- 支持断点续传：分片状态（uploadId + 已传分片 ETag）持久化到 localStorage。
- 通过 `getSignedUrl` 回调解耦后端签名，浏览器零密钥。
- 保持旧 `upload()` / `createMiniUploadInfo()` 行为与签名完全不变。

**Non-Goals:**
- 不做小程序分片上传（v1，`wx.uploadFile` 只支持表单 POST，分片需 PUT 二进制，单独评估）。
- 不在浏览器做任何 OSS 签名运算。
- 不修改 CLI（`bin/upload.js`，与库无关）。

## Decisions

### 1. 签名 URL 合同：注入式 getSignedUrl 回调

回调职责被压到最小：只返回一个签名 URL。HTTP 请求与响应解析全部由库完成：

- init：POST 到签名 URL（`?uploads`），解析 XML 取 `UploadId`。
- part：PUT 二进制到签名 URL（`?partNumber=N&uploadId=...`），从响应头取 `ETag`。
- complete：POST 分片列表 XML 到签名 URL（`?uploadId=...`）。
- abort：DELETE 签名 URL（`?uploadId=...`）。
- listParts：GET 签名 URL（`?uploadId=...`），解析已传分片用于续传对账。

选择回调而非一次性票据，是为了签名 URL 过期时能重新调用回调续签，这是断点续传的硬需求。

### 2. 分片状态机

init -> uploadPart(1..N, 并发) -> complete，失败走 abort；续传时先 listParts 对账再补传剩余分片。分片状态按 partNumber 升序在 complete 时提交。

### 3. 续传状态存储

localStorage key 形如 ling-oss-upload:<fileFingerprint>，value 只存元数据（objectKey / uploadId / chunkSize / parts[{partNumber, etag}]），不存文件内容。文件指纹 = 文件名 + 大小 + lastModified 的哈希。

### 4. 分片与并发

- chunkSize 默认 1MB，最小 100KB（OSS 硬约束），可配置。
- 并发默认 3 路，用简单并发队列（最多 3 个 PUT 在途，完成一个补一个）。
- onProgress 按累计已传字节 / 总字节聚合上报。

### 5. 公共 API

新增 uploadLarge()，构造时不再需要密钥；objectKey 命名复用现有 getDirName / getCalculateObjectName 逻辑。旧构造方式保留，仅 uploadLarge 路径不使用密钥。

## Risks / Trade-offs

- [签名 URL 过期] -> 收到签名过期时重新调用 getSignedUrl 续签重试。
- [localStorage 被清] -> 只存元数据；被清后回退为全新上传（重新 init）。
- [并发分片顺序] -> 完成时按 partNumber 升序提交，与上传顺序解耦。
- [旧路径回归] -> 新增代码独立成模块，不改旧签名/上传逻辑。

## Migration Plan

纯增量：旧 upload() / createMiniUploadInfo() 签名与行为不变，无需迁移。新能力通过 uploadLarge() 暴露，回滚 = 不使用新方法即可。

## Open Questions

- getSignedUrl 回调抛错时的重试/退避策略（默认：不重试，直接失败）。
- onProgress 是否计入续传恢复时已完成的字节（默认：恢复后从已完成进度继续）。

