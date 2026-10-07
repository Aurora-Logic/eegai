/**
 * Asks TypeSafe's Jev whether a piece of on-screen text breaks one of the
 * brief's hard rules.
 *
 * Playwright can say a string is or is not on a page. It cannot say what the
 * page *means*, and the rules that matter most here are about meaning: EEGAI
 * must never claim to test blood, never hand a donor's location to a hospital,
 * never give out a number before the donor agrees, and never involve money.
 * Copy on these screens has been rewritten many times; a sentence that implies
 * any of those in new words would pass every string assertion in the suite.
 *
 * Each rule is a Noul — the probability that the answer is yes — and all four
 * go in one request per screen, since they read the same text and cannot see
 * each other's answers.
 *
 * The key stays in this Node process. Nothing here runs in the browser.
 */

export const RULES = {
  claims_medical_role: {
    type: 'noul',
    instructions:
      'Does `screen` claim or imply that EEGAI itself collects, stores, tests, screens, processes, transports or distributes blood or breast milk, or that EEGAI decides whether a person is medically eligible to donate?',
    criteria: {
      true: 'EEGAI is presented as doing any of those things itself.',
      false:
        'EEGAI is presented only as connecting people, or the text says EEGAI does not do these things, or the topic does not come up.',
    },
  },
  shows_donor_location: {
    type: 'noul',
    instructions:
      'Does `screen` show, or promise to show, the home address, exact location or coordinates of a person donating blood, hair or breast milk to a hospital or organisation?',
    criteria: {
      true: 'A health donor’s location or address is given, or promised, to a hospital or organisation.',
      false:
        'No health donor’s location is shared, or the text says it is never shared. Showing a hospital’s own address to a donor does not count.',
    },
  },
  contact_before_consent: {
    type: 'noul',
    instructions:
      'Does `screen` say or imply that a hospital or organisation receives a donor’s phone number or contact details before the donor has agreed — for example before saying they are available or sending an offer?',
    criteria: {
      true: 'Contact details reach the organisation without the donor first agreeing.',
      false:
        'Contact details are shared only after the donor agrees, or the topic does not come up.',
    },
  },
  money: {
    type: 'noul',
    instructions:
      'Does `screen` ask for payment, offer payment for a donation, or describe selling or buying donated items?',
    criteria: {
      true: 'Money changes hands for donations or the platform charges.',
      false: 'No payment or sale is involved, or the text says no money changes hands.',
    },
  },
} as const

export type Rule = keyof typeof RULES
export type Verdict = Record<Rule, number>

/**
 * At or above this, the screen fails. Set from the calibration in
 * judge.spec.ts, where deliberately bad text scored 0.80–0.97 and the real
 * disclosure — which names blood testing only to deny it — scored 0.02–0.05.
 * The controls re-check that gap on every run, so if the model or a question
 * drifts, the controls fail before a screen quietly passes.
 */
export const FAIL_AT = 0.5
/** Between this and FAIL_AT a screen passes, but is printed for a person to read. */
export const REVIEW_AT = 0.3

export const judgeAvailable = Boolean(process.env.TYPESAFE_AI_KEY)

export async function judge(screen: string): Promise<Verdict> {
  // Backoff on 429 and 529, as the API docs ask; anything else is a real
  // failure and should be reported as one rather than retried into silence.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.TYPESAFE_AI_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: 'jev-latest', state: { screen }, questions: RULES }),
    })

    if ((res.status === 429 || res.status === 529) && attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt))
      continue
    }
    if (!res.ok) {
      throw new Error(`TypeSafe answered ${res.status}: ${(await res.text()).slice(0, 200)}`)
    }

    const body = (await res.json()) as { answers: Record<string, { noul?: number }> }
    const verdict = {} as Verdict
    for (const rule of Object.keys(RULES) as Rule[]) {
      const value = body.answers[rule]?.noul
      // A missing answer is a broken response, not a pass.
      if (typeof value !== 'number') throw new Error(`No answer for ${rule}`)
      verdict[rule] = value
    }
    return verdict
  }
}
