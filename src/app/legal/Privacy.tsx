import { LegalPage, Outstanding, Section } from './Legal'

/**
 * What this software actually stores and who can read it.
 *
 * Written from the schema rather than from a template: every claim below is
 * something the migrations in db/ enforce, so it can be checked rather than
 * trusted. Where the answer depends on the operating entity rather than on the
 * code, it is marked outstanding instead of guessed.
 */
export default function Privacy() {
  return (
    <LegalPage title="Privacy" updated="27 July 2026">
      <Section title="Who this is about">
        <p>
          EEGAI (ஈகை) connects people in Coimbatore who have household goods to give with
          organisations that can use them. This page describes what the service stores about you,
          who can see it, and how long it is kept.
        </p>
        <p>
          The service is operated by <Outstanding>legal entity name</Outstanding>, registered at{' '}
          <Outstanding>registered address</Outstanding>. For the purposes of the Digital Personal
          Data Protection Act, 2023, that entity is the Data Fiduciary.
        </p>
      </Section>

      <Section title="What is collected">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong className="font-medium">Your phone number and a password.</strong> The number is
            how you sign in. The password is stored only as a scrypt hash — it is never stored in a
            form anyone here can read, including us.
          </li>
          <li>
            <strong className="font-medium">Your name, and your area or pincode.</strong> The area
            is used to show your item to organisations near you and nothing else.
          </li>
          <li>
            <strong className="font-medium">Photographs of the items you post,</strong> and the
            answers you give about their condition.
          </li>
          <li>
            <strong className="font-medium">A record of what happened to each item</strong> — when
            it was posted, claimed, collected and confirmed, and by whom.
          </li>
          <li>
            If you register as a volunteer, an identity document and a photograph, used only to
            verify you and visible only to administrators.
          </li>
        </ul>
        <p>
          No payment details are collected. There is no payment gateway, and money never changes
          hands through this service.
        </p>
      </Section>

      <Section title="Who can see it">
        <p>
          Access is enforced by the database itself, not only by the application. Each of these is a
          rule the database applies to every query:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>An organisation sees items posted near it, in the categories it accepts.</li>
          <li>
            Once an organisation claims your item, it can see the pickup address and a contact
            number, because someone has to come and collect it.
          </li>
          <li>
            A volunteer sees only the collections assigned to them, or unassigned ones inside the
            area they cover.
          </li>
          <li>
            The photograph an organisation sends when your item arrives is visible to you alone.
          </li>
          <li>
            Handover codes are stored hashed. Nobody — including the volunteer collecting your item
            — can read a code that belongs to someone else.
          </li>
        </ul>
      </Section>

      <Section title="How long it is kept">
        <p>
          The record of an item's journey is kept as long as the service operates, because it is
          what settles a dispute about whether something arrived. Photographs and personal details
          are kept for <Outstanding>retention period</Outstanding> after an item completes.
        </p>
        <p>
          Deleting your account disables sign-in and hides your details from other users. The record
          that an item moved is not erased, because it also belongs to the organisation that
          received it.
        </p>
      </Section>

      <Section title="What you can ask for">
        <p>
          Under the DPDP Act you may ask for a copy of your data, ask for it to be corrected, ask
          for it to be erased where it is no longer needed, and nominate someone to act for you.
        </p>
        <p>
          Write to <Outstanding>grievance officer name</Outstanding> at{' '}
          <Outstanding>grievance email</Outstanding>. The Act requires a response within a
          reasonable period; we aim for <Outstanding>response time commitment</Outstanding>.
        </p>
      </Section>

      <Section title="Where it is stored, and who else touches it">
        <p>
          Data is stored on servers in <Outstanding>hosting region</Outstanding>. Photographs are
          held on <Outstanding>storage provider</Outstanding>.
        </p>
        <p>
          When a courier is used, the collection and delivery addresses and a contact number are
          sent to that courier so the parcel can be moved. Nothing else is shared. No data is sold,
          and there is no advertising on this service.
        </p>
      </Section>

      <Section title="Children">
        <p>
          The service is not intended for anyone under 18, and accounts should not be created by
          them. If you believe a child has registered, write to the address above and the account
          will be removed.
        </p>
      </Section>
    </LegalPage>
  )
}
