import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Download } from 'lucide-react'
import { Markdown } from '@/components/ui/markdown'

interface UpdateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentVersion: string
  newVersion: string
  releaseNotes?: string | null
  onUpdate: () => void
  onSkip: (version: string) => void
}

export function UpdateDialog({
  open,
  onOpenChange,
  currentVersion,
  newVersion,
  releaseNotes,
  onUpdate,
  onSkip,
}: UpdateDialogProps) {
  const [skipVersion, setSkipVersion] = useState(false)

  const handleCancel = () => {
    if (skipVersion) {
      onSkip(newVersion)
    }
    onOpenChange(false)
  }

  const handleUpdate = () => {
    onUpdate()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            发现新版本 v{newVersion}
          </DialogTitle>
          <DialogDescription>
            当前版本：v{currentVersion}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {releaseNotes && (
            <div>
              <h4 className="text-sm font-medium mb-2">更新内容</h4>
              <Markdown>{releaseNotes}</Markdown>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Checkbox
              id="skip-version"
              checked={skipVersion}
              onCheckedChange={(checked) => setSkipVersion(checked === true)}
            />
            <Label htmlFor="skip-version" className="text-sm">
              跳过此版本
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            稍后再说
          </Button>
          <Button onClick={handleUpdate}>立即更新</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
