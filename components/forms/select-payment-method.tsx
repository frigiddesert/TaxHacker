"use client"

import { FormSelect } from "@/components/forms/simple"
import { PaymentMethod } from "@/prisma/client"

interface FormSelectPaymentMethodProps {
  title: string
  name: string
  paymentMethods: PaymentMethod[]
  value?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  hideIfEmpty?: boolean
  required?: boolean
  isRequired?: boolean
}

export function FormSelectPaymentMethod({
  title,
  name,
  paymentMethods,
  value,
  onValueChange,
  placeholder = "Select Payment Method",
  hideIfEmpty = false,
  required = false,
  isRequired = false,
}: FormSelectPaymentMethodProps) {
  const items = paymentMethods.map((paymentMethod) => ({
    code: paymentMethod.code,
    name: paymentMethod.name,
  }))

  return (
    <FormSelect
      title={title}
      name={name}
      value={value}
      onValueChange={onValueChange}
      items={items}
      placeholder={placeholder}
      hideIfEmpty={hideIfEmpty}
      isRequired={required || isRequired}
    />
  )
}