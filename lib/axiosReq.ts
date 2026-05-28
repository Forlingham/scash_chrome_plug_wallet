// =============================================================================
// axios 通用工具（精简版）
//
// 历史背景：
//   旧后端时代这里包装了请求/响应拦截器、AES 加密等逻辑。直连 RPC 后这些都不再适用。
//   - JSON-RPC 调用走 lib/rpc-client.ts，不再依赖此处。
//   - Explorer 调用走 lib/externalApi.ts，自己 axios.create 即可。
//   保留这个文件主要是为了不破坏 import path（避免大批文件改动）。
// =============================================================================

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios'

export class AxiosTool {
  protected instance: AxiosInstance

  constructor(config: AxiosRequestConfig) {
    this.instance = axios.create(config)
  }

  public async request<T = any>(config: AxiosRequestConfig) {
    return new Promise(async (resolve, reject) => {
      try {
        const response = await this.instance.request(config)
        resolve(response.data)
      } catch (error: any) {
        if (process.env.NODE_ENV === 'development') {
          console.log(error?.data ?? error?.message)
        }
        reject(error)
      }
    }) as Promise<ApiData<T>>
  }

  public async get<T = any>(url: string, params?: Record<string, any>, config?: AxiosRequestConfig) {
    return this.request<T>({ method: 'get', url, params, ...config })
  }

  public async post<T = any>(url: string, data: Record<string, any>, config?: AxiosRequestConfig) {
    return this.request<T>({ method: 'post', url, data, ...config })
  }
}

// 导出一个空 base 的实例，仅作为兼容性占位。
// 现网调用都不会走到这里。
export default new AxiosTool({
  baseURL: '/',
  timeout: 30000
})
