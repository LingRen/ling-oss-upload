      (function () {
        var PLACEHOLDER = "$" + "{filename}";
        var logEl = document.getElementById("log");

        function $(id) { return document.getElementById(id); }

        function log() {
          var text = Array.prototype.map
            .call(arguments, function (arg) {
              return typeof arg === "string" ? arg : JSON.stringify(arg);
            })
            .join(" ");
          logEl.textContent =
            new Date().toLocaleTimeString() + "  " + text + "\n" + logEl.textContent;
        }

        function errorText(err) {
          if (!err) return "未知错误";
          if (typeof err === "string") return err;
          return err.message || err.data || JSON.stringify(err);
        }

        function setStatus(el, text, type) {
          el.className = "status" + (type ? " " + type : "");
          el.textContent = text;
        }

        function setProgress(el, percent) {
          el.style.width = Math.max(0, Math.min(100, percent)) + "%";
        }

        document.getElementById("clearLog").onclick = function () {
          logEl.textContent = "等待操作…";
        };

        if (!window.LingOssUpload) {
          log("未找到 LingOssUpload，请确认已构建并加载 /index.js");
          return;
        }

        var uploader = new LingOssUpload();
        var apiConfig = null;
        var lastOrigin = "";

        // ---------- 接口配置 ----------
        fetch("/api/config")
          .then(function (res) { return res.json(); })
          .then(function (cfg) {
            apiConfig = cfg;
            if (cfg.dirName) {
              $("dirName").value = cfg.dirName;
              $("upDir").value = cfg.dirName;
              $("miniDir").value = cfg.dirName.replace(/demo$/, "mini");
            }
            $("upHost").value = cfg.submitUrl;
            $("miniHost").value = cfg.submitUrl;
            if (cfg.roleArn) $("stsRoleArn").value = cfg.roleArn;
            $("apiConfig").textContent =
              "接口配置：bucket=" + cfg.bucket +
              " · region=" + cfg.region +
              (cfg.cdnHost ? " · CDN=" + cfg.cdnHost : "") +
              " · 直传地址=" + cfg.submitUrl;
          })
          .catch(function () {
            $("apiConfig").textContent =
              "未获取到 /api/config（当前可能不是 demo-server），请手动填写地址";
          });

        // ---------- 客户端凭证（仅 upload / createMiniUploadInfo 使用） ----------
        import("/ossInfo.js")
          .then(function (mod) {
            var info = mod.default || mod || {};
            $("credAccessId").value = info.accessId || "";
            $("credAccessKey").value = info.accessKey || "";
            $("credSecurityToken").value = info.securityToken || "";
            var ok = Boolean(info.accessId && info.accessKey);
            $("credStatus").className = "hint" + (ok ? " ok-text" : "");
            $("credStatus").textContent = ok
              ? "已从 /ossInfo.js 读取凭证（仅本地 demo 使用）"
              : "未能读取凭证，请手动填写";
          })
          .catch(function () {
            $("credStatus").textContent = "未读取到 /ossInfo.js，请手动填写凭证";
          });

        function clientUploader() {
          var accessId = $("credAccessId").value.trim();
          var accessKey = $("credAccessKey").value.trim();
          var securityToken = $("credSecurityToken").value.trim();
          if (!accessId || !accessKey) {
            throw new Error("请先填写 accessId / accessKey");
          }
          var info = { accessId: accessId, accessKey: accessKey };
          if (securityToken) info.securityToken = securityToken;
          return new LingOssUpload(info, {});
        }

        function cdnUrl(key) {
          var base = (apiConfig && apiConfig.cdnHost) || lastOrigin;
          return (base ? base.replace(/\/$/, "") + "/" : "") + key;
        }

        // ---------- 分片上传签名 ----------
        function signBase() {
          return $("signBase").value.replace(/\/$/, "");
        }

        function getSignedUrl(req) {
          var qs = new URLSearchParams(req).toString();
          log("[sign]", req.action, req.objectKey, "part=" + (req.partNumber || "-"));
          return fetch(signBase() + "/sign?" + qs)
            .then(function (res) {
              return res.json().then(function (data) {
                if (!res.ok) throw new Error(data.error || "签名失败");
                return data.url;
              });
            })
            .then(function (signed) {
              try { lastOrigin = new URL(signed).origin; } catch (e) {}
              return signed;
            });
        }

        // ---------- 1. uploadLarge ----------
        var bar = $("bar");
        var largeStatus = $("largeStatus");
        var startLarge = $("startLarge");
        var largeFile = $("largeFile");

        largeFile.onchange = function () {
          var f = largeFile.files[0];
          setStatus(largeStatus, f ? f.name + " · " + (f.size / 1024 / 1024).toFixed(2) + " MB" : "等待选择文件");
          $("resultRow").style.display = "none";
        };

        startLarge.onclick = function () {
          var file = largeFile.files[0];
          if (!file) {
            setStatus(largeStatus, "请先选择文件", "error");
            return;
          }
          var chunkMB = parseFloat($("chunkSize").value);
          var concurrency = parseInt($("concurrency").value, 10);
          var resumeKey = $("resumeKey").value.trim();

          startLarge.disabled = true;
          setProgress(bar, 0);
          $("resultRow").style.display = "none";
          setStatus(largeStatus, "上传中…");
          log("[uploadLarge] 开始", file.name, (file.size / 1024 / 1024).toFixed(2) + "MB");

          uploader
            .uploadLarge({
              file: file,
              dirName: $("dirName").value.trim(),
              getSignedUrl: getSignedUrl,
              selfName: $("selfName").value === "true",
              chunkSize: Math.max(100 * 1024, Math.round(chunkMB * 1024 * 1024)),
              concurrency: concurrency || 3,
              resumeKey: resumeKey || undefined,
              onProgress: function (e) {
                var percent = e.total ? Math.floor((e.loaded / e.total) * 100) : 0;
                setProgress(bar, percent);
                setStatus(
                  largeStatus,
                  percent + "%  " +
                    (e.loaded / 1024 / 1024).toFixed(1) + " / " +
                    (e.total / 1024 / 1024).toFixed(1) + " MB"
                );
              }
            })
            .then(function (data) {
              log("[uploadLarge] 成功", data);
              setStatus(largeStatus, "上传成功 100%", "ok");
              setProgress(bar, 100);
              var url = cdnUrl(data.data);
              $("resultLink").href = url;
              $("resultLink").textContent = url;
              $("resultRow").style.display = "flex";
            })
            .catch(function (err) {
              log("[uploadLarge] 失败", err);
              setStatus(largeStatus, errorText(err), "error");
            })
            .then(function () {
              startLarge.disabled = false;
            });
        };

        $("clearState").onclick = function () {
          var keys = [];
          for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k && k.indexOf("ling-oss-upload:") === 0) keys.push(k);
          }
          keys.forEach(function (k) { localStorage.removeItem(k); });
          log("[resume] 已清除 " + keys.length + " 条续传状态");
        };

        // ---------- 2. upload() ----------
        var upBar = $("upBar");
        var upStatus = $("upStatus");
        var startUpload = $("startUpload");

        $("upFile").onchange = function () {
          var f = this.files[0];
          setStatus(upStatus, f ? f.name + " · " + (f.size / 1024 / 1024).toFixed(2) + " MB" : "等待选择文件");
          $("upResultRow").style.display = "none";
        };

        startUpload.onclick = function () {
          var file = $("upFile").files[0];
          if (!file) {
            setStatus(upStatus, "请先选择文件", "error");
            return;
          }

          var client;
          try {
            client = clientUploader();
          } catch (e) {
            setStatus(upStatus, errorText(e), "error");
            return;
          }

          var host = $("upHost").value.trim();
          if (!host) {
            setStatus(upStatus, "请填写 OSS 直传地址", "error");
            return;
          }
          var limitMB = parseFloat($("upLimit").value || "0");
          var limitType = $("upLimitType").value;

          startUpload.disabled = true;
          setProgress(upBar, 0);
          $("upResultRow").style.display = "none";
          setStatus(upStatus, "上传中…");
          log("[upload] 开始", file.name);

          client
            .upload({
              file: file,
              host: host,
              cdnHost: (apiConfig && apiConfig.cdnHost) || host,
              dirName: $("upDir").value.trim(),
              selfName: $("upSelfName").value === "true",
              limitSize: limitMB > 0 ? Math.round(limitMB * 1024 * 1024) : 0,
              limitType: limitType,
              isCompressor: $("upCompress").checked,
              onProgress: function (e) {
                var percent = e.total ? Math.floor((e.loaded / e.total) * 100) : 0;
                setProgress(upBar, percent);
                setStatus(upStatus, percent + "%");
              }
            })
            .then(function (data) {
              log("[upload] 成功", data);
              setStatus(upStatus, "上传成功", "ok");
              setProgress(upBar, 100);
              $("upResultLink").href = data.data;
              $("upResultLink").textContent = data.data;
              $("upResultRow").style.display = "flex";
            })
            .catch(function (err) {
              log("[upload] 失败", err);
              setStatus(upStatus, errorText(err), "error");
            })
            .then(function () {
              startUpload.disabled = false;
            });
        };

        // ---------- 3. 小程序 POST ----------
        var miniStatus = $("miniStatus");
        var miniClientStatus = $("miniClientStatus");
        var miniOut = $("miniOut");

        function miniLimitSize() {
          var mb = parseFloat($("miniLimit").value || "0");
          return mb > 0 ? Math.round(mb * 1024 * 1024) : 0;
        }

        function showMini(info) {
          miniOut.style.display = "block";
          miniOut.textContent = JSON.stringify(info, null, 2);
        }

        function fetchMiniSigned() {
          return uploader.createMiniUploadInfoBySigner({
            dirName: $("miniDir").value.trim(),
            limitSize: miniLimitSize(),
            getMiniUploadInfo: function (req) {
              var qs = new URLSearchParams(req).toString();
              log("[mini-post]", req.objectKey, "limitSize=" + (req.limitSize || 0));
              return fetch(signBase() + "/mini-post?" + qs).then(function (res) {
                return res.json().then(function (data) {
                  if (!res.ok) throw new Error(data.error || "签名失败");
                  return data;
                });
              });
            }
          });
        }

        // 模拟 wx.uploadFile: 用 FormData POST 到 OSS
        function postToOss(host, fields, file) {
          if (!host) {
            return Promise.reject(new Error("请填写 OSS 直传地址"));
          }
          var key = String(fields.key || "").split(PLACEHOLDER).join(file.name);
          var formData = new FormData();
          formData.append("key", key);
          ["policy", "OSSAccessKeyId", "signature", "x-oss-security-token"].forEach(function (k) {
            if (fields[k]) formData.append(k, fields[k]);
          });
          formData.append("success_action_status", String(fields.success_action_status || 200));
          formData.append("file", file, file.name);

          log("[post]", host, key);
          return fetch(host, { method: "POST", body: formData }).then(function (res) {
            if (res.ok || res.status === 204) return key;
            return res.text().then(function (text) {
              throw new Error(text || "HTTP " + res.status);
            });
          });
        }

        $("miniSign").onclick = function () {
          this.disabled = true;
          setStatus(miniStatus, "请求中…");
          fetchMiniSigned()
            .then(function (info) {
              showMini(info);
              setStatus(miniStatus, "已获取签名字段", "ok");
              log("[mini-post] 成功", info);
              return info;
            })
            .catch(function (err) {
              setStatus(miniStatus, errorText(err), "error");
              log("[mini-post] 失败", err);
            })
            .then(function () {
              $("miniSign").disabled = false;
            });
        };

        $("miniSignUpload").onclick = function () {
          var file = $("miniFile").files[0];
          if (!file) {
            setStatus(miniStatus, "请先选择文件", "error");
            return;
          }
          this.disabled = true;
          setStatus(miniStatus, "签名中…");
          $("miniResultRow").style.display = "none";

          fetchMiniSigned()
            .then(function (info) {
              showMini(info);
              log("[mini-post] 已签名", info.key);
              return postToOss($("miniHost").value.trim(), info, file);
            })
            .then(function (key) {
              setStatus(miniStatus, "上传成功", "ok");
              $("miniResultLink").href = cdnUrl(key);
              $("miniResultLink").textContent = cdnUrl(key);
              $("miniResultRow").style.display = "flex";
            })
            .catch(function (err) {
              setStatus(miniStatus, errorText(err), "error");
              log("[mini-post] 上传失败", err);
            })
            .then(function () {
              $("miniSignUpload").disabled = false;
            });
        };

        $("miniClientFields").onclick = function () {
          setStatus(miniClientStatus, "生成中…");
          try {
            var info = clientUploader().createMiniUploadInfo({
              dirName: $("miniDir").value.trim(),
              limitSize: miniLimitSize()
            });
            showMini(info);
            setStatus(miniClientStatus, "已生成签名字段", "ok");
            log("[mini-client] 成功", info);
          } catch (e) {
            setStatus(miniClientStatus, errorText(e), "error");
            log("[mini-client] 失败", e);
          }
        };

        $("miniClientUpload").onclick = function () {
          var file = $("miniFile").files[0];
          if (!file) {
            setStatus(miniClientStatus, "请先选择文件", "error");
            return;
          }
          this.disabled = true;
          setStatus(miniClientStatus, "生成并上传…");
          $("miniResultRow").style.display = "none";

          Promise.resolve()
            .then(function () {
              var info = clientUploader().createMiniUploadInfo({
                dirName: $("miniDir").value.trim(),
                limitSize: miniLimitSize()
              });
              showMini(info);
              log("[mini-client] 已签名", info.key);
              return postToOss($("miniHost").value.trim(), info, file);
            })
            .then(function (key) {
              setStatus(miniClientStatus, "上传成功", "ok");
              $("miniResultLink").href = cdnUrl(key);
              $("miniResultLink").textContent = cdnUrl(key);
              $("miniResultRow").style.display = "flex";
            })
            .catch(function (err) {
              setStatus(miniClientStatus, errorText(err), "error");
              log("[mini-client] 上传失败", err);
            })
            .then(function () {
              $("miniClientUpload").disabled = false;
            });
        };

        // ---------- 4. uploadBySts ----------
        var stsBar = $("stsBar");
        var stsStatus = $("stsStatus");
        var startSts = $("startSts");

        $("stsFile").onchange = function () {
          var f = this.files[0];
          setStatus(stsStatus, f ? f.name + " · " + (f.size / 1024 / 1024).toFixed(2) + " MB" : "等待选择文件");
          $("stsResultRow").style.display = "none";
        };

        function getStsToken() {
          var roleArn = $("stsRoleArn").value.trim();
          var url = "/api/sts" + (roleArn ? "?roleArn=" + encodeURIComponent(roleArn) : "");
          log("[sts] 请求 /api/sts", roleArn || "(未指定角色)");
          return fetch(url).then(function (res) {
            return res.json().then(function (data) {
              if (!res.ok) throw new Error(data.error || "获取 STS 凭证失败");
              if (data.temporary === false) {
                $("stsInfo").className = "hint";
                $("stsInfo").textContent = "⚠️ " + (data.warning || "当前使用长期凭证");
              } else {
                $("stsInfo").className = "hint ok-text";
                $("stsInfo").textContent =
                  "STS 凭证：" + String(data.accessId || "").slice(0, 8) + "***" +
                  (data.expiration ? " · 过期时间 " + data.expiration : "");
              }
              return data;
            });
          });
        }

        startSts.onclick = function () {
          var file = $("stsFile").files[0];
          if (!file) {
            setStatus(stsStatus, "请先选择文件", "error");
            return;
          }
          if (!apiConfig || !apiConfig.submitUrl) {
            setStatus(stsStatus, "尚未获取到接口配置，请刷新页面", "error");
            return;
          }

          var limitMB = parseFloat($("stsLimit").value || "0");

          startSts.disabled = true;
          setProgress(stsBar, 0);
          $("stsResultRow").style.display = "none";
          setStatus(stsStatus, "获取 STS…");
          log("[uploadBySts] 开始", file.name);

          uploader
            .uploadBySts({
              file: file,
              host: apiConfig.submitUrl,
              cdnHost: apiConfig.cdnHost || apiConfig.submitUrl,
              dirName: $("stsDir").value.trim(),
              selfName: $("stsSelfName").value === "true",
              limitSize: limitMB > 0 ? Math.round(limitMB * 1024 * 1024) : 0,
              getStsToken: getStsToken,
              onProgress: function (e) {
                var percent = e.total ? Math.floor((e.loaded / e.total) * 100) : 0;
                setProgress(stsBar, percent);
                setStatus(stsStatus, "上传中 " + percent + "%");
              }
            })
            .then(function (data) {
              log("[uploadBySts] 成功", data);
              setStatus(stsStatus, "上传成功", "ok");
              setProgress(stsBar, 100);
              $("stsResultLink").href = data.data;
              $("stsResultLink").textContent = data.data;
              $("stsResultRow").style.display = "flex";
            })
            .catch(function (err) {
              log("[uploadBySts] 失败", err);
              setStatus(stsStatus, errorText(err), "error");
            })
            .then(function () {
              startSts.disabled = false;
            });
        };
      })();
