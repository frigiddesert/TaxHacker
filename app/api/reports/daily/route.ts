import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { format, startOfDay, endOfDay } from 'date-fns'

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const dateParam = searchParams.get('date')
    
    // Default to today if no date provided
    const selectedDate = dateParam ? new Date(dateParam) : new Date()
    const startDate = startOfDay(selectedDate)
    const endDate = endOfDay(selectedDate)

    // Fetch transactions created on the selected date with vendor information
    const transactions = await prisma.transaction.findMany({
      where: {
        userId: user.id,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        vendor: {
          select: {
            paymentMethod: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return NextResponse.json({
      success: true,
      date: format(selectedDate, 'yyyy-MM-dd'),
      transactions: transactions.map(transaction => ({
        id: transaction.id,
        merchant: transaction.merchant,
        total: transaction.total,
        description: transaction.description,
        categoryCode: transaction.categoryCode,
        projectCode: transaction.projectCode,
        payOnDate: transaction.payOnDate,
        createdAt: transaction.createdAt,
        vendor: transaction.vendor ? {
          paymentMethod: transaction.vendor.paymentMethod,
        } : null,
      })),
    })
  } catch (error) {
    console.error('Error fetching daily transactions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch daily transactions' },
      { status: 500 }
    )
  }
}