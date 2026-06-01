'use client'

// Toast 演示页（开发期工具，当前未被任何路由引用）
// 留作 toast 系统手动验证；视觉与全局 token 对齐。

import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function ToastDemo() {
  const { toast } = useToast()

  const showDefaultToast = () => {
    toast({
      title: '默认通知',
      description: '这是一个默认样式的通知消息，会在 3 秒后自动关闭。',
    })
  }

  const showSuccessToast = () => {
    toast({
      variant: 'success',
      title: '操作成功',
      description: '您的操作已成功完成！',
    })
  }

  const showWarningToast = () => {
    toast({
      variant: 'warning',
      title: '警告提示',
      description: '请注意，这是一个警告消息。',
    })
  }

  const showErrorToast = () => {
    toast({
      variant: 'destructive',
      title: '错误提示',
      description: '操作失败，请重试。',
    })
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Toast 通知组件演示</CardTitle>
          <CardDescription>点击下面的按钮来测试不同类型的通知效果</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={showDefaultToast} variant="outline" size="sm">
              默认通知
            </Button>
            <Button onClick={showSuccessToast} variant="success" size="sm">
              成功通知
            </Button>
            <Button
              onClick={showWarningToast}
              size="sm"
              className="bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25"
            >
              警告通知
            </Button>
            <Button onClick={showErrorToast} variant="destructive" size="sm">
              错误通知
            </Button>
          </div>

          <div className="mt-4 p-3 bg-zinc-950 rounded-md border border-zinc-800/60">
            <h3 className="text-xs text-zinc-100 font-semibold mb-1.5">功能特性：</h3>
            <ul className="text-[11px] text-zinc-400 space-y-1 leading-relaxed">
              <li>• 只显示一个通知（新通知会替换旧通知）</li>
              <li>• 3 秒自动关闭</li>
              <li>• 可手动点击关闭按钮</li>
              <li>• 简洁的实色背景 + 主题色描边</li>
              <li>• 支持多种通知类型（默认、成功、警告、错误）</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
