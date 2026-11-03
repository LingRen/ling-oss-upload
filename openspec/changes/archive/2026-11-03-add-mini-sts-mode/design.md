## Context

小程序路径 createMiniUploadInfo() 目前在小程序端计算 POST policy + signature（持有 accessKeySecret）。大文件路径 uploadLarge() 已改为后端签名（getSignedUrl 回调，零密钥）。本变更把后端签名模式引入小程序 POST 上传。

## Goals / Non-Goals

**Goals:**
- 新增 createMiniUploadInfoBySigner()，小程序零密钥。
- 通过 getMiniUploadInfo 回调解耦后端签名。
- 保留 createMiniUploadInfo()（客户端签名）不动。
- STS 本地服务新增 /mini-post 接口返回签名字段。

**Non-Goals:**
- 不做小程序分片上传（wx.uploadFile 只支持表单 POST，分片仍不实现）。
- 不在小程序端做任何签名运算。

## Decisions

### 1. 回调合同

getMiniUploadInfo({ objectKey, limitSize }) 返回 Promise<MiniSignedFields>，其中 MiniSignedFields = { OSSAccessKeyId, policy, signature, x-oss-security-token? }。回调只返回「签名字段」，objectKey 与 name 由库计算。

### 2. 命名逻辑保留在库内

复用现有 getDirName / getCalculateObjectName，新方法与 createMiniUploadInfo 生成一致的 objectKey。

### 3. 新方法为 async

createMiniUploadInfoBySigner 需 await 回调，因此返回 Promise<MiniOutType>（与 createMiniUploadInfo 的同步返回不同，属新增语义）。

### 4. STS 服务 /mini-post 接口

后端构建 policy（expiration + conditions：bucket starts-with、key starts-with、content-length-range），base64 编码，用 STS secret 做 HMAC-SHA1 签名，返回 { OSSAccessKeyId, policy, signature, x-oss-security-token }。

### 5. 复用 MiniOutType

新方法返回结构与 MiniOutType 完全一致，便于 wx.uploadFile 直接使用。

## Risks / Trade-offs

- [回调抛错] -> 直接 reject，由小程序侧处理并提示。
- [policy expiration 过期] -> 后端控制（默认 1 天），过期后重新请求。
- [新旧方法并存] -> 命名逻辑两处调用，需保持一致的 key 生成规则。

## Migration Plan

纯增量。旧 createMiniUploadInfo() 不动，新方法 createMiniUploadInfoBySigner() 供小程序按需接入；回滚 = 不使用新方法即可。

## Open Questions

- /mini-post 的 key 约束用 starts-with 还是 exact。
