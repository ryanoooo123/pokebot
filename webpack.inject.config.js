const { resolve } = require('path');
module.exports = {
    mode: "production",
    devtool: false,
    entry: { inject: './src/inject.ts' },
    module: { rules: [{ test: /\.ts$/, exclude: /node_modules/, use: 'ts-loader' }] },
    resolve: { extensions: ['.ts', '.js'] },
    output: { filename: '[name].js', path: resolve(__dirname, 'test-build') },
};
