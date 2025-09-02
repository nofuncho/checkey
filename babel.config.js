module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'react-native-reanimated/plugin', // ✅ 이 줄을 꼭 맨 마지막에 추가해야 함
    ],
  };
};
