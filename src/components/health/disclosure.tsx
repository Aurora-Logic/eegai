/**
 * The disclosure the developer brief requires, verbatim.
 *
 * Brief §8 marks it required, and it is the sentence that keeps this lane
 * honest about what it is: a coordination layer. It appears on every health
 * screen rather than once at signup, because somebody reading a request for
 * blood at 11pm is not going to scroll back to an onboarding step.
 *
 * The wording is not paraphrased and should not be edited without whoever
 * wrote the brief, which is why it lives in one file.
 */
export const REQUIRED_DISCLOSURE =
  'EEGAI connects willing donors with verified organisations. It does not itself ' +
  'collect, store, test, process, transport or distribute blood or breast milk, and ' +
  'does not determine medical eligibility. All actual donation procedures are handled ' +
  'directly by the relevant verified institution.'

export function Disclosure({ className }: { className?: string | undefined }) {
  return (
    <p
      className={`hairline rounded-sm bg-card p-3 text-xs text-muted-foreground ${className ?? ''}`}
    >
      {REQUIRED_DISCLOSURE}
    </p>
  )
}
