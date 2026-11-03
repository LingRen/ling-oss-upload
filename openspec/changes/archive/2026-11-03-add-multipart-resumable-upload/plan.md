# 大文件分片上传 + 断点续传 Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** 为 `ling-oss-upload` 新增大文件分片上传与断点续传能力，通过签名 URL 回调解耦后端。

**Architecture:** 新增 `uploadLarge()` 走 OSS Multipart API（init → parts → complete/abort），注入 `getSignedUrl` 回调获取签名 URL；分片状态持久化到 localStorage 支持续传；旧 `upload()` / `createMiniUploadInfo()` 不动。

**Tech Stack:** TypeScript、Webpack、OSS Multipart Upload API、localStorage、现有 XML 解析能力。

---

## Task 1: 类型与合同定义

- [ ] **Step 1:** 在 `src/interface.ts` 定义 `SignedUrlRequest` / `GetSignedUrl` / `MultipartUploadOptions` / `ResumeState`，先写类型引用让 tsc 报错（红）。
- [ ] **Step 2:** 同步 `index.d.ts`，补齐 `securityToken` 声明。
- [ ] **Step 3:** 运行 `npx tsc --noEmit` 确认类型通过（绿）。

## Task 2: 分片引擎

- [ ] **Step 1:** 实现 initiate：调用回调取 URL，POST 后解析 XML 取 uploadId（红→绿，单测覆盖）。
- [ ] **Step 2:** 实现单分片 PUT：按 chunkSize 切片，PUT 后从响应头取 ETag。
- [ ] **Step 3:** 实现并发队列（默认 3），聚合 onProgress。
- [ ] **Step 4:** 实现 complete：按 partNumber 升序提交分片列表。
- [ ] **Step 5:** 实现 abort 与失败清理。

## Task 3: 断点续传

- [ ] **Step 1:** 实现文件指纹 + localStorage 读写。
- [ ] **Step 2:** 实现恢复：读状态 → listParts 对账 → 只补传剩余分片。
- [ ] **Step 3:** 成功后清状态；失败且可恢复时保留。

## Task 4: 公共 API 与测试

- [ ] **Step 1:** 在 `LingOssUpload` 增加 `uploadLarge()`，接入引擎与命名逻辑。
- [ ] **Step 2:** 补全成功 / 续传 / 失败 / 并发 / 进度测试。
- [ ] **Step 3:** 回归旧 `upload()` / `createMiniUploadInfo()`。

