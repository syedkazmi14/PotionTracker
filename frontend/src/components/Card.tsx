import { ReactNode } from 'react'
import { Card as UICard, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface CardProps {
  title: string
  value: string | number
  icon?: ReactNode
  className?: string
}

export function Card({ title, value, icon, className }: CardProps) {
  return (
    <UICard className={cn(className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </UICard>
  )
}

