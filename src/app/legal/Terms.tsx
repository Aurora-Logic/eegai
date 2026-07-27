import { LegalPage, Outstanding, Section } from './Legal'

/**
 * The rules of using the service, written to match what the code enforces.
 *
 * The tone follows PLAN.md §8: active voice, sentence case, no throat-clearing.
 * A donor should be able to read this in two minutes and know exactly what they
 * are agreeing to — most of which is "be honest about the condition".
 */
export default function Terms() {
  return (
    <LegalPage title="Terms" updated="27 July 2026">
      <Section title="What this service is">
        <p>
          EEGAI (ஈகை) is a way to give household goods you no longer need to organisations in
          Coimbatore that can use them. It is operated by{' '}
          <Outstanding>legal entity name</Outstanding>.
        </p>
        <p>
          It is a place where a donor and an organisation find each other. The goods are given
          directly by you to that organisation — the service does not take ownership of anything,
          buy anything, or sell anything, and no money passes through it.
        </p>
      </Section>

      <Section title="What you agree to when you post something">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Answer the condition questions honestly. They are the only thing standing between an
            organisation and a pile of things it has to pay to throw away.
          </li>
          <li>Post only things you own and are entitled to give away.</li>
          <li>
            Have the item ready and accessible on the day it is collected. A volunteer cannot empty
            a cupboard for you.
          </li>
          <li>
            Do not post food, medicine, weapons, hazardous material, live animals, or anything whose
            sale or transfer is restricted by law.
          </li>
        </ul>
        <p>
          An organisation may refuse an item when it arrives. If it does, it must say why and send a
          photograph, and you will see both. A refusal is a record, not a penalty.
        </p>
      </Section>

      <Section title="If you are an organisation">
        <p>
          You must be a registered charitable organisation and must provide documents for
          verification before you can claim anything. Claim only what you can genuinely collect and
          use — an item claimed and abandoned is invisible to every other organisation while it sits
          there.
        </p>
        <p>
          Confirm receipt promptly, with a photograph. That photograph is shown to the donor and
          nobody else.
        </p>
      </Section>

      <Section title="If you are a volunteer">
        <p>
          You must be verified before you can collect anything. Collect only what has been assigned
          to you, take the item directly to the receiving organisation, and never ask anyone to type
          a handover code into your phone — codes are spoken aloud, which is the whole point of
          them.
        </p>
      </Section>

      <Section title="What we do not promise">
        <p>
          We do not guarantee that any item will be claimed, collected on a particular day, or
          collected at all. We do not inspect goods, and we are not responsible for their condition,
          safety or fitness for any purpose — that is between you and the organisation receiving
          them.
        </p>
        <p>
          Verification means documents were checked. It is not a guarantee of an organisation's
          conduct.
        </p>
      </Section>

      <Section title="Receipts and tax">
        <p>
          The record you can download after an item is confirmed is a record that goods were
          collected and received. It is not a tax receipt and does not by itself support a deduction
          under Section 80G. If the receiving organisation holds 80G registration, ask them directly
          for a receipt.
        </p>
      </Section>

      <Section title="Accounts">
        <p>
          You are responsible for what happens under your account. An account may be disabled if
          these terms are broken — repeatedly posting unusable goods, claiming items and not
          collecting them, or misusing another person&apos;s details. Disabling an account stops
          sign-in; it does not erase the record of items that already moved, because that record
          also belongs to the other party.
        </p>
      </Section>

      <Section title="Changes, and the law that applies">
        <p>
          These terms may change. Material changes will be shown in the app before they take effect.
        </p>
        <p>
          These terms are governed by the laws of India, and the courts at{' '}
          <Outstanding>jurisdiction</Outstanding> have exclusive jurisdiction. Questions and
          complaints go to <Outstanding>grievance email</Outstanding>.
        </p>
      </Section>
    </LegalPage>
  )
}
