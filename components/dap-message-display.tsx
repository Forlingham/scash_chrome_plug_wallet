'use client'

// DAP 消息预览 + 全屏查看（Chrome 插件桌面化重塑）
// 短文本直接展示，长文本 / Markdown 文本点击后弹出全屏对话框用 MarkdownRenderer 渲染。
//
// 配色：与 wallet-home 中的 DAP 卡片保持一致，使用 indigo 作为"链上信息"语义色。

import { useState } from 'react'
import { Maximize2, X, Eye } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog'
import { MarkdownRenderer } from '@/components/markdown-renderer'
import { useLanguage } from '@/contexts/language-context'
import { Button } from '@/components/ui/button'

interface DapMessageDisplayProps {
  content: string
  showPreview?: boolean
  buttonText?: React.ReactNode
  title?: string
  className?: string
}

function stripMarkdown(markdown: string): string {
  if (!markdown) return ''
  let text = markdown
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  text = text.replace(/```[\s\S]*?```/g, ' [Code] ')
  text = text.replace(/`([^`]*)`/g, '$1')
  text = text.replace(/^#+\s+/gm, '')
  text = text.replace(/^>\s+/gm, '')
  text = text.replace(/^---+$/gm, '')
  text = text.replace(/(\*\*|__)(.*?)\1/g, '$2')
  text = text.replace(/(\*|_)(.*?)\1/g, '$2')
  text = text.replace(/^\|.*$/gm, '')
  text = text.replace(/\s+/g, ' ').trim()
  return text
}

function isMarkdown(text: string): boolean {
  if (!text) return false
  const patterns = [
    /!\[[^\]]*\]\([^)]*\)/,
    /\[([^\]]*)\]\([^)]*\)/,
    /```[\s\S]*?```/,
    /`([^`]*)`/,
    /^#+\s+/m,
    /^>\s+/m,
    /^---+$/m,
    /(\*\*|__)(.*?)\1/,
    /(\*|_)(.*?)\1/,
    /^\|.*$/m,
  ]
  return patterns.some((pattern) => pattern.test(text))
}

export function DapMessageDisplay({
  content,
  showPreview = true,
  buttonText,
  title,
  className,
}: DapMessageDisplayProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { t } = useLanguage()

  const isMd = isMarkdown(content)
  const isLong = content.length > 100
  const isInteractive = isMd || isLong

  // 短文本：直接展示，配卡片简洁背景
  if (showPreview && !isInteractive) {
    return (
      <div className={`rounded-md bg-zinc-950/60 border border-zinc-800/40 px-2.5 py-2 ${className || ''}`}>
        <div className="text-xs text-zinc-200 break-all whitespace-pre-wrap leading-relaxed">
          {content}
        </div>
      </div>
    )
  }

  const previewText = showPreview ? stripMarkdown(content) : ''
  const displayPreview = showPreview
    ? previewText.length > 100
      ? previewText.slice(0, 100) + '…'
      : previewText
    : ''

  return (
    <>
      {showPreview ? (
        <div
          className={`group relative cursor-pointer rounded-md bg-zinc-950/60 border border-zinc-800/40 px-2.5 py-2 hover:border-indigo-500/40 hover:bg-zinc-900 transition-colors ${className || ''}`}
          onClick={(e) => {
            e.stopPropagation()
            setIsOpen(true)
          }}
        >
          <div className="text-xs text-zinc-200 break-all line-clamp-3 leading-relaxed">
            {displayPreview || (
              <span className="text-zinc-500 italic">{t('dap.clickToView')}</span>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-indigo-300 opacity-70 group-hover:opacity-100 transition-opacity">
            <Maximize2 className="h-2.5 w-2.5" />
            <span>{buttonText || t('dap.clickToExpand')}</span>
          </div>
        </div>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setIsOpen(true)} className={className}>
          {buttonText || (
            <>
              <Eye className="w-3 h-3 mr-1" />
              {t('dap.preview')}
            </>
          )}
        </Button>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-[95vw] w-full h-[90vh] sm:h-[80vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-3 py-2.5 border-b border-zinc-800 flex flex-row items-center justify-between bg-zinc-900/80">
            <DialogTitle className="text-sm font-medium text-zinc-200">
              {title || t('dap.messageContent')}
            </DialogTitle>
            <DialogClose className="text-zinc-400 hover:text-zinc-100 transition-colors focus:outline-hidden">
              <X className="h-4 w-4" />
            </DialogClose>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-3">
            <div className="prose prose-invert max-w-none prose-sm">
              <MarkdownRenderer>{content}</MarkdownRenderer>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
