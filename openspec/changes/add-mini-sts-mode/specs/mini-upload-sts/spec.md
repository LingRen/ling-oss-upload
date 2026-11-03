## ADDED Requirements

### Requirement: Backend-signed mini-program upload info

The library SHALL provide a method that obtains signed POST form fields (policy, signature, OSSAccessKeyId, and security token) from an injected backend callback, so the mini-program never holds or uses the access key secret.

#### Scenario: No secret held in mini-program
- **WHEN** the mini-program upload info is created via the signer method
- **THEN** the library invokes the getMiniUploadInfo callback for the signed fields and never requires the access key secret in the mini-program

#### Scenario: Object key computed by the library
- **WHEN** the signer method is called with a dirName
- **THEN** the library computes the object key using its own naming logic and passes that key to the callback

### Requirement: Backward compatibility of createMiniUploadInfo

The existing createMiniUploadInfo() method SHALL retain its current behavior and signature.

#### Scenario: Existing method unchanged
- **WHEN** callers use createMiniUploadInfo() as before
- **THEN** its behavior is unchanged by this addition
