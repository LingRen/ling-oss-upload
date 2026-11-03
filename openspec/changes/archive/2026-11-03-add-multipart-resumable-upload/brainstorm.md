## Design Summary

为 `ling-oss-upload` 新增「大文件分片上传 + 断点续传」能力。核心思路：采用**签名 URL**（后端签名，浏览器不碰密钥，STS 移到后端）+ **注入式 `getSignedUrl` 回调**的合同；保留现有客户端签名 POST `upload()` 与小程序 `createMiniUploadInfo()` 原样不动（加法，非迁移）。

## Alternatives Considered

### Alternative A: 客户端签名（保持现状）
- **Approach**: 浏览器持有 `accessId/accessKey`，自行实现 OSS REST 头部签名完成分片上传。
- **Pros**: 自包含，无需后端配合；改动最小。
- **Cons**: 长期密钥持续暴露在前端；分片流程重、时间长，泄露风险被放大；需在库内新增第二套 REST 签名逻辑。
- **Why not chosen**: 与引入 STS 的初衷相悖——永久密钥仍留在浏览器。

### Alternative B: STS 优先（浏览器持临时凭证签名）
- **Approach**: 后端下发临时 `accessId/accessKey/securityToken`，库在浏览器用临时凭证自行签名上传。
- **Pros**: 凭证短期有效，泄露影响小。
- **Cons**: 浏览器仍需做签名运算；需处理凭证过期刷新；仍是客户端加密。
- **Why not chosen**: 用户倾向后端签名、前端完全不碰密钥。

### Alternative C: 签名 URL（后端签名）—— 选中
- **Approach**: 后端持有密钥（内部可用 STS），按需给浏览器签发带 `Signature` 的 URL；库只负责按 URL 发起请求。
- **Pros**: 前端零密钥；签名逻辑全部收敛到后端；天然支持过期重签与续传。
- **Cons**: 需后端提供签名接口；前后端需约定 URL 合同。

### URL 合同：一次性票据 vs 注入式回调 vs 固定 REST 端点
- (i) 一次性票据：后端一次返回全部 URL，最简单，但签名 URL 的 `Expires` 需覆盖整个上传时长，跨天续传困难。
- (ii) 注入式回调 `getSignedUrl`：按需签发，灵活、天然支持「过期重新要 URL」与断点续传 —— **选中**。
- (iii) 固定 REST 端点：把库锁死在某种后端 API 形状上，不选。

### objectKey：前端算 vs 后端分配
- 前端算（沿用 `dirName`/selfName 命名逻辑）—— **选中**；合同保持「只返回 URL」的干净形状，安全顾虑由后端签名前校验 key 前缀兜底。
- 后端分配：更安全，但 init 步骤会变成「返回 `{url, objectKey}`」的不规则形状，破坏回调对称性。

### 兼容性：保留旧 POST vs 全量迁移
- 保留旧 `upload()` 客户端签名 POST，新增 `uploadLarge()` —— **选中**（加法，不破坏现有调用方）。

## Agreed Approach

新增 `uploadLarge()`，走 OSS Multipart Upload API（init → 分片 PUT → complete，失败时 abort），通过注入的 `getSignedUrl` 回调按需获取每步签名 URL；分片状态（uploadId + 已传分片 ETag）持久化到 localStorage，支持断点续传。旧 `upload()` 与 `createMiniUploadInfo()` 完全不动。

## Key Decisions

1. 凭证模型：签名 URL，浏览器不碰密钥（STS 后端化）。
2. URL 合同：`getSignedUrl({verb, objectKey, partNumber?, uploadId?, action?}) => Promise<string>`。
3. 兼容策略：保留旧路径，新增大文件路径（加法，非迁移）。
4. objectKey：前端计算（沿用 dirName/selfName），后端签名前校验前缀。
5. 分片大小：默认 1MB（OSS 最小 100KB），可配置。
6. 并发：默认 3 路并发，可配置。
7. 续传存储：localStorage，按文件指纹为 key，只存元数据（不存文件内容）。
8. 小程序：v1 不做，只做浏览器。

## Open Questions

- 签名 URL 过期后的重签策略：库是否自动重新调用 `getSignedUrl`（默认：过期即重签）待定。
- 后端签名版本（OSS V1/V2）与 bucket CORS 放行（PUT/DELETE/POST）属后端配置，不在本库合同内。
