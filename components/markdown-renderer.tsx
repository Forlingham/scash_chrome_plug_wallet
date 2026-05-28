'use client'

// Markdown 渲染器（Chrome 插件桌面化重塑）
// 用于 DAP 链上消息的安全展示。
// 关键安全要点（保持不变）：
//   - rehype-sanitize 严格过滤 HTML
//   - 链接点击需用户二次确认（防钓鱼）
//   - 图片附 referrerPolicy="no-referrer"（防隐私泄露）
//
// 配色：链接 / 行内代码 / 强调 / 引用线 → 品牌色 purple；表格、HR 等结构色 → zinc。

import dynamic from 'next/dynamic'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { useState, useMemo } from 'react'
import { useLanguage } from '@/contexts/language-context'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const ReactMarkdown = dynamic(() => import('react-markdown'))

interface MarkdownRendererProps {
  children: string
  className?: string
}

export function MarkdownRenderer({ children, className }: MarkdownRendererProps) {
  const { t } = useLanguage()
  const [isOpen, setIsOpen] = useState(false)
  const [targetUrl, setTargetUrl] = useState('')

  const sanitizeSchema = useMemo(
    () => ({
      ...defaultSchema,
      attributes: {
        ...defaultSchema.attributes,
      },
    }),
    [],
  )

  const handleLinkClick = (href: string) => {
    if (!href) return
    // 协议白名单：禁止 javascript: / data: 等高危协议
    try {
      const url = new URL(href, window.location.href)
      if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) {
        return
      }
    } catch (e) {
      return
    }
    setTargetUrl(href)
    setIsOpen(true)
  }

  const handleConfirm = () => {
    window.open(targetUrl, '_blank', 'noopener,noreferrer')
    setIsOpen(false)
  }

  return (
    <>
      <div className={`markdown-body ${className ?? ''}`}>
        <ReactMarkdown
          rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ node, ...props }) => (
              <h1
                {...props}
                className="text-base font-bold text-zinc-100 mt-3 mb-1.5 border-b border-zinc-800 pb-1"
              />
            ),
            h2: ({ node, ...props }) => (
              <h2 {...props} className="text-sm font-bold text-zinc-100 mt-3 mb-1.5" />
            ),
            h3: ({ node, ...props }) => (
              <h3 {...props} className="text-sm font-bold text-zinc-100 mt-2 mb-1" />
            ),
            h4: ({ node, ...props }) => (
              <h4 {...props} className="text-xs font-bold text-zinc-100 mt-2 mb-1" />
            ),
            h5: ({ node, ...props }) => (
              <h5 {...props} className="text-xs font-bold text-zinc-100 mt-2 mb-1" />
            ),
            h6: ({ node, ...props }) => (
              <h6 {...props} className="text-[11px] font-bold text-zinc-100 mt-2 mb-1" />
            ),
            table: ({ node, ...props }) => (
              <div className="overflow-x-auto my-3 rounded-md border border-zinc-800">
                <table {...props} className="w-full text-left text-xs text-zinc-300" />
              </div>
            ),
            thead: ({ node, ...props }) => (
              <thead {...props} className="bg-zinc-900 text-zinc-200" />
            ),
            tbody: ({ node, ...props }) => (
              <tbody {...props} className="divide-y divide-zinc-800 bg-zinc-950/50" />
            ),
            tr: ({ node, ...props }) => (
              <tr {...props} className="hover:bg-zinc-800/50 transition-colors" />
            ),
            th: ({ node, ...props }) => (
              <th {...props} className="px-2.5 py-2 font-semibold whitespace-nowrap" />
            ),
            td: ({ node, ...props }) => <td {...props} className="px-2.5 py-2" />,
            hr: ({ node, ...props }) => <hr {...props} className="my-3 border-zinc-800" />,
            strong: ({ node, ...props }) => (
              // 强调用 purple-300，与品牌色一致
              <strong {...props} className="font-semibold text-purple-300" />
            ),
            em: ({ node, ...props }) => <em {...props} className="italic text-zinc-400" />,
            del: ({ node, ...props }) => <del {...props} className="line-through text-zinc-500" />,
            p: ({ node, ...props }) => (
              <p {...props} className="mb-2 last:mb-0 leading-relaxed text-zinc-300" />
            ),
            ul: ({ node, ...props }) => (
              <ul {...props} className="list-disc list-inside mb-2 pl-1 space-y-1 text-zinc-300" />
            ),
            ol: ({ node, ...props }) => (
              <ol
                {...props}
                className="list-decimal list-inside mb-2 pl-1 space-y-1 text-zinc-300"
              />
            ),
            blockquote: ({ node, ...props }) => (
              <blockquote
                {...props}
                className="border-l-2 border-purple-500/50 pl-3 py-1 italic bg-zinc-900/40 rounded-r my-2 text-zinc-400"
              />
            ),
            a: ({ node, href, ...props }) => (
              <a
                {...props}
                href={href}
                className="text-purple-400 hover:text-purple-300 hover:underline break-all cursor-pointer transition-colors"
                onClick={(e) => {
                  e.preventDefault()
                  if (href) handleLinkClick(href)
                }}
              />
            ),
            code: ({ node, className: codeClassName, children, ...props }: any) => {
              const isInline = !String(children).includes('\n') && !codeClassName
              if (isInline) {
                return (
                  <code
                    className="bg-zinc-800/80 text-purple-300 rounded px-1.5 py-0.5 font-mono text-[11px] border border-zinc-700/40"
                    {...props}
                  >
                    {children}
                  </code>
                )
              }
              return (
                <div className="relative group">
                  <code
                    className="block bg-zinc-950 border border-zinc-800 rounded-md p-2.5 font-mono text-[11px] text-zinc-300 overflow-x-auto my-2 leading-relaxed"
                    {...props}
                  >
                    {children}
                  </code>
                </div>
              )
            },
            pre: ({ node, ...props }) => <pre {...props} className="m-0 p-0 bg-transparent" />,
            img: ({ node, src, alt, ...props }) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                {...props}
                src={src}
                alt={alt || 'Blockchain content'}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="max-w-full h-auto rounded-md border border-zinc-800 my-2 max-h-[400px] object-contain bg-zinc-950"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            ),
          }}
        >
          {children}
        </ReactMarkdown>
      </div>

      <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">{t('common.externalLink')}</AlertDialogTitle>
            <AlertDialogDescription className="text-[11px] leading-relaxed">
              {t('common.externalLinkInfo')}
              <span className="block mt-2 p-2 bg-zinc-950 rounded-md border border-zinc-800/60 break-all text-purple-400 font-mono text-[10px] max-h-20 overflow-y-auto">
                {targetUrl}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className="bg-purple-600 text-white hover:bg-purple-500"
            >
              {t('common.continue')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
