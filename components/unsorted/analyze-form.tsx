"use client"

import { useNotification } from "@/app/(app)/context"
import { analyzeFileAction, deleteUnsortedFileAction, saveFileAsTransactionAction } from "@/app/(app)/unsorted/actions"
import { CurrencyConverterTool } from "@/components/agents/currency-converter"
import { ItemsDetectTool } from "@/components/agents/items-detect"
import ToolWindow from "@/components/agents/tool-window"
import { FormError } from "@/components/forms/error"
import { FormSelectCategory } from "@/components/forms/select-category"
import { FormSelectCurrency } from "@/components/forms/select-currency"
import { FormSelectProject } from "@/components/forms/select-project"
import { FormSelectType } from "@/components/forms/select-type"
import { FormInput, FormTextarea, FormSelect } from "@/components/forms/simple"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Category, Currency, Field, File, Project, Vendor } from "@/prisma/client"
import { format } from "date-fns"
import { ArrowDownToLine, Brain, Loader2, Trash2 } from "lucide-react"
import { startTransition, useActionState, useMemo, useState } from "react"

export default function AnalyzeForm({
  file,
  categories,
  projects,
  currencies,
  fields,
  settings,
  vendors,
}: {
  file: File
  categories: Category[]
  projects: Project[]
  currencies: Currency[]
  fields: Field[]
  settings: Record<string, string>
  vendors?: Vendor[]
}) {
  const { showNotification } = useNotification()
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analyzeStep, setAnalyzeStep] = useState<string>("")
  const [analyzeError, setAnalyzeError] = useState<string>("")
  const [deleteState, deleteAction, isDeleting] = useActionState(deleteUnsortedFileAction, null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState("")

  const fieldMap = useMemo(() => {
    return fields.reduce(
      (acc, field) => {
        acc[field.code] = field
        return acc
      },
      {} as Record<string, Field>
    )
  }, [fields])

  const extraFields = useMemo(() => fields.filter((field) => field.isExtra), [fields])
  const initialFormState = useMemo(() => {
    const baseState = {
      name: file.filename,
      merchant: "",
      description: "",
      type: settings.default_type,
      total: 0.0,
      currencyCode: settings.default_currency,
      convertedTotal: 0.0,
      convertedCurrencyCode: settings.default_currency,
      categoryCode: settings.default_category,
      projectCode: settings.default_project,
      issuedAt: "",
      payOnDate: "",
      note: "",
      text: "",
      items: [],
    }

    // Add extra fields
    const extraFieldsState = extraFields.reduce(
      (acc, field) => {
        acc[field.code] = ""
        return acc
      },
      {} as Record<string, string>
    )

    // Load cached results if they exist
    const cachedResults = file.cachedParseResult
      ? Object.fromEntries(
          Object.entries(file.cachedParseResult as Record<string, string>).filter(
            ([_, value]) => value !== null && value !== undefined && value !== ""
          )
        )
      : {}

    // Auto-fill issued date from email metadata if available and no cached result
    let autoFilledFields = {}
    if (file.metadata && typeof file.metadata === 'object' && 'source' in file.metadata) {
      const metadata = file.metadata as any
      if (metadata.source === 'email' && metadata.receivedDate && !cachedResults.issuedAt) {
        const emailDate = new Date(metadata.receivedDate)
        autoFilledFields = {
          issuedAt: emailDate.toISOString().split('T')[0] // Format as YYYY-MM-DD
        }
      }
    }

    return {
      ...baseState,
      ...extraFieldsState,
      ...autoFilledFields,
      ...cachedResults,
    }
  }, [file.filename, settings, extraFields, file.cachedParseResult])
  const [formData, setFormData] = useState(initialFormState)

  // Check if merchant is a known vendor
  const isUnknownVendor = useMemo(() => {
    if (!formData.merchant || !vendors || vendors.length === 0) return false
    
    const merchantName = formData.merchant.toLowerCase().trim()
    return !vendors.some(vendor => 
      vendor.name.toLowerCase().includes(merchantName) ||
      merchantName.includes(vendor.name.toLowerCase())
    )
  }, [formData.merchant, vendors])

  async function saveAsTransaction(formData: FormData) {
    setSaveError("")
    setIsSaving(true)
    startTransition(async () => {
      const result = await saveFileAsTransactionAction(null, formData)
      setIsSaving(false)

      if (result.success) {
        showNotification({ code: "global.banner", message: "Saved!", type: "success" })
        showNotification({ code: "sidebar.transactions", message: "new" })
        setTimeout(() => showNotification({ code: "sidebar.transactions", message: "" }), 3000)
      } else {
        setSaveError(result.error ? result.error : "Something went wrong...")
        showNotification({ code: "global.banner", message: "Failed to save", type: "failed" })
      }
    })
  }

  const startAnalyze = async () => {
    setIsAnalyzing(true)
    setAnalyzeError("")
    try {
      setAnalyzeStep("Analyzing...")
      const results = await analyzeFileAction(file, settings, fields, categories, projects)

      console.log("Analysis results:", results)

      if (!results.success) {
        setAnalyzeError(results.error ? results.error : "Something went wrong...")
      } else {
        const nonEmptyFields = Object.fromEntries(
          Object.entries(results.data?.output || {}).filter(
            ([_, value]) => value !== null && value !== undefined && value !== ""
          )
        )
        setFormData({ ...formData, ...nonEmptyFields })
      }
    } catch (error) {
      console.error("Analysis failed:", error)
      setAnalyzeError(error instanceof Error ? error.message : "Analysis failed")
    } finally {
      setIsAnalyzing(false)
      setAnalyzeStep("")
    }
  }

  return (
    <>
      {file.isSplitted ? (
        <div className="flex justify-end">
          <Badge variant="outline">This file has been split up</Badge>
        </div>
      ) : (
        <Button className="w-full mb-6 py-6 text-lg" onClick={startAnalyze} disabled={isAnalyzing} data-analyze-button>
          {isAnalyzing ? (
            <>
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              <span>{analyzeStep}</span>
            </>
          ) : (
            <>
              <Brain className="mr-1 h-4 w-4" />
              <span>Analyze with AI</span>
            </>
          )}
        </Button>
      )}

      <div>{analyzeError && <FormError>{analyzeError}</FormError>}</div>

      <form className="space-y-4" action={saveAsTransaction}>
        <input type="hidden" name="fileId" value={file.id} />
        <FormInput
          title={fieldMap.name.name}
          name="name"
          value={formData.name}
          onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
          required={fieldMap.name.isRequired}
        />

        <div className="space-y-2">
          <div className="relative">
            <FormInput
              title={fieldMap.merchant.name}
              name="merchant"
              value={formData.merchant}
              onChange={(e) => setFormData((prev) => ({ ...prev, merchant: e.target.value }))}
              hideIfEmpty={!fieldMap.merchant.isVisibleInAnalysis}
              required={fieldMap.merchant.isRequired}
              className={isUnknownVendor ? "border-orange-400 bg-orange-50" : ""}
            />
            {isUnknownVendor && formData.merchant && (
              <div className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs px-2 py-1 rounded-full shadow-sm">
                Unknown Vendor
              </div>
            )}
          </div>
          
          {isUnknownVendor && formData.merchant && (
            <div className="flex items-center space-x-2 p-3 bg-orange-50 rounded-md border border-orange-200">
              <input 
                type="checkbox" 
                id="addToKnownBillers" 
                name="addToKnownBillers" 
                className="rounded border-orange-300 focus:ring-orange-500"
              />
              <label htmlFor="addToKnownBillers" className="text-sm text-orange-800">
                Add "{formData.merchant}" to known billers for future AI filtering
              </label>
            </div>
          )}
        </div>


        <div className="flex flex-wrap gap-4">
          <FormInput
            title={fieldMap.total.name}
            name="total"
            type="number"
            step="0.01"
            value={formData.total || ""}
            onChange={(e) => {
              const newValue = parseFloat(e.target.value || "0")
              !isNaN(newValue) && setFormData((prev) => ({ ...prev, total: newValue }))
            }}
            className="w-32"
            required={fieldMap.total.isRequired}
          />

          {/* Currency field hidden per user request - defaulting to USD */}
          <input type="hidden" name="currencyCode" value="USD" />

          <FormSelectType
            title={fieldMap.type.name}
            name="type"
            value={formData.type}
            onValueChange={(value) => setFormData((prev) => ({ ...prev, type: value }))}
            hideIfEmpty={!fieldMap.type.isVisibleInAnalysis}
            required={fieldMap.type.isRequired}
          />
        </div>

        {formData.total != 0 && formData.currencyCode && formData.currencyCode !== settings.default_currency && (
          <ToolWindow title={`Exchange rate on ${format(new Date(formData.issuedAt || Date.now()), "LLLL dd, yyyy")}`}>
            <CurrencyConverterTool
              originalTotal={formData.total}
              originalCurrencyCode={formData.currencyCode}
              targetCurrencyCode={settings.default_currency}
              date={new Date(formData.issuedAt || Date.now())}
              onChange={(value) => setFormData((prev) => ({ ...prev, convertedTotal: value }))}
            />
            <input type="hidden" name="convertedCurrencyCode" value={settings.default_currency} />
          </ToolWindow>
        )}

        <div className="flex flex-row gap-4">
          <FormInput
            title={fieldMap.issuedAt.name}
            type="date"
            name="issuedAt"
            value={formData.issuedAt}
            onChange={(e) => setFormData((prev) => ({ ...prev, issuedAt: e.target.value }))}
            hideIfEmpty={!fieldMap.issuedAt.isVisibleInAnalysis}
            required={fieldMap.issuedAt.isRequired}
          />
          
          <FormInput
            title="Pay On Date"
            type="date"
            name="payOnDate"
            value={formData.payOnDate}
            onChange={(e) => setFormData((prev) => ({ ...prev, payOnDate: e.target.value }))}
          />
        </div>

        <div className="flex flex-row gap-4">
          <FormSelectCategory
            title="QB Account"
            categories={categories}
            name="categoryCode"
            value={formData.categoryCode}
            onValueChange={(value) => setFormData((prev) => ({ ...prev, categoryCode: value }))}
            placeholder="Select QB Account"
            hideIfEmpty={!fieldMap.categoryCode.isVisibleInAnalysis}
            required={fieldMap.categoryCode.isRequired}
          />

          {projects.length > 0 && (
            <FormSelectProject
              title="QB Class"
              projects={projects}
              name="projectCode"
              value={formData.projectCode}
              onValueChange={(value) => setFormData((prev) => ({ ...prev, projectCode: value }))}
              placeholder="Select QB Class"
              hideIfEmpty={!fieldMap.projectCode.isVisibleInAnalysis}
              required={fieldMap.projectCode.isRequired}
            />
          )}
          
          <FormInput
            title="Memo/Description"
            name="description"
            value={formData.description}
            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="Enter memo for payment"
          />
        </div>

        <FormInput
          title={fieldMap.note.name}
          name="note"
          value={formData.note}
          onChange={(e) => setFormData((prev) => ({ ...prev, note: e.target.value }))}
          hideIfEmpty={!fieldMap.note.isVisibleInAnalysis}
          required={fieldMap.note.isRequired}
        />

        {extraFields.map((field) => {
          if (field.type === "select" && field.options && (field.options as any).choices) {
            const choices = (field.options as any).choices as string[]
            const items = choices.map(choice => ({ code: choice, name: choice }))
            
            return (
              <FormSelect
                key={field.code}
                title={field.name}
                name={field.code}
                value={formData[field.code as keyof typeof formData] as string}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, [field.code]: value }))}
                items={items}
                placeholder={`Select ${field.name}`}
                hideIfEmpty={!field.isVisibleInAnalysis}
                isRequired={field.isRequired}
              />
            )
          }
          
          return (
            <FormInput
              key={field.code}
              type="text"
              title={field.name}
              name={field.code}
              value={formData[field.code as keyof typeof formData]}
              onChange={(e) => setFormData((prev) => ({ ...prev, [field.code]: e.target.value }))}
              hideIfEmpty={!field.isVisibleInAnalysis}
              required={field.isRequired}
            />
          )
        })}

        {formData.items && formData.items.length > 0 && (
          <ToolWindow title="Detected items">
            <ItemsDetectTool file={file} data={formData} />
          </ToolWindow>
        )}

        <div className="hidden">
          <input type="text" name="items" value={JSON.stringify(formData.items)} readOnly />
          <FormTextarea
            title={fieldMap.text.name}
            name="text"
            value={formData.text}
            onChange={(e) => setFormData((prev) => ({ ...prev, text: e.target.value }))}
            hideIfEmpty={!fieldMap.text.isVisibleInAnalysis}
          />
        </div>

        <div className="flex justify-between gap-4 pt-6">
          <Button
            type="button"
            onClick={() => startTransition(() => deleteAction(file.id))}
            variant="destructive"
            disabled={isDeleting}
          >
            <Trash2 className="h-4 w-4" />
            {isDeleting ? "⏳ Deleting..." : "Delete"}
          </Button>

          <Button type="submit" disabled={isSaving} data-save-button>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <ArrowDownToLine className="h-4 w-4" />
                Save as Transaction
              </>
            )}
          </Button>
        </div>

        <div>
          {deleteState?.error && <FormError>{deleteState.error}</FormError>}
          {saveError && <FormError>{saveError}</FormError>}
        </div>
      </form>
    </>
  )
}
