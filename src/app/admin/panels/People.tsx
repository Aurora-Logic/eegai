import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { Field, RecordCard, RecordList } from '@/components/admin/record-card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'

interface Person {
  id: string
  full_name: string
  phone: string | null
  role: string
  pincode: string | null
  is_active: boolean
  created_at: string
  last_login_at: string | null
}

export function People() {
  const [role, setRole] = useState('all')

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', role],
    queryFn: () => api.get<{ users: Person[] }>(`/admin/users?role=${role}`),
  })

  const users = data?.users ?? []

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Everyone with an account. Read-only — suspension is not built yet.
        </p>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="w-44" aria-label="Filter by role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everyone</SelectItem>
            <SelectItem value="donor">Donors</SelectItem>
            <SelectItem value="ngo">Organisations</SelectItem>
            <SelectItem value="volunteer">Volunteers</SelectItem>
            <SelectItem value="admin">Admins</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <RecordList columns={3}>
          {users.map((person) => (
            <RecordCard
              key={person.id}
              title={person.full_name}
              subtitle={person.phone ?? '—'}
              badges={
                <>
                  <Badge variant={person.role === 'admin' ? 'destructive' : 'tag'}>
                    {person.role}
                  </Badge>
                  {!person.is_active ? <Badge variant="destructive">disabled</Badge> : null}
                </>
              }
            >
              <Field label="Area">{person.pincode ?? '—'}</Field>
              <Field label="Last seen">
                {person.last_login_at
                  ? `${formatDistanceToNow(new Date(person.last_login_at))} ago`
                  : 'never'}
              </Field>
            </RecordCard>
          ))}
        </RecordList>
      )}
    </section>
  )
}
