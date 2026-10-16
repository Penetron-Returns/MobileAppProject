# Clovie Privacy Policy

> **DRAFT FOR LEGAL REVIEW. Not yet approved. Do not publish until a South African lawyer has checked it.** Items in [square brackets] are placeholders or facts still to be confirmed.

**Last updated:** [16 October 2026]

This policy explains how Clovie handles personal information. Clovie is a booking app for salons and barbershops. It is written to meet the Protection of Personal Information Act 4 of 2013 (POPIA) in South Africa and the main principles of the EU General Data Protection Regulation (GDPR).

## 1. Who we are

Clovie is provided by **Nerova AI Inc.** ("Nerova", "we", "us"), the responsible party (the controller) for the personal information of people who use the Clovie app: salon owners and staff.

- Registered office: [Nerova AI Inc. registered address]
- Website: https://getclovie.app
- Support: support@nerovasystems.com
- **Information Officer:** [Name, to be registered with the Information Regulator], [email, for example privacy@nerovasystems.com]

Two roles matter here:

- For **owners and staff** who use the app, Nerova is the responsible party.
- For the **customers of a salon** (the people who book through WhatsApp or the web), the salon is the responsible party. It decides why it keeps its clients' details. Nerova acts as the salon's **operator** (processor) and handles that information only on the salon's instructions, to run the booking service. If you are a salon's customer and want to use your rights, you can ask the salon or write to us and we will pass your request on to the salon or act on its instruction.

## 2. What information we collect

### From owners and staff

- **Account details:** name, email address, sign-in method (email and password, or your Google account), role (owner or staff), profile picture link where one exists. Sign-in is handled by our provider Clerk.
- **Business details you enter:** business name, address, phone, email, logo link, time zone, opening hours, public holidays, services and prices, booking rules, staff members (name, title, phone, email, colour, working hours, breaks, time off).
- **Team invitations:** the email address you invite and the role you give.
- **Device information for notifications:** a push notification token and platform, so we can send booking, approval and "Did they make it?" notifications. A scoped device credential (stored only as a hash on our servers) lets the app answer notifications and use voice while the app is closed.
- **Your actions:** an audit trail of changes to bookings, settings and team, with who did it and when, to keep the schedule safe and accountable.
- **Companion conversations and voice commands:** the text you type or say to Clovie, and the answers you receive.

### From your customers (entered by you, or created when they book)

- **Client details:** phone number (also their WhatsApp identity), name, email if provided, notes and tags you add, whether they are blocked, WhatsApp opt-in, when we first and last saw them.
- **Bookings:** service, time, staff member, price, status, notes, check-in and attendance outcome, and a history of what happened to the booking.
- **WhatsApp messages:** the messages exchanged with the business through WhatsApp, including menu choices, delivery status and any time the conversation was passed to staff.
- **Booking research data:** for the web booking page and WhatsApp flow, we record the number of steps and how long a booking took, with a session key. Names and phone numbers are not part of these timing records. (This supports a research project on how easy booking is.)

We do **not** knowingly collect special personal information (such as health, religion or biometric data), and we ask owners not to put it in notes. We do not collect your location, contacts, calendar or photos from your phone. We do not use advertising identifiers.

## 3. Voice and audio

Clovie can be used by voice. We handle audio as follows:

- **Nothing is recorded in the background by default.** Hands-free "Hey Clovie" listening is **off** until you switch it on. You choose when it runs: only during opening hours, only while charging, or both. While it is listening, Android shows a notification with Pause and Stop buttons.
- **Wake word.** The "Hey Clovie" detection runs on your phone. Audio is kept in a short memory buffer and is not saved or sent anywhere unless the wake word is heard.
- **One command.** After you tap the Clovie tile, widget or shortcut, or say the wake word, Clovie records one short command (a few seconds).
- **Turning speech into text.** The clip is sent over an encrypted connection to our server and on to Nerova's speech-to-text service, which uses Microsoft Azure, and is returned as text. **The audio is not stored, and we do not keep the transcript beyond handling your request.** [Confirm with Nerova and Azure that audio is not retained or used to train models.] On some phones the phone's own speech service may transcribe on the device or through Google's speech service, depending on its settings.
- **Spoken replies** are produced by the phone's own text-to-speech, on the device.
- Voice features are optional. You can turn them off in Settings at any time, and you can use the app without ever using the microphone.

## 4. Why we use information

- To run the app and the booking service: show the calendar, show only genuinely free times, prevent double bookings, and keep one authoritative schedule.
- To send confirmations, reminders and replies to customers over WhatsApp, and to notify you.
- To let the Clovie companion answer questions and prepare bookings, moves and cancellations. It asks for your approval before it changes a booking.
- To keep the service secure, prevent abuse and keep an audit trail.
- To give you support and to tell you about important changes to the service.
- To measure and improve how easy booking is (the research data above), in a way that does not identify customers.

Our lawful grounds (POPIA, and GDPR where it applies) are: the contract with the salon, the legitimate interests of the salon and of us in running a secure booking service, consent where we ask for it (for example the microphone), and legal obligations. We do **not** sell personal information, use it for advertising, or make automated decisions with legal effects about people.

