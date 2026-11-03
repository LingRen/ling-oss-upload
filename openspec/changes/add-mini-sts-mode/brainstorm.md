## Design Summary

为 ling-oss-upload 的小程序路径新增「零密钥 / STS」模式：小程序不再持有 accessKeySecret，而是通过注入的 getMiniUploadInfo 回调向后端获取签名后的 POST 表单字段（policy + signature + OSSAccessKeyId + x-oss-security-token），由后端用 STS 临时凭证签名。与上一轮大文件路径的 getSignedUrl 模型对齐。

## Alternatives Considered

### Alternative A: 保持客户端签名（现状）
- **Approach**: 小程序端用 accessKeySecret 计算 POST policy + signature（现有 createMiniUploadInfo）。
- **Pros**: 无需后端配合，实现简单。
- **Cons**: 小程序包内持有长期密钥，泄露风险大；与「零密钥」目标相悖。
- **Why not chosen**: 用户明确要求小程序不持有密钥。

### Alternative B: 后端签名（注入回调）—— 选中
- **Approach**: 库计算 objectKey，调用注入的 getMiniUploadInfo 回调，后端用 STS 签名并返回 policy/signature 等字段。
- **Pros**: 小程序零密钥；与大文件路径 getSignedUrl 一致；命名逻辑仍留在库内。
- **Cons**: 需后端提供签名接口。

### Alternative C: 后端一次性返回完整表单
- **Approach**: 后端直接返回完整 formData（含 key/name），库只透传。
- **Pros**: 库改动最小。
- **Cons**: objectKey 命名逻辑移到后端，破坏库内 dirName/selfName 的一致性；回调合同不干净。
- **Why not chosen**: 保持命名逻辑在库内，回调只返回「签名字段」。

## Agreed Approach

新增 createMiniUploadInfoBySigner()：库按现有命名逻辑计算 objectKey，调用 getMiniUploadInfo 回调获取后端签名字段，组装完整 MiniOutType 返回；现有 createMiniUploadInfo()（客户端签名）完全不动。STS 本地服务新增 /mini-post 接口返回签名字段。

## Key Decisions

1. 凭证模型：后端签名（STS），小程序零密钥。
2. 合同：getMiniUploadInfo({ objectKey, limitSize }) 返回 Promise<{ OSSAccessKeyId, policy, signature, x-oss-security-token }>。
3. 命名逻辑保留在库内（复用 getDirName / getCalculateObjectName）。
4. 新增方法，保留现有 createMiniUploadInfo 不动。
5. STS 服务新增 /mini-post 接口。

## Open Questions

- /mini-post 的 policy conditions 用 starts-with（前缀）还是 exact（精确 key）。
- policy expiration 时长由后端控制（默认 1 天）。
