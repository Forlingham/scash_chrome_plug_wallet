// 语言 store
//
// 优化点：
//   首次加载（localStorage 没有持久化值）时自动根据浏览器语言挑选默认值，
//   而不是固定回落到英文。
//   - zh-CN / zh-TW / zh-* → zh
//   - en-* → en
//   - ru-* → ru
//   - 其他   → en（兜底）
//
//   一旦用户在 UI 里切过语言，persist 会把选择写到 localStorage，下次启动时
//   持久化值会覆盖掉自动检测结果，保留用户偏好。

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

export type Language = 'en' | 'zh' | 'ru'

const SUPPORTED_LANGUAGES: Language[] = ['en', 'zh', 'ru']

/** 浏览器语言检测：取 navigator.languages 偏好顺序，找第一个我们支持的。 */
function detectBrowserLanguage(): Language {
  if (typeof navigator === 'undefined') return 'en'

  const raw: string[] =
    navigator.languages && navigator.languages.length
      ? Array.from(navigator.languages)
      : [navigator.language || '']

  for (const item of raw.filter(Boolean)) {
    const code = item.toLowerCase().split('-')[0] as Language
    if (SUPPORTED_LANGUAGES.includes(code)) return code
  }
  return 'en'
}

interface LanguageState {
  language: Language
  setLanguage: (language: Language) => void
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    immer((set) => ({
      language: detectBrowserLanguage(),
      setLanguage: (language: Language) =>
        set((state) => {
          state.language = language
        })
    })),
    {
      name: 'language-storage',
      partialize: (state) => ({ language: state.language })
    }
  )
)

// 便捷的 hooks
export const useLanguage = () => useLanguageStore((state) => state.language)
export const useSetLanguage = () => useLanguageStore((state) => state.setLanguage)
