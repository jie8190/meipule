import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { FileUp } from 'lucide-react'
import { useUi } from '@/store/ui'

/** 把 JSON 拖到任意位置导入；拖入图片直接开始 AI 扒谱 */
export function GlobalDrop() {
  const [over, setOver] = useState(false)
  const navigate = useNavigate()
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files')
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setOver(true)
    }
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setOver(false)
    }
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const onDrop = async (e: DragEvent) => {
      if (!hasFiles(e)) return
      // 交给页面内自己的拖放区处理
      if ((e.target as HTMLElement | null)?.closest?.('[data-dropzone]')) {
        depth = 0
        setOver(false)
        return
      }
      e.preventDefault()
      depth = 0
      setOver(false)
      const files = [...(e.dataTransfer?.files ?? [])]
      const images = files.filter((f) => f.type.startsWith('image/'))
      const json = files.find((f) => /\.(json|txt)$/i.test(f.name) || f.type === 'application/json')
      if (images.length) {
        useUi.getState().setPendingImages(images)
        navigate('/ai')
      } else if (json) {
        useUi.getState().openImport(await json.text())
      }
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [navigate])
  return (
    <AnimatePresence>
      {over && (
        <motion.div
          className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ scale: 0.94 }}
            animate={{ scale: 1 }}
            className="flex w-full max-w-lg flex-col items-center gap-3 rounded-[32px] border-2 border-dashed border-accent bg-surface/90 px-10 py-14 text-center"
          >
            <span className="flex size-14 items-center justify-center rounded-2xl bg-accent-gradient text-accent-fg">
              <FileUp className="size-7" />
            </span>
            <div className="text-lg font-semibold">松手导入</div>
            <div className="text-sm text-fg-2">JSON 曲谱直接导入；图片会交给 AI 扒谱</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
