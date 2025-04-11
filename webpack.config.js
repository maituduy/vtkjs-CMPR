const path = require('path');

const webpack = require('webpack')
const CopyPlugin = require('copy-webpack-plugin')

const entry = path.join(__dirname, 'src', 'index_main.js')
const outputPath = path.join(__dirname, './dist')
const itkConfig = path.resolve(__dirname, 'src', 'itkConfig.js')

module.exports = {
  entry: entry,
  output: {
    path: outputPath,
    filename: 'main.js',
    library: {
      type: 'umd',
      name: 'bundle',
    },
  },
  module: {
    rules: [
      {
        test: /\.html$/i,
        loader: "html-loader",
      },
      {
        test: /\.css$/i,
        use: ["style-loader", "css-loader"],
      },
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: path.join(__dirname, 'node_modules', 'itk-wasm', 'dist', 'pipeline', 'web-workers'),
          to: path.join(__dirname, 'dist', 'itk', 'web-workers')
        },
        {
          from: path.join(__dirname, 'node_modules', '@itk-wasm', 'image-io', 'dist'),
          to: path.join(__dirname, 'dist', 'itk', 'image-io')
        },
        {
          from: path.join(__dirname, 'node_modules', '@itk-wasm', 'mesh-io', 'dist'),
          to: path.join(__dirname, 'dist', 'itk', 'mesh-io')
        }
    ]})
  ],
  resolve: {
    fallback: { fs: false, path: false, url: false, module: false },
    alias: {
      '../itkConfig.js': itkConfig,
      '../../itkConfig.js': itkConfig,
    },
  },
  performance: {
    maxAssetSize: 10000000
  }
};