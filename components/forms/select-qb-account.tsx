"use client"

import { QbAccount } from "@/prisma/client"
import { SelectProps } from "@radix-ui/react-select"
import { useMemo } from "react"
import { FormSelect } from "./simple"

export const FormSelectQbAccount = ({
  title,
  qbAccounts,
  emptyValue,
  placeholder,
  hideIfEmpty = false,
  isRequired = false,
  ...props
}: {
  title: string
  qbAccounts: QbAccount[]
  emptyValue?: string
  placeholder?: string
  hideIfEmpty?: boolean
  isRequired?: boolean
} & SelectProps) => {
  const items = useMemo(
    () => qbAccounts.map((account) => ({ 
      code: account.id, 
      name: `${account.accountNumber ? account.accountNumber + ' - ' : ''}${account.fullName}`,
    })),
    [qbAccounts]
  )
  
  return (
    <FormSelect
      title={title}
      items={items}
      emptyValue={emptyValue}
      placeholder={placeholder}
      hideIfEmpty={hideIfEmpty}
      isRequired={isRequired}
      {...props}
    />
  )
}