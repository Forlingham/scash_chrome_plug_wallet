
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  devIndicators: false,

  generateBuildId: async () => {
    return Date.now().toString()
  },
  // 已不再需要任何 /api 或 /ext 反向代理：
  // - RPC 调用已改为浏览器侧直连节点（lib/rpc-client.ts）
  // - 区块浏览器历史已改为直连 Explorer 公共接口（lib/externalApi.ts）
  // - 币价同样使用 Explorer 公共接口
  // 如需在 dev 模式下临时调试某个不支持 CORS 的私有节点，可在此处自行添加 rewrites。
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
          }
        ]
      }
    ]
  },
  webpack: (config, { isServer }) => {
    // 添加对 WASM 文件的支持（tiny-secp256k1）
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true
    }

    config.module.rules.push({
      test: /\.wasm$/,
      type: 'webassembly/async'
    })

    if (isServer) {
      config.externals = config.externals || []
      config.externals.push({
        'tiny-secp256k1': 'tiny-secp256k1'
      })
    }

    return config
  },
  typescript: {
    // !! 警告: 仅用于构建通过，生产环境应移除此配置
    // ignoreBuildErrors: true,
  }
}

module.exports = nextConfig
