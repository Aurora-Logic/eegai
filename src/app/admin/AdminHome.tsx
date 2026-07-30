import { useSearchParams } from 'react-router-dom'
import { AppShell } from '@/components/shared/app-shell'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { t } from '@/lib/i18n'
import { Overview } from './panels/Overview'
import { NgoQueue } from './panels/NgoQueue'
import { VolunteerQueue } from './panels/VolunteerQueue'
import { Moderation } from './panels/Moderation'
import { People } from './panels/People'
import { LegalPanel } from './panels/LegalPanel'
import { ProductPanel } from './panels/ProductPanel'

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'ngos', label: 'Organisations' },
  { value: 'volunteers', label: 'Volunteers' },
  { value: 'items', label: 'Items' },
  { value: 'people', label: 'People' },
  { value: 'legal', label: 'Legal' },
  { value: 'product', label: 'Product' },
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
        {/* Five tabs do not fit a phone. `flex-wrap` let the fifth drop onto a
            second line while the pill background kept the base height, so
            "People" floated outside its own container looking like a stray
            heading. A single scrolling row is the fix: it cannot wrap, the
            background always covers it, and side-scrolling a tab strip is a
            gesture people already know. */}
        <TabsList className="mb-6 flex h-auto w-full justify-start overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((item) => (
            <TabsTrigger key={item.value} value={item.value} className="shrink-0">
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
        <TabsContent value="legal">
          <LegalPanel />
        </TabsContent>
        <TabsContent value="product">
          <ProductPanel />
        </TabsContent>
      </Tabs>
    </AppShell>
  )
}
