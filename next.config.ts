import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack configuration for WebAssembly support (Next.js 16+)
  turbopack: {
    // Turbopack handles .wasm natively; no extra rules needed
  },

  // Webpack fallback for non-Turbopack environments (e.g., CI analysis tools)
  webpack: (config, { isServer }) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    // Allow .wasm files to be imported
    config.module.rules.push({
      test: /\.wasm$/,
      type: "webassembly/async",
    });

    // Externalize onnxruntime-node on server side
    if (isServer) {
      config.externals = [...(config.externals || []), "onnxruntime-node", "sharp"];
    }

    // Configure for transformers.js (browser-only)
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        sharp: false,
        "onnxruntime-node": false,
      };
    }

    return config;
  },

  // Security headers needed for SharedArrayBuffer (MediaPipe + Transformers.js)
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
