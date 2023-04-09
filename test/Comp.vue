<template>
  <div>
    <h1>OSS 上传文件测试</h1>
    <input type="file" name="file" id="file" @change="handleChange" />
    <span>{{ progress }} %</span>
  </div>
</template>

<script>
import { ref, onMounted } from "vue";
export default {
  setup(props, context) {
    const progress = ref(0);

    const lingOssUpload = new LingOssUpload(ossInfo, {
      rootDire: "en"
    });

    console.log(lingOssUpload.options);

    const uploadFile = (host, formData, onProgress) => {
      return new Promise((resolve, reject) => {
        axios({
          url: host,
          method: "POST",
          data: formData,
          onUploadProgress: onProgress,
          validateStatus: function (status) {
            return true;
          },
          transformResponse: [
            function (data) {
              // 没有信息返回表示为上传成功
              if (!data) {
                resolve();
              } else {
                reject(data);
              }
            }
          ]
        });
      });
    };

    const handleChange = async (e) => {
      const file = e.target.files[0];
      console.log(`Log: handleChange -> file`, file);
      try {
        const data = await lingOssUpload.upload({
          file,
          host: ossInfo.ossHost,
          cdnHost: ossInfo.host,
          dirName: "formal/test/hehe",
          selfName: false,
          // limitType: "image",
          limitSize: 1024 * 1024 * 25,
          onProgress: (event) => {
            progress.value = parseInt((event.loaded / event.total) * 100);
          },
          uploadFile
        });
        console.log(`Log: handleChange -> data`, data);
      } catch (e) {
        console.log((e && e.message) || "网络错误");
      }
    };

    return {
      progress,
      handleChange
    };
  }
};
</script>

<style scoped>
button {
  color: red;
}
</style>
