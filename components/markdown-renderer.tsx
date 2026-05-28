'use client'

// Markdown 渲染器 —— 用于 DAP 链上消息的安全展示
// 直接从 web 钱包移植，关键安全要点：
//   - rehype-sanitize 严格过滤 HTML
//   - 链接点击需用户二次确认（防钓鱼）
//   - 图片附 referrerPolicy="no-referrer"（防隐私泄露）

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
  AlertDialogTitle
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
        ...defaultSchema.attributes
      }
    }),
    []
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
            h1: ({ node, ...props }) => <h1 {...props} className="text-xl font-bold text-white mt-4 mb-2 border-b border-gray-700 pb-1" />,
            h2: ({ node, ...props }) => <h2 {...props} className="text-lg font-bold text-white mt-3 mb-2" />,
            h3: ({ node, ...props }) => <h3 {...props} className="text-base font-bold text-white mt-3 mb-1" />,
            h4: ({ node, ...props }) => <h4 {...props} className="text-sm font-bold text-white mt-2 mb-1" />,
            h5: ({ node, ...props }) => <h5 {...props} className="text-sm font-bold text-white mt-2 mb-1" />,
            h6: ({ node, ...props }) => <h6 {...props} className="text-xs font-bold text-white mt-2 mb-1" />,
            table: ({ node, ...props }) => (
              <div className="overflow-x-auto my-4 rounded-lg border border-gray-700">
                <table {...props} className="w-full text-left text-sm text-gray-300" />
              </div>
            ),
            thead: ({ node, ...props }) => <thead {...props} className="bg-gray-800 text-gray-200" />,
            tbody: ({ node, ...props }) => <tbody {...props} className="divide-y divide-gray-700 bg-gray-900/50" />,
            tr: ({ node, ...props }) => <tr {...props} className="hover:bg-gray-800/50 transition-colors" />,
            th: ({ node, ...props }) => <th {...props} className="px-4 py-3 font-semibold whitespace-nowrap" />,
            td: ({ node, ...props }) => <td {...props} className="px-4 py-3" />,
            hr: ({ node, ...props }) => <hr {...props} className="my-4 border-gray-700" />,
            strong: ({ node, ...props }) => <strong {...props} className="font-bold text-purple-300" />,
            em: ({ node, ...props }) => <em {...props} className="italic text-gray-400" />,
            del: ({ node, ...props }) => <del {...props} className="line-through text-gray-500" />,
            p: ({ node, ...props }) => <p {...props} className="mb-2 last:mb-0 leading-relaxed" />,
            ul: ({ node, ...props }) => <ul {...props} className="list-disc list-inside mb-2 pl-1 space-y-1" />,
            ol: ({ node, ...props }) => <ol {...props} className="list-decimal list-inside mb-2 pl-1 space-y-1" />,
            blockquote: ({ node, ...props }) => (
              <blockquote
                {...props}
                className="border-l-4 border-purple-500/50 pl-4 py-1 italic bg-gray-800/30 rounded-r my-2 text-gray-400"
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
                    className="bg-gray-700/50 text-purple-200 rounded px-1.5 py-0.5 font-mono text-xs border border-gray-600/50"
                    {...props}
                  >
                    {children}
                  </code>
                )
              }
              return (
                <div className="relative group">
                  <code
                    className="block bg-gray-900 border border-gray-700 rounded-lg p-3 font-mono text-xs text-gray-300 overflow-x-auto my-2 shadow-inner"
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
                className="max-w-full h-auto rounded-lg border border-gray-700 my-2 max-h-[500px] object-contain bg-black/20"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            )
          }}
        >
          {children}
        </ReactMarkdown>
      </div>

      <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
        <AlertDialogContent className="bg-gray-800 border-gray-700 max-w-[90vw] w-full sm:max-w-lg rounded-xl shadow-2xl shadow-black/50">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">{t('common.externalLink')}</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              {t('common.externalLinkInfo')}
              <div className="mt-4 p-3 bg-black/30 rounded-lg border border-gray-700/50 break-all text-purple-400 font-mono text-xs max-h-24 overflow-y-auto">
                {targetUrl}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-3 sm:gap-0 mt-4">
            <AlertDialogCancel className="flex-1 bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white mt-0 transition-colors">
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white border-0 transition-colors"
            >
              {t('common.continue')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
