# Apply Receipt

- **Iteration:** 1
- **Change:** add-mini-sts-mode
- **Schema:** superspec
- **Worktree:** n/a (inline implementation on existing feature branch)
- **Branch:** feat/add-multipart-resumable-upload (stacked — shares server/sts-server.js with the multipart change)
- **Tasks completed:** 9 of 9
- **Remaining tasks:** 0
- **Executor:** manual inline (small change; superpowers available but not used for this size)
- **Timestamp:** 2026-11-04T00:00:00+08:00

## Summary

Implemented zero-secret (STS/backend-signed) mini-program upload.

- src/interface.ts + index.d.ts: new types (MiniSignedFields, MiniSignRequest, GetMiniUploadInfo, MiniUploadBySignerOptions).
- src/index.ts: added createMiniUploadInfoBySigner() — computes objectKey via existing naming logic, fetches signed POST fields via getMiniUploadInfo callback, assembles MiniOutType.
- server/sts-server.js: added GET /mini-post endpoint (policy + base64 + HMAC-SHA1 signature).
- test/unit/mini-sts.test.js: 3 tests (success, reject, regression).

Verification: tsc --noEmit clean; npm test 12/12 pass; /mini-post smoke test returns signed fields.
