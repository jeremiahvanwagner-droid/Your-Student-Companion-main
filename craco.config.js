// craco.config.js
const fs = require("fs");
const path = require("path");

// Load env files in CRA's precedence order so the Sentry source-map upload
// (and any other build-time config) can read REACT_APP_* / SENTRY_* values
// during local prod builds. Vercel injects env vars directly into the
// process so this is a no-op there.
const dotenv = require("dotenv");
for (const candidate of [".env.local", ".env"]) {
  const fullPath = path.join(__dirname, candidate);
  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath, override: false });
  }
}

// Check if we're in development/preview mode (not production build)
// Craco sets NODE_ENV=development for start, NODE_ENV=production for build
const isDevServer = process.env.NODE_ENV !== "production";

// Environment variable overrides
// Disable visual edits for Vercel deployment compatibility
const config = {
  enableHealthCheck: process.env.ENABLE_HEALTH_CHECK === "true",
  enableVisualEdits: false, // Disabled for Vercel compatibility
};

// Conditionally load visual edits modules only in dev mode
let setupDevServer;
let babelMetadataPlugin;

if (config.enableVisualEdits) {
  setupDevServer = require("./plugins/visual-edits/dev-server-setup");
  babelMetadataPlugin = require("./plugins/visual-edits/babel-metadata-plugin");
}

// Conditionally load health check modules only if enabled
let WebpackHealthPlugin;
let setupHealthEndpoints;
let healthPluginInstance;

if (config.enableHealthCheck) {
  WebpackHealthPlugin = require("./plugins/health-check/webpack-health-plugin");
  setupHealthEndpoints = require("./plugins/health-check/health-endpoints");
  healthPluginInstance = new WebpackHealthPlugin();
}

const webpackConfig = {
  jest: {
    configure: (jestConfig) => {
      jestConfig.moduleNameMapper = {
        ...jestConfig.moduleNameMapper,
        '^@/(.*)$': '<rootDir>/src/$1',
        '^react-router-dom$': '<rootDir>/node_modules/react-router-dom/dist/index.js',
        '^react-router$': '<rootDir>/node_modules/react-router/dist/production/index.js',
        '^react-router/dom$': '<rootDir>/node_modules/react-router/dist/production/dom-export.js',
      };
      // Force explicit testMatch with a forward-slash-normalized rootDir so
      // Jest's glob matching works inside Claude Code worktrees. The default
      // testMatch mis-escapes the dot in `.claude/` on Windows (the worktree
      // path includes that segment), and globs end up matching zero files.
      // Substituting cwd ourselves with posix separators avoids the issue.
      const rootDirPosix = process.cwd().split(path.sep).join("/");
      jestConfig.testMatch = [
        `${rootDirPosix}/src/**/__tests__/**/*.{js,jsx,ts,tsx}`,
        `${rootDirPosix}/src/**/*.{spec,test}.{js,jsx,ts,tsx}`,
      ];
      return jestConfig;
    },
  },
  eslint: {
    configure: {
      extends: ["plugin:react-hooks/recommended"],
      rules: {
        "react-hooks/rules-of-hooks": "error",
        "react-hooks/exhaustive-deps": "warn",
      },
    },
  },
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    configure: (webpackConfig) => {

      // Add ignored patterns to reduce watched directories
        webpackConfig.watchOptions = {
          ...webpackConfig.watchOptions,
          ignored: [
            '**/node_modules/**',
            '**/.git/**',
            '**/build/**',
            '**/dist/**',
            '**/coverage/**',
            '**/public/**',
        ],
      };

      // Add health check plugin to webpack if enabled
      if (config.enableHealthCheck && healthPluginInstance) {
        webpackConfig.plugins.push(healthPluginInstance);
      }

      // Sentry source-map upload — production builds only, requires
      // SENTRY_AUTH_TOKEN + SENTRY_ORG_SLUG + SENTRY_PROJECT_SLUG in env.
      // When any are missing we no-op silently: local dev (`npm start`)
      // doesn't need source maps, and a release build that's missing the
      // auth token should still succeed (with a warning logged) rather
      // than fail the Vercel deploy. Source maps are deleted from the
      // published bundle so they aren't world-readable on the CDN.
      const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
      const sentryOrg = process.env.SENTRY_ORG_SLUG;
      const sentryProject = process.env.SENTRY_PROJECT_SLUG;
      const isProdBuild = webpackConfig.mode === 'production';

      if (isProdBuild && sentryAuthToken && sentryOrg && sentryProject) {
        // Require lazily so dev installs without the plugin don't crash.
        // eslint-disable-next-line global-require
        const { sentryWebpackPlugin } = require('@sentry/webpack-plugin');
        webpackConfig.devtool = 'source-map';
        webpackConfig.plugins.push(
          sentryWebpackPlugin({
            org: sentryOrg,
            project: sentryProject,
            authToken: sentryAuthToken,
            sourcemaps: {
              assets: './build/**',
              filesToDeleteAfterUpload: './build/**/*.map',
            },
            // Stamp the release on Sentry events. Falls back to undefined
            // if the env var is missing — Sentry will auto-generate one.
            release: {
              name:
                process.env.SENTRY_RELEASE ||
                process.env.REACT_APP_VERCEL_GIT_COMMIT_SHA ||
                undefined,
            },
            telemetry: false,
          })
        );
      } else if (isProdBuild) {
        // Warn loudly so a missed env var doesn't quietly ship a bundle
        // without source maps mapped on the Sentry side.
        // eslint-disable-next-line no-console
        console.warn(
          '[craco] Skipping Sentry source-map upload — set SENTRY_AUTH_TOKEN, SENTRY_ORG_SLUG, SENTRY_PROJECT_SLUG to enable.'
        );
      }

      return webpackConfig;
    },
  },
};

// Only add babel metadata plugin during dev server
if (config.enableVisualEdits && babelMetadataPlugin) {
  webpackConfig.babel = {
    plugins: [babelMetadataPlugin],
  };
}

webpackConfig.devServer = (devServerConfig) => {
  // Apply visual edits dev server setup only if enabled
  if (config.enableVisualEdits && setupDevServer) {
    devServerConfig = setupDevServer(devServerConfig);
  }

  // Add health check endpoints if enabled
  if (config.enableHealthCheck && setupHealthEndpoints && healthPluginInstance) {
    const originalSetupMiddlewares = devServerConfig.setupMiddlewares;

    devServerConfig.setupMiddlewares = (middlewares, devServer) => {
      // Call original setup if exists
      if (originalSetupMiddlewares) {
        middlewares = originalSetupMiddlewares(middlewares, devServer);
      }

      // Setup health endpoints
      setupHealthEndpoints(devServer, healthPluginInstance);

      return middlewares;
    };
  }

  return devServerConfig;
};

module.exports = webpackConfig;
