"use client"

import { FormError } from "@/components/forms/error"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useDownload } from "@/hooks/use-download"
import { useProgress } from "@/hooks/use-progress"
import { Download, Loader2 } from "lucide-react"
import { useActionState } from "react"
import { restoreBackupAction } from "./actions"

export default function BackupSettingsPage() {
  const [restoreState, restoreBackup, restorePending] = useActionState(restoreBackupAction, null)

  const { isLoading, startProgress, progress } = useProgress({
    onError: (error) => {
      console.error("Backup progress error:", error)
    },
  })

  const { download, isDownloading } = useDownload({
    onError: (error) => {
      console.error("Download error:", error)
    },
  })

  const handleDownload = async () => {
    try {
      const progressId = await startProgress("backup")
      const downloadUrl = `/settings/backups/data?progressId=${progressId || ""}`
      await download(downloadUrl, "taxhacker-backup.zip")
    } catch (error) {
      console.error("Failed to start backup:", error)
    }
  }

  return (
    <div className="container flex flex-col gap-4">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">Download backup</h1>
        <div className="flex flex-row gap-4">
          <Button onClick={handleDownload} disabled={isLoading || isDownloading}>
            {isLoading ? (
              progress?.current ? (
                `Archiving ${progress.current}/${progress.total} files`
              ) : (
                "Preparing backup. Don't close the page..."
              )
            ) : isDownloading ? (
              "Archive is created. Downloading..."
            ) : (
              <>
                <Download className="mr-2" /> Download Data Archive
              </>
            )}
          </Button>
        </div>
        <div className="text-sm text-muted-foreground max-w-xl">
          Inside the archive you will find all the uploaded files, as well as JSON files for transactions, categories,
          projects, fields, currencies, and settings. You can view, edit or migrate your data to another service.
        </div>
      </div>

      <Card className="flex flex-col gap-2 mt-16 p-5 bg-red-100 max-w-xl">
        <h2 className="text-xl font-semibold">Restore from a backup</h2>
        <p className="text-sm text-muted-foreground">
          ⚠️ This action is irreversible. Restoring from a backup will delete all existing data from your current
          database and remove all uploaded files. Be careful and make a backup first!
        </p>
        <form action={restoreBackup}>
          <div className="flex flex-col gap-4 pt-4">
            <label>
              <input type="file" name="file" required />
            </label>
            <label className="flex flex-row gap-2 items-center">
              <input type="checkbox" name="removeExistingData" required />
              <span className="text-red-500">I undestand that it will permanently delete all existing data</span>
            </label>
            <Button type="submit" variant="destructive" disabled={restorePending}>
              {restorePending ? (
                <>
                  <Loader2 className="animate-spin" /> Restoring from backup... (it can take a while)
                </>
              ) : (
                "Restore from backup"
              )}
            </Button>
          </div>
        </form>
        {restoreState?.error && <FormError>{restoreState.error}</FormError>}
      </Card>

      {restoreState?.success && (
        <Card className="flex flex-col gap-2 p-5 bg-green-100 max-w-xl">
          <h2 className="text-xl font-semibold">Backup restored successfully</h2>
          <p className="text-sm text-muted-foreground">You can now continue using the app. Import stats:</p>
          <ul className="list-disc list-inside">
            {Object.entries(restoreState.data?.counters || {}).map(([key, value]) => (
              <li key={key}>
                <span className="font-bold">{key}</span>: {value} items
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
