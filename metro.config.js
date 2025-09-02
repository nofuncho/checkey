// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// ✅ Firebase 패키지들을 '반드시' 루트 node_modules의 한 복제본만 쓰도록 강제
config.resolver = {
  ...config.resolver,
  alias: {
    ...(config.resolver?.alias || {}),
    firebase: path.resolve(__dirname, 'node_modules/firebase'),
    '@firebase/app': path.resolve(__dirname, 'node_modules/@firebase/app'),
    '@firebase/auth': path.resolve(__dirname, 'node_modules/@firebase/auth'),
  },
};

module.exports = config;
