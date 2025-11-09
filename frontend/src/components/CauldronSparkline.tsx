import { LineChart, Line, ResponsiveContainer } from 'recharts'
import { CauldronDataPoint } from '@/types'
import { cn } from '@/lib/utils'

interface CauldronSparklineProps {
  data: CauldronDataPoint[]
  className?: string
  color?: string
}

export function CauldronSparkline({ data, className, color = '#683cfc' }: CauldronSparklineProps) {
  // Transform data for recharts (convert ISO strings to numbers for x-axis)
  const chartData = data.map((point, index) => ({
    index,
    level: point.level,
  }))

  return (
    <div className={cn("w-full h-12", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="level"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

