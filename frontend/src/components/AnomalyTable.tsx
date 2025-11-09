import { Anomaly } from '@/types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { DateTime } from 'luxon'
import { cn } from '@/lib/utils'

interface AnomalyTableProps {
  anomalies: Anomaly[]
  className?: string
}

const severityColors = {
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
  critical: 'bg-red-500/20 text-red-400 border-red-500/50',
}

export function AnomalyTable({ anomalies, className }: AnomalyTableProps) {
  return (
    <div className={cn("rounded-md border", className)}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Severity</TableHead>
            <TableHead>Message</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {anomalies.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No anomalies found
              </TableCell>
            </TableRow>
          ) : (
            anomalies.map((anomaly) => (
              <TableRow key={anomaly.id}>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={cn(
                      severityColors[anomaly.severity],
                      "border"
                    )}
                  >
                    {anomaly.severity}
                  </Badge>
                </TableCell>
                <TableCell>{anomaly.message}</TableCell>
                <TableCell>
                  {DateTime.fromISO(anomaly.timestamp).toLocaleString(DateTime.DATETIME_SHORT)}
                </TableCell>
                <TableCell>
                  <Badge variant={anomaly.resolved ? 'secondary' : 'default'}>
                    {anomaly.resolved ? 'Resolved' : 'Active'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

