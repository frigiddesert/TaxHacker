import { getCurrentUser } from "@/lib/auth"
import { getQBOAppData } from "@/lib/qbo"
import { importQBOFilesFormAction, saveQBOTokensFormAction } from "./actions"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Textarea } from "@/components/ui/textarea"

export const metadata = {
  title: "QuickBooks",
  description: "QuickBooks Online integration",
}

export default async function QBOSettingsPage() {
  const user = await getCurrentUser()
  const app = await getQBOAppData(user.id)
  const data: any = (app?.data as any) || {}
  const isConnected = Boolean(data?.tokens)
  const realmId = data?.tokens?.realmId

  return (
    <div className="container max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">QuickBooks Online</h1>
      <div className="bg-muted p-4 rounded-md space-y-2">
        <div>
          <span className="font-medium">Status:</span> {isConnected ? "Connected" : "Not connected"}
        </div>
        {isConnected && <div><span className="font-medium">Realm:</span> {realmId}</div>}
        <div className="flex gap-2">
          <Link href="/qb/connect">
            <Button variant={isConnected ? "outline" : "default"}>{isConnected ? "Reconnect" : "Connect to QuickBooks"}</Button>
          </Link>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Import Accounts and Classes</h2>
        <p className="text-sm text-muted-foreground">Reads files from configured paths (env: QBO_COA_PATH, QBO_CLASSES_PATH)</p>
        <form action={importQBOFilesFormAction}>
          <Button type="submit">Import from files</Button>
        </form>
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Developer: Paste Token JSON</h2>
        <p className="text-sm text-muted-foreground">Use this if OAuth redirect fails. Paste the token JSON from the CLI exchange.</p>
        <form action={saveQBOTokensFormAction} className="space-y-2">
          <Textarea name="tokens" placeholder='{"access_token":"...","refresh_token":"...","expires_in":3600,"token_type":"bearer","realmId":"123","x_refresh_token_expires_in":8639999}' rows={6} />
          <Button type="submit" variant="outline">Save tokens</Button>
        </form>
      </div>
    </div>
  )
}
