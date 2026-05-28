'use client'

// 二维码扫描器（Chrome 插件桌面化重塑）
// ----------------------------------------------------------------------
// 业务逻辑完全保留：
//   - 自动检测可用相机；申请 getUserMedia（Chrome 会在用户点击后弹权限框）
//   - 没相机或权限拒绝 → 优雅降级为图片上传识别
//   - 300ms 轮询解码当前 video frame
//
// 视觉重塑：
//   - 紫色按钮 → emerald success 变体
//   - 扫描框边框 green-400 → emerald-400
//   - 弹层尺寸适配 popup（占满 inset，不再 max-w-md）
//   - 紧凑化字号 / 间距
// ----------------------------------------------------------------------

import { useEffect, useRef, useState, useCallback } from 'react'
import QrScanner from 'qr-scanner'
import { Button } from '@/components/ui/button'
import { X, Camera, CameraOff, RefreshCw, Image as ImageIcon } from 'lucide-react'
import { useLanguage } from '@/contexts/language-context'

interface QRScannerProps {
  isOpen: boolean
  onClose: () => void
  onScanResult: (result: string) => void
}

export function QRScannerComponent({ isOpen, onClose, onScanResult }: QRScannerProps) {
  const { t } = useLanguage()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isScanningRef = useRef(false)
  const isVideoReadyRef = useRef(false)

  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string>('')
  const [hasCamera, setHasCamera] = useState(true)
  const [isInitializing, setIsInitializing] = useState(false)
  const [isVideoReady, setIsVideoReady] = useState(false)

  useEffect(() => {
    isScanningRef.current = isScanning
  }, [isScanning])

  useEffect(() => {
    isVideoReadyRef.current = isVideoReady
  }, [isVideoReady])

  const checkCameraAvailability = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = devices.filter((device) => device.kind === 'videoinput')
      return videoDevices.length > 0
    } catch (err) {
      console.error('检查摄像头可用性失败:', err)
      return false
    }
  }, [])

  const startCamera = useCallback(async () => {
    if (!videoRef.current) return false

    try {
      setIsInitializing(true)
      setError('')
      setIsVideoReady(false)

      const cameraAvailable = await checkCameraAvailability()
      if (!cameraAvailable) {
        setError(t('qr.error'))
        setHasCamera(false)
        return false
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }

      const video = videoRef.current
      if (!video.paused) {
        video.pause()
        await new Promise<void>((resolve) => {
          if (video.paused) resolve()
          else {
            const onPause = () => {
              video.removeEventListener('pause', onPause)
              resolve()
            }
            video.addEventListener('pause', onPause)
          }
        })
      }

      if (video.srcObject) {
        video.srcObject = null
        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      const constraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      if (!videoRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return false
      }

      streamRef.current = stream
      video.srcObject = stream
      video.setAttribute('playsinline', 'true')
      video.setAttribute('muted', 'true')

      await new Promise<void>((resolve, reject) => {
        let resolved = false
        let timeoutId: ReturnType<typeof setTimeout>

        const cleanup = () => {
          if (timeoutId) clearTimeout(timeoutId)
          video.removeEventListener('loadedmetadata', onLoadedMetadata)
          video.removeEventListener('canplay', onCanPlay)
          video.removeEventListener('error', onError)
          video.removeEventListener('abort', onAbort)
        }

        const resolveOnce = (success: boolean, error?: Error) => {
          if (resolved) return
          resolved = true
          cleanup()
          if (success) {
            setIsVideoReady(true)
            resolve()
          } else {
            reject(error || new Error('Video loading failed'))
          }
        }

        const onLoadedMetadata = async () => {
          try {
            if (video.readyState >= 2) {
              await video.play()
              resolveOnce(true)
            }
          } catch (playError) {
            resolveOnce(false, playError as Error)
          }
        }

        const onCanPlay = async () => {
          try {
            await video.play()
            resolveOnce(true)
          } catch (playError) {
            resolveOnce(false, playError as Error)
          }
        }

        const onError = () => resolveOnce(false, new Error('Video loading failed'))
        const onAbort = () => resolveOnce(false, new Error('Video loading was aborted'))

        timeoutId = setTimeout(() => resolveOnce(false, new Error('Video loading timeout')), 10000)

        video.addEventListener('loadedmetadata', onLoadedMetadata)
        video.addEventListener('canplay', onCanPlay)
        video.addEventListener('error', onError)
        video.addEventListener('abort', onAbort)

        if (video.readyState >= 2) onLoadedMetadata()
        else if (video.readyState >= 1) onCanPlay()
      })

      setHasCamera(true)
      return true
    } catch (err) {
      console.error('启动摄像头失败:', err)
      const errorMessage = err instanceof Error ? err.message : '未知错误'
      if (errorMessage.includes('Permission denied') || errorMessage.includes('NotAllowedError')) {
        setError(t('qr.errorDesc'))
      } else if (
        errorMessage.includes('NotFoundError') ||
        errorMessage.includes('DevicesNotFoundError')
      ) {
        setError(t('qr.error'))
        setHasCamera(false)
      } else {
        setError(`${t('qr.error')}: ${errorMessage}`)
      }
      return false
    } finally {
      setIsInitializing(false)
    }
  }, [checkCameraAvailability, t])

  const stopCamera = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current)
      scanIntervalRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      const video = videoRef.current
      if (!video.paused) video.pause()
      video.srcObject = null
    }
    setIsScanning(false)
    setIsVideoReady(false)
  }, [])

  const scanQRCode = useCallback(async () => {
    const currentIsScanning = isScanningRef.current
    const currentIsVideoReady = isVideoReadyRef.current
    if (!videoRef.current || !canvasRef.current || !currentIsScanning || !currentIsVideoReady) return
    try {
      const video = videoRef.current
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) return

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      try {
        // @ts-ignore qr-scanner 类型对 canvas 入参不严格
        const result = await QrScanner.scanImage(canvas, {
          returnDetailedScanResult: true,
          highlightScanRegion: false,
          highlightCodeOutline: false,
        })
        if (result && result.data) {
          onScanResult(result.data)
          onClose()
        }
      } catch {
        // 无二维码，继续轮询
      }
    } catch (err) {
      console.error('扫描二维码失败:', err)
    }
  }, [onScanResult, onClose])

  const startScanning = useCallback(async () => {
    if (isScanning || isInitializing) return
    const cameraStarted = await startCamera()
    if (!cameraStarted) return
    setIsScanning(true)
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current)
    scanIntervalRef.current = setInterval(() => scanQRCode(), 300)
  }, [startCamera, scanQRCode, isScanning, isInitializing])

  const toggleScanning = useCallback(async () => {
    if (isScanning) {
      stopCamera()
    } else {
      await startScanning()
    }
  }, [isScanning, startScanning, stopCamera])

  const handleRetry = useCallback(async () => {
    try {
      setError('')
      stopCamera()
      setIsInitializing(false)
      await new Promise((resolve) => setTimeout(resolve, 1000))
      await startScanning()
    } catch (retryError) {
      const errorMessage = retryError instanceof Error ? retryError.message : '重试失败'
      setError(t('qr.errorDesc') + errorMessage)
    }
  }, [startScanning, stopCamera, t])

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return
      try {
        setError('')
        const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true })
        if (result && result.data) {
          onScanResult(result.data)
          onClose()
        }
      } catch {
        onScanResult('')
        onClose()
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [onScanResult, onClose],
  )

  const triggerFileUpload = useCallback(() => fileInputRef.current?.click(), [])

  const handleClose = useCallback(() => {
    stopCamera()
    setIsInitializing(false)
    setError('')
    onClose()
  }, [stopCamera, onClose])

  useEffect(() => {
    if (!isOpen) return
    let mounted = true
    const initializeScanner = async () => {
      try {
        await new Promise((resolve) => setTimeout(resolve, 100))
        if (mounted) await startScanning()
      } catch (initError) {
        if (mounted) {
          const errorMessage = initError instanceof Error ? initError.message : '初始化失败'
          setError(t('qr.errorDesc') + errorMessage)
        }
      }
    }
    initializeScanner()
    return () => {
      mounted = false
      stopCamera()
      setError('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="absolute inset-0 z-50 bg-zinc-950/90 backdrop-blur-sm flex items-stretch justify-center">
      <div className="w-full bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden flex flex-col">
        {/* 顶栏 */}
        <div className="flex items-center justify-between px-3 h-10 border-b border-zinc-800 shrink-0">
          <h3 className="text-sm font-semibold text-zinc-100">{t('qr.title')}</h3>
          <Button
            onClick={handleClose}
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* 主体 */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
          {/* 视频预览区 */}
          <div className="relative aspect-square bg-black rounded-md overflow-hidden border border-zinc-800/60">
            {hasCamera ? (
              <>
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  playsInline
                  muted
                  autoPlay
                />
                <canvas ref={canvasRef} className="hidden" />
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-400">
                <div className="text-center">
                  <CameraOff className="h-8 w-8 mx-auto mb-1.5" />
                  <p className="text-xs">{t('qr.error')}</p>
                </div>
              </div>
            )}

            {isInitializing && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <div className="text-center text-zinc-100">
                  <RefreshCw className="h-6 w-6 mx-auto mb-1.5 animate-spin" />
                  <p className="text-xs">{t('qr.loading')}</p>
                </div>
              </div>
            )}

            {/* 扫描框（emerald 角标 + 扫描线） */}
            {isScanning && !isInitializing && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-40 h-40 relative">
                  <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-emerald-400" />
                  <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-emerald-400" />
                  <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-emerald-400" />
                  <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-emerald-400" />
                  <div className="absolute inset-0 overflow-hidden">
                    <div className="w-full h-px bg-emerald-400 animate-pulse absolute top-1/2 -translate-y-1/2 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 错误 */}
          {error && (
            <div className="text-center bg-red-500/10 border border-red-500/30 rounded-md p-2">
              <p className="text-[11px] text-red-400 leading-relaxed">{error}</p>
              <Button onClick={handleRetry} variant="ghost" size="xs" className="mt-1 text-red-400 hover:text-red-300">
                <RefreshCw className="h-3 w-3" />
                {t('qr.retry')}
              </Button>
            </div>
          )}

          {/* 状态文字 */}
          <div className="text-center">
            {isInitializing ? (
              <p className="text-[11px] text-amber-400">{t('qr.loading')}</p>
            ) : isScanning ? (
              <p className="text-[11px] text-emerald-400">{t('qr.scanning')}</p>
            ) : hasCamera ? (
              <p className="text-[11px] text-zinc-400">{t('qr.cameraStopped')}</p>
            ) : (
              <p className="text-[11px] text-zinc-400">{t('qr.checkPermissions')}</p>
            )}
          </div>

          {/* 操作 */}
          <div className="space-y-2">
            <div className="flex gap-2">
              {hasCamera && (
                <Button
                  onClick={toggleScanning}
                  disabled={isInitializing}
                  variant="success"
                  size="sm"
                  className="flex-1"
                >
                  {isScanning ? (
                    <>
                      <CameraOff className="h-3.5 w-3.5" />
                      {t('qr.stopScanning')}
                    </>
                  ) : (
                    <>
                      <Camera className="h-3.5 w-3.5" />
                      {t('qr.startScanning')}
                    </>
                  )}
                </Button>
              )}
              <Button onClick={triggerFileUpload} variant="outline" size="sm" className="flex-1">
                <ImageIcon className="h-3.5 w-3.5" />
                {t('qr.upload')}
              </Button>
            </div>
            <Button onClick={handleClose} variant="ghost" size="sm" className="w-full">
              {t('qr.cancel')}
            </Button>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={handleFileUpload}
          />
        </div>
      </div>
    </div>
  )
}
