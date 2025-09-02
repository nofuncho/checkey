// app.config.js
export default {
  expo: {
    name: "checkey",
    slug: "checkey",
    scheme: "checkey",              // ✅ 추가: 딥링크 스킴
    ios: { supportsTablet: true },
    //android: { adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#FFFFFF" } },
    extra: {
      OPENAI_API_KEY: process.env.EXPO_PUBLIC_OPENAI_API_KEY,
    },
  },
};
