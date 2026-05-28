"use client"

import { useState } from "react"
import { useLanguage, useSetLanguage, type Language } from "@/stores/language-store"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Globe, Check } from "lucide-react"

const languageNames = {
  en: "English",
  zh: "中文",
  ru: "Русский",
}

/**
 * 语言切换器（Chrome 插件桌面版）
 * - 触发器收紧为 icon-sm 尺寸 + 仅显示语言代码缩写，节省 header 横向空间
 * - 弹层使用 popover token 颜色（自动跟主题），不再硬编码 gray-800
 * - 当前选中项加 purple 勾选标记（与品牌色一致）
 */
export function LanguageSelector() {
  const language = useLanguage()
  const setLanguage = useSetLanguage()
  const [open, setOpen] = useState(false)

  const handleLanguageSelect = (code: Language) => {
    setLanguage(code)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          className="text-zinc-400 hover:text-zinc-100 gap-1"
          aria-label="Change language"
        >
          <Globe className="h-3.5 w-3.5" />
          <span className="text-[10px] uppercase tracking-wide">{language}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[140px] p-1 bg-popover border-zinc-800"
      >
        <div className="space-y-0.5">
          {Object.entries(languageNames).map(([code, name]) => {
            const selected = code === language
            return (
              <button
                key={code}
                onClick={() => handleLanguageSelect(code as Language)}
                className={`w-full flex items-center justify-between px-2 py-1.5 text-xs rounded-sm transition-colors cursor-pointer ${
                  selected
                    ? 'text-purple-300 bg-purple-500/10'
                    : 'text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800'
                }`}
              >
                <span>{name}</span>
                {selected && <Check className="h-3 w-3 text-purple-400" />}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
