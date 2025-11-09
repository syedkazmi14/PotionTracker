import { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface ChartContainerProps {
  children: ReactNode
  className?: string
  title?: string
}

export function ChartContainer({ children, className, title }: ChartContainerProps) {
  return (
    <Card className={cn(className)}>
      {title && (
        <div className="p-6 pb-0">
          <h3 className="text-lg font-semibold">{title}</h3>
        </div>
      )}
      <CardContent className={cn("p-6", !title && "pt-6")}>
        <div className="w-full h-[300px] sm:h-[400px]">
          {children}
        </div>
      </CardContent>
    </Card>
  )
}