## 5. Who we share it with (our service providers)

We use trusted providers to run Clovie. They act on our instructions and are not allowed to use the information for their own purposes.

| Provider | What it does | Information involved |
| --- | --- | --- |
| **Clerk** | sign-in, organisations and team membership | sign-in email, name, Google account identifier, sessions, role |
| **Supabase** | database, API hosting and file storage (EU, Ireland) | all the information described above |
| **Nerova AI** | the Clovie companion, speech-to-text, and WhatsApp for paid plans | companion conversations, bookings the companion reads and changes, voice clips, WhatsApp messages |
| **Microsoft Azure** (through Nerova) | speech-to-text | the voice clip, while it is turned into text |
| **Meta (WhatsApp Cloud API)** | delivers WhatsApp messages between a salon and its customers | customer phone numbers and message content |
| **Expo push service, Google and Apple notification services** | deliver notifications to your phone | push token and the notification text |
| **Google Play** | distributes the Android app and its crash statistics | app install and diagnostic information under Google's own policy |

We may also disclose information if the law requires it, to protect rights and safety, or in a merger or sale of the business (with notice to you). Within a salon, owners and staff see the salon's client and booking information according to their role.

## 6. Where information is kept, and transfers across borders

Our database and files are hosted by Supabase in the **EU (Ireland)**. [Confirm the production region.] Some of our providers (for example Clerk, Meta, Microsoft, Google and Expo) may process information in other countries, including the United States. Nerova AI Inc. is a US company. When information leaves South Africa, we rely on POPIA section 72: the recipient is bound by law, a binding agreement or corporate rules giving a similar level of protection, or you have consented, or the transfer is needed to perform the contract. For the EU, we use the safeguards in each provider's data processing terms (such as standard contractual clauses).

## 7. How long we keep information

- **Account and business data:** while the business account is active. When the account is deleted, the business and all its information are deleted from our systems straight away, and from backups within [30 days].
- **Appointments and client records:** kept for as long as the salon keeps its account, because the salon needs its history. The salon can edit or delete a client or booking.
- **WhatsApp message content:** kept with the conversation for as long as the salon keeps its account.
- **Technical records:** raw webhook records are removed after 30 days once processed; request keys expire after 7 days; temporary booking-session records are marked abandoned and cleaned up. [Confirm the retention of logs held by Supabase.]
- **Voice clips:** not stored. **Voice device credentials:** replaced when you sign in again and revoked when you sign out.
- **Companion conversations at Nerova:** [state the retention period after confirming with Nerova].
- We may keep information longer only where the law requires it.

## 8. Your rights

Under POPIA, and the GDPR where it applies, you can:

- ask whether we hold information about you and **access** it;
- ask us to **correct** or update it;
- ask us to **delete** it, or restrict how we use it;
- **object** to our use of it, and withdraw consent you gave (without affecting what was done before);
- ask for a copy in a usable format (**portability**, GDPR);
- complain (section 10).

**To delete your account:** in the app go to Settings and choose Delete account [to be added before release], or visit https://getclovie.app/delete-account, or email support@nerovasystems.com from the address you signed up with. We act on requests within 30 days. We may ask you to confirm who you are first.

If you are a salon's customer, ask the salon first; we will also act on a request sent to us and tell the salon where needed.

## 9. Children

Clovie is for business owners and staff aged **18 and over**. It is not directed at children and we do not knowingly collect information from children as app users. A salon's records may include a customer who is under 18; the salon is responsible for having the consent that POPIA requires from a parent or guardian before it records a child's details, and we will delete such records on the salon's or a guardian's request.

## 10. Complaints

Please write to us first at support@nerovasystems.com or to our Information Officer, and we will try to put things right. You also have the right to complain to the **Information Regulator (South Africa)**:

- Website: https://inforegulator.org.za
- Email: complaints.IR@inforegulator.org.za [verify before publishing]
- Post: JD House, 27 Stiemens Street, Braamfontein, Johannesburg, 2001 [verify]

If the GDPR applies to you, you may also complain to your local EU data protection authority.

## 11. Security

We use encryption in transit (HTTPS) for all traffic between the app, our servers and our providers. WhatsApp access tokens are encrypted before they are stored. The device voice credential is kept in the phone's secure storage and only a hash of it is kept on our servers. Access to each business's data is restricted to that business's team at the database level. Webhooks from Meta, Clerk and Nerova are verified by signature, and personal information such as phone numbers, names and message text is kept out of our logs. Data at rest is encrypted by our hosting provider [confirm]. No system is perfectly secure. If there is a breach that affects you, we will tell you and the Information Regulator as the law requires.

## 12. Cookies and similar technologies

The app does not use advertising or analytics trackers. The public booking page and website may use only the cookies needed to work. [Confirm after the website is built.]

## 13. Changes to this policy

We may update this policy. We will post the new version at https://getclovie.app/privacy with a new "last updated" date, and tell app users of important changes in the app or by email.

## 14. Contact

Nerova AI Inc.
Support: support@nerovasystems.com
Information Officer: [name and email]
Website: https://getclovie.app
