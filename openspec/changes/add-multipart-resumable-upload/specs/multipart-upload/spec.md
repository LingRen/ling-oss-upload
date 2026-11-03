## ADDED Requirements

### Requirement: Multipart upload of large files

The library SHALL upload a file using the OSS Multipart Upload API (initiate multipart upload, upload each part, complete multipart upload) when `uploadLarge()` is invoked.

#### Scenario: Successful multipart upload
- **WHEN** a file is uploaded via `uploadLarge()` and every part uploads successfully
- **THEN** the library initiates a multipart upload, uploads all parts, calls CompleteMultipartUpload, and resolves with the object URL

### Requirement: Signed URL contract via getSignedUrl callback

The library SHALL obtain the URL for every OSS operation (initiate, part upload, complete, abort, list parts) by invoking an injected `getSignedUrl` callback, and SHALL NOT hold or use any access key or security token in the browser for the large-file path.

#### Scenario: No secret held in browser
- **WHEN** `uploadLarge()` is used
- **THEN** every OSS request URL is obtained from the `getSignedUrl` callback, and the library never requires `accessId`, `accessKey`, or `securityToken`

### Requirement: Configurable part splitting

The library SHALL split the file into parts of a configurable size (`chunkSize`), defaulting to 1MB and never smaller than the OSS minimum part size of 100KB.

#### Scenario: Default chunk size
- **WHEN** `uploadLarge()` is called without a `chunkSize` option
- **THEN** the file is split into parts of at most 1MB (the final part may be smaller)

### Requirement: Concurrent part upload with progress

The library SHALL upload parts with a configurable concurrency (`concurrency`, default 3) and SHALL report aggregate progress through `onProgress`.

#### Scenario: Aggregate progress reported
- **WHEN** parts are uploaded concurrently
- **THEN** `onProgress` is invoked with the cumulative uploaded bytes relative to the total file size

### Requirement: Resumable upload from persisted state

The library SHALL persist multipart upload state (object key, uploadId, and the completed part numbers with their ETags) to localStorage keyed by a file fingerprint, and SHALL resume an interrupted upload by restoring that state and reconciling with the server via ListParts.

#### Scenario: Resume after interruption
- **WHEN** an upload is interrupted after some parts completed, and `uploadLarge()` is called again for the same file
- **THEN** the library restores the saved uploadId and completed parts, uploads only the remaining parts, and completes the upload

### Requirement: Abort on failure

The library SHALL abort the multipart upload via AbortMultipartUpload and clear the persisted state when an upload fails and cannot be resumed.

#### Scenario: Abort and clear persisted state
- **WHEN** an upload fails permanently (for example, completion fails)
- **THEN** the library calls AbortMultipartUpload and removes the persisted resume state

### Requirement: Backward compatibility of existing upload methods

The existing `upload()` and `createMiniUploadInfo()` methods SHALL retain their current behavior and signatures.

#### Scenario: Existing methods unchanged
- **WHEN** callers use `upload()` or `createMiniUploadInfo()` as before
- **THEN** their behavior is unchanged by this addition

