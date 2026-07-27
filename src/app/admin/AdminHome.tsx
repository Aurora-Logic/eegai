import { useSearchParams } from 'react-router-dom'
import { AppShell } from '@/components/shared/app-shell'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { t } from '@/lib/i18n'
import { Overview } from './panels/Overview'
import { NgoQueue } from './panels/NgoQueue'
import { VolunteerQueue } from './panels/VolunteerQueue'
import { Moderation } from './panels/Moderation'
import { People } from './panels/People'

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'ngos', label: 'Organisations' },
  { value: 'volunteers', label: 'Volunteers' },
  { value: 'items', label: 'Items' },
  { value: 'people', label: 'People' },
] as const

export default function AdminHome() {
  // The tab lives in the URL so an admin can send a colleague a link to the
  // exact queue they are talking about.
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'overview'

  return (
    <AppShell title={t('admin.title')} subtitle={t('admin.subtitle')}>
      <Tabs
        value={TABS.some((item) => item.value === tab) ? tab : 'overview'}
        onValueChange={(next) => setParams(next === 'overview' ? {} : { tab: next })}
      >
        <TabsList className="mb-6 flex-wrap">
          {TABS.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <Overview />
        </TabsContent>
        <TabsContent value="ngos">
          <NgoQueue />
        </TabsContent>
        <TabsContent value="volunteers">
          <VolunteerQueue />
        </TabsContent>
        <TabsContent value="items">
          <Moderation />
        </TabsContent>
        <TabsContent value="people">
          <People />
        </TabsContent>
      </Tabs>
    </AppShell>
  )
}
