module.exports = {
  globDirectory: 'dist/',
  globPatterns: [
    '**/*.{html,js,css,png,ico,json,ttf,woff,woff2,svg}'
  ],
  swDest: 'dist/service-worker.js',
  ignoreURLParametersMatching: [
    /^utm_/,
    /^fbclid$/
  ],
  skipWaiting: false, // We will handle this manually in the UI
  clientsClaim: true,
  maximumFileSizeToCacheInBytes: 5242880, // 5MB limit
};
