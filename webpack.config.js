const merge = require("webpack-merge");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const BundleAnalyzerPlugin = require("webpack-bundle-analyzer")
  .BundleAnalyzerPlugin;
const webpackConfig = require("./webpack.config.dev");

const prodWebpackConfig = {
  plugins: [new CleanWebpackPlugin()]
};

if (process.env.npm_config_report) {
  prodWebpackConfig.plugins.push(new BundleAnalyzerPlugin());
}

module.exports = merge(webpackConfig, prodWebpackConfig);
