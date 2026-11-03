# 小程序 STS 模式 Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** 为 ling-oss-upload 的小程序路径新增零密钥上传（后端签名 POST 表单）。

**Architecture:** 新增 createMiniUploadInfoBySigner() 走注入的 getMiniUploadInfo 回调获取签名字段，保留 createMiniUploadInfo() 不动；STS 服务新增 /mini-post 接口。

**Tech Stack:** TypeScript、Node、ali-oss（STS 服务签名）、jest + jsdom。

---

## Task 1: 类型与合同

- [ ] **Step 1:** 在 src/interface.ts 定义 MiniSignedFields / MiniSignRequest / GetMiniUploadInfo / MiniUploadBySignerOptions，先写引用让 tsc 报错（红）。
- [ ] **Step 2:** 同步 index.d.ts。
- [ ] **Step 3:** 运行 npx tsc --noEmit 确认通过（绿）。

## Task 2: 库方法

- [ ] **Step 1:** 实现 createMiniUploadInfoBySigner()：计算 objectKey → 调回调 → 组装 MiniOutType（红→绿，单测覆盖）。
- [ ] **Step 2:** 复用 getDirName / getCalculateObjectName 保证 key 一致。

## Task 3: STS 服务

- [ ] **Step 1:** server/sts-server.js 新增 GET /mini-post：构建 policy → base64 → HMAC-SHA1 签名 → 返回字段。
- [ ] **Step 2:** 用 node 手动 smoke test /mini-post 返回结构。

## Task 4: 测试

- [ ] **Step 1:** createMiniUploadInfoBySigner 成功路径测试。
- [ ] **Step 2:** 回调抛错 reject 测试。
- [ ] **Step 3:** 回归 createMiniUploadInfo 不变。
