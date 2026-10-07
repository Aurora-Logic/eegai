import { useState } from 'react'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { areaFor, areaOptions, type Area } from '@/lib/areas'
import { t } from '@/lib/i18n'

/**
 * Pick an area, or type a pincode that is not on the list.
 *
 * The list covers Coimbatore, Tiruppur and Mettupalayam, and it will always be
 * missing somebody's village. Before this, that person simply could not finish
 * signing up. Now they type the six digits and are placed at their town centre
 * — coarse for distance, but they are in the product.
 *
 * The caller gets the resolved area, not just the pincode, because every caller
 * needs its coordinates: without them a donation is invisible to everyone.
 */
export function AreaPicker({
  value,
  onChange,
  id,
  'aria-invalid': ariaInvalid,
}: {
  value: string | undefined
  onChange: (pincode: string, area: Area | null) => void
  id?: string
  'aria-invalid'?: boolean
}) {
  const listed = value ? areaOptions().some((option) => option.value === value) : true
  const [typing, setTyping] = useState(!listed)

  if (typing) {
    return (
      <div className="space-y-1.5">
        <Input
          id={id}
          inputMode="numeric"
          maxLength={6}
          placeholder="641001"
          value={value ?? ''}
          aria-invalid={ariaInvalid ?? undefined}
          aria-label="Pincode"
          onChange={(e) => {
            const pincode = e.target.value.replace(/\D/g, '').slice(0, 6)
            onChange(pincode, areaFor(pincode))
          }}
        />
        <button
          type="button"
          className="text-xs underline underline-offset-4"
          onClick={() => {
            setTyping(false)
            onChange('', null)
          }}
        >
          Choose from the list instead
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <Combobox
        id={id}
        options={areaOptions()}
        value={value ?? ''}
        onChange={(pincode) => onChange(pincode, areaFor(pincode))}
        placeholder={t('post.areaPlaceholder')}
        searchPlaceholder={t('post.areaSearch')}
        emptyText={t('post.areaEmpty')}
        aria-invalid={ariaInvalid}
      />
      <button
        type="button"
        className="text-xs underline underline-offset-4"
        onClick={() => setTyping(true)}
      >
        My pincode is not on the list
      </button>
    </div>
  )
}
