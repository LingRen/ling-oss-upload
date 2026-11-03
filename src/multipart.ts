import MD5 from "crypto-js/md5";

import { PartInfo, ResumeState, GetSignedUrl } from "./interface";

const STORAGE_PREFIX = "ling-oss-upload:";

interface XhrResponse {
  status: number;
  getHeader: (name: string) => string | null;
  responseText: string;
}

/**
 * 通用 XHR 请求（浏览器端，用于分片上传各步骤）
 */
export function request(
  method: string,
  url: string,
  body?: Blob | string,
  onProgress?: (e: ProgressEvent) => void,
  headers?: { [key: string]: string }
): Promise<XhrResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    if (headers) {
      Object.keys(headers).forEach((k) => xhr.setRequestHeader(k, headers[k]));
    }
    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (e: ProgressEvent) => {
        if (e.lengthComputable) {
          onProgress(e);
        }
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({
          status: xhr.status,
          getHeader: (name: string) => xhr.getResponseHeader(name),
          responseText: xhr.responseText
        });
      } else {
        reject(xhr.responseText);
      }
    };
    xhr.onerror = () => reject(xhr.responseText);
    xhr.send(body);
  });
}

/**
 * 从 XML 中提取指定标签的文本
 */
function getXmlTag(xml: string, tag: string): string {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const nodes = doc.getElementsByTagName(tag);
  return nodes.length ? nodes[0].textContent || "" : "";
}

/**
 * 组装 CompleteMultipartUpload 请求体
 */
function buildCompleteXml(parts: PartInfo[]): string {
  const sorted = parts
    .slice()
    .sort((a, b) => a.partNumber - b.partNumber)
    .map(
      (p) =>
        `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${p.etag}</ETag></Part>`
    )
    .join("");
  return `<CompleteMultipartUpload>${sorted}</CompleteMultipartUpload>`;
}

/**
 * 解析 ListParts 响应中的已传分片
 */
function parseListPartsXml(xml: string): PartInfo[] {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const nodes = doc.getElementsByTagName("Part");
  const parts: PartInfo[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const pn = nodes[i].getElementsByTagName("PartNumber")[0];
    const et = nodes[i].getElementsByTagName("ETag")[0];
    parts.push({
      partNumber: Number(pn ? pn.textContent : 0),
      etag: (et && et.textContent) || ""
    });
  }
  return parts;
}

/**
 * 初始化分片上传，返回 uploadId
 */
export async function initiateMultipart(
  getSignedUrl: GetSignedUrl,
  objectKey: string
): Promise<string> {
  const url = await getSignedUrl({ verb: "POST", objectKey, action: "init" });
  const res = await request("POST", url);
  const uploadId = getXmlTag(res.responseText, "UploadId");
  if (!uploadId) {
    throw new Error("initiate multipart upload failed: no UploadId");
  }
  return uploadId;
}

/**
 * 上传单个分片，返回该分片 ETag
 */
export async function uploadPart(
  getSignedUrl: GetSignedUrl,
  objectKey: string,
  uploadId: string,
  partNumber: number,
  blob: Blob,
  onProgress?: (e: ProgressEvent) => void
): Promise<PartInfo> {
  const url = await getSignedUrl({
    verb: "PUT",
    objectKey,
    partNumber,
    uploadId,
    action: "part"
  });
  const res = await request("PUT", url, blob, onProgress);
  return { partNumber, etag: res.getHeader("ETag") || "" };
}

/**
 * 完成分片上传
 */
export async function completeMultipart(
  getSignedUrl: GetSignedUrl,
  objectKey: string,
  uploadId: string,
  parts: PartInfo[]
): Promise<void> {
  const url = await getSignedUrl({
    verb: "POST",
    objectKey,
    uploadId,
    action: "complete"
  });
  await request("POST", url, buildCompleteXml(parts), undefined, {
    "Content-Type": "application/xml"
  });
}

/**
 * 中止分片上传
 */
export async function abortMultipart(
  getSignedUrl: GetSignedUrl,
  objectKey: string,
  uploadId: string
): Promise<void> {
  const url = await getSignedUrl({
    verb: "DELETE",
    objectKey,
    uploadId,
    action: "abort"
  });
  await request("DELETE", url);
}

/**
 * 查询已传分片（用于断点续传对账）
 */
export async function listParts(
  getSignedUrl: GetSignedUrl,
  objectKey: string,
  uploadId: string
): Promise<PartInfo[]> {
  const url = await getSignedUrl({
    verb: "GET",
    objectKey,
    uploadId,
    action: "listParts"
  });
  const res = await request("GET", url);
  return parseListPartsXml(res.responseText);
}

/**
 * 并发执行队列：最多 concurrency 个任务在途
 */
export async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let index = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (index < items.length) {
        const i = index++;
        await worker(items[i]);
      }
    }
  );
  await Promise.all(runners);
}

/**
 * 计算文件指纹（用于续传状态 key）
 */
export function getFingerprint(file: File): string {
  const raw = `${file.name}:${file.size}:${file.lastModified}`;
  return MD5(raw).toString();
}

/**
 * 续传状态存储 key
 */
export function getStorageKey(
  resumeKey: string | undefined,
  file: File
): string {
  return STORAGE_PREFIX + (resumeKey || getFingerprint(file));
}

export function saveResumeState(key: string, state: ResumeState): void {
  localStorage.setItem(key, JSON.stringify(state));
}

export function loadResumeState(key: string): ResumeState | null {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export function clearResumeState(key: string): void {
  localStorage.removeItem(key);
}
