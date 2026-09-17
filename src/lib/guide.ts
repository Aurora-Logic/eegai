import type { LucideIcon } from 'lucide-react'
import {
  Baby,
  Bell,
  CheckCheck,
  Droplet,
  HeartHandshake,
  KeyRound,
  PackageCheck,
  Scissors,
  ShieldCheck,
  Truck,
  Upload,
} from 'lucide-react'
import type { Role } from '@/lib/state-machine'

/**
 * The manual, as data.
 *
 * Its own module because two things render it: the /guide page and the
 * first-run tour. One source of truth — two copies of an explanation drift, and
 * the one nobody re-reads is the one that goes stale.
 *
 * Written per role, because "how does this work" genuinely has four different
 * answers and a combined page would be mostly irrelevant to whoever is reading.
 */
export interface GuideStep {
  icon: LucideIcon
  title: string
  body: string
}

export const GUIDE: Record<Role, GuideStep[]> = {
  donor: [
    // The spec's order: Blood, Hair, Breast Milk, then Material.
    {
      icon: Droplet,
      title: 'Blood: register once',
      body: 'Give your blood type (required), age, gender, last donation date and whether you are available. Your name, phone and area come from your account.',
    },
    {
      icon: Bell,
      title: 'Blood: answer the alert',
      body: 'When a verified hospital posts a blood alert, every registered blood donor is told — group, units, hospital, location and urgency. Tap Available to donate or Not available.',
    },
    {
      icon: HeartHandshake,
      title: 'The hospital rings you',
      body: 'Only if you said Available. You get its address and number under Where to go. The hospital decides whether you can donate, in person — this app never does.',
    },
    {
      icon: Scissors,
      title: 'Hair: fill the form, pick a partner',
      body: 'Length in inches, clean and dry, tied or braided, natural or treated, and a photo if you like. The partner organisation you choose checks it and tells you what to do next.',
    },
    {
      icon: Baby,
      title: 'Breast milk: confirm, then screening',
      body: 'Tick all seven eligibility points and choose a Lactation Management Centre. The centre screens you and the donation happens there.',
    },
    {
      icon: Upload,
      title: 'Material: photograph what you are giving',
      body: 'Up to five photos, from your phone. Daylight if you can — an organisation decides from these.',
    },
    {
      icon: CheckCheck,
      title: 'Answer the condition questions honestly',
      body: 'They are the only thing standing between an organisation and a pile it has to pay to throw away. A "no" stops the post, and says why.',
    },
    {
      icon: Truck,
      title: 'Choose how it travels',
      body: 'A delivery partner comes to your door, or a courier collects. You pick once an organisation has accepted it.',
    },
    {
      icon: KeyRound,
      title: 'Read your code out at the door',
      body: 'A 4-digit code appears on your items screen. Say it aloud to the delivery partner. Never type it into anyone else’s phone.',
    },
    {
      icon: PackageCheck,
      title: 'See where it got to',
      body: 'When it arrives, the organisation sends a photo and a note — visible to you alone. You can download a record of the donation.',
    },
  ],
  ngo: [
    {
      icon: Droplet,
      title: 'Hospitals: post a blood alert',
      body: 'Once an administrator approves blood for you, post the group, units required and urgency. Every registered blood donor with alerts on is told — you see how many, never who.',
    },
    {
      icon: HeartHandshake,
      title: 'Ring the donors who are available',
      body: 'Each one who taps Available appears with name, phone, age, gender, group and last donation date. Where they live is not something this app will ever show you.',
    },
    {
      icon: Scissors,
      title: 'Partners: decide hair and milk offers',
      body: 'Donors choose you and send their answers. Mark an offer as being checked, accept it, or decline with a reason the donor sees — then mark it received.',
    },
    {
      icon: ShieldCheck,
      title: 'Get verified first',
      body: 'Upload your registration papers. You cannot claim anything until an administrator has checked them.',
    },
    {
      icon: CheckCheck,
      title: 'The wall shows what is near you',
      body: 'Only items in the categories you accept, inside your radius. Open one to see every photo and what the donor confirmed.',
    },
    {
      icon: PackageCheck,
      title: 'Claim what you can actually collect',
      body: 'First claim wins. An item claimed and left sitting is invisible to every other organisation until it expires.',
    },
    {
      icon: KeyRound,
      title: 'Read your code out on delivery',
      body: 'The delivery partner asks for it. That is what proves the handover happened.',
    },
    {
      icon: Upload,
      title: 'Confirm what arrived, with a photo',
      body: 'Or send it back with a reason and a photo. The donor sees either. This is the part they remember.',
    },
  ],
  volunteer: [
    {
      icon: ShieldCheck,
      title: 'Get verified first',
      body: 'An administrator checks your ID. Until then you will not see any collections.',
    },
    {
      icon: Truck,
      title: 'Take a collection near you',
      body: 'You only see items inside the radius you set. Pick a day and a morning or evening slot.',
    },
    {
      icon: KeyRound,
      title: 'Ask the donor for their code',
      body: 'They read out 4 digits. Type what you hear. Six wrong tries and the code is cancelled and reissued.',
    },
    {
      icon: PackageCheck,
      title: 'Ask the organisation for theirs',
      body: 'Same again at the other end. You never see either code yourself — that is what makes them proof you were there.',
    },
  ],
  admin: [
    {
      icon: ShieldCheck,
      title: 'Verify organisations, hospitals and delivery partners',
      body: 'Read their papers, then approve or reject with a reason. The reason goes into the trail and is shown to them.',
    },
    {
      icon: CheckCheck,
      title: 'Every item has a full trail',
      body: 'Open any item to see everything that happened to it, who did it, and the request id behind each change.',
    },
    {
      icon: Upload,
      title: 'Act for people who are not online',
      body: 'Create accounts, post an item on a donor’s behalf, reset a password, and take an item off the wall.',
    },
  ],
}
