#! /usr/bin/env node

const os = require("os");
const path = require("path");
const childProcess = require("child_process");
const chalk = require("chalk");
const yargs = require("yargs/yargs");

const { c: config, d: dest, b: bucket } = yargs(process.argv).argv;
const platform = os.platform();

function upload(ossUtil) {
  childProcess.execFile(
    `${path.resolve(ossUtil)}`,
    [
      `cp`,
      `-c`,
      `${path.resolve(config || ".ossutilconfig")}`,
      `-f`,
      `-r`,
      `--exclude`,
      `.DS_Store`,
      `${path.resolve(dest || "./distCDN")}`,
      bucket || `oss://cdn-didano/ossutilUpload`
    ],
    (error, stdout, stderr) => {
      if (error) {
        console.error(chalk.red(`exec error: ${error}`));
        return;
      }
      if (stdout) {
        console.log(chalk.green(`stdout: ${stdout}`));
      }
      if (stderr) {
        console.error(chalk.red(`stderr: ${stderr}`));
      }
    }
  );
}

if (platform == "darwin") {
  upload(`node_modules/ling-oss-upload/bin/upload/ossutilmac64`);
} else if (platform == "win32") {
  upload(`node_modules/ling-oss-upload/bin/upload/ossutil64.exe`);
} else if (platform == "linux") {
  upload(`node_modules/ling-oss-upload/bin/upload/ossutil64`);
}
