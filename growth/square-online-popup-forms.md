# Square Online Pop-Up Forms

Use Square Online contact forms so each submission creates a Square Messages notification, sends an owner email, adds a new customer to Customer Directory, and remains exportable from Square Form Submissions.

## Before Publishing

In Square Dashboard, open **Messages > Settings** and enable both **Email** and **Push notifications**.

Create both forms under **Websites > Website > Edit site**. Use hidden pages that are not included in the Square site's main navigation.

For each page, add a **Forms** section, customize the questions, set the notification email, enable Google CAPTCHA, and publish.

## Resident Form

Page name: `Resident Clean Car Day Request`

Form name: `Sneaky Clean Resident Pop-Up Request`

Headline: `Request Sneaky Clean at Your Community`

Intro:

> Sneaky Clean brings a fast exterior wash, interior blow-out and vacuum directly to your apartment community for $60 per vehicle. Submit your vehicle to join your property's interest list. Once at least two residents are ready, we'll coordinate a service window with the property team.

Questions, in order:

1. Resident name - required
2. Mobile phone - required
3. Email address - required
4. Apartment community - required
5. Building or unit number - required
6. Vehicle year - required
7. Vehicle make - required
8. Vehicle model - required
9. Vehicle color - required
10. Preferred availability - required
11. Service selection - required; `$60 Express Wash + Vacuum`
12. Upgrade interest - required; `Glass ceramic`, `Ceramic wax`, `Interior spray and wipe`, `None`
13. Vehicle-condition notes - optional
14. SMS consent - required; `Yes, Sneaky Clean may text me regarding this community event.`

Preferred availability choices:

- Weekday morning
- Weekday afternoon
- Weekday evening
- Saturday morning
- Saturday afternoon

Service note:

> Includes a quick exterior wash, wheels and tires, quick interior blow-out and vacuum. This is maintenance care, not a full detail.

Confirmation:

> You're on the list. Once at least two vehicles from your community are ready, we'll coordinate a service window with your property team and send you the details. No payment is due until service is confirmed.

## Property-Manager Form

Page name: `Host a Sneaky Clean Pop-Up`

Form name: `Sneaky Clean Property Manager Inquiry`

Headline: `Host a Sneaky Clean Pop-Up`

Intro:

> Give your residents a new luxury amenity without adding work for your team. Sneaky Clean brings the water, power, equipment and crew. There is no hosting fee or ongoing commitment.

Questions, in order:

1. Community name - required
2. Manager name - required
3. Email - required
4. Mobile phone - required
5. Property address - required
6. Estimated interested vehicles - required
7. Preferred dates - required
8. Preferred time window - required
9. Designated setup or parking area - required
10. Access or property notes - optional
11. Site permission - required; `I confirm the property permits mobile vehicle cleaning in the designated on-site area.`

Confirmation:

> Your property inquiry is in our hands. We'll review your preferred dates and setup details, then contact you to coordinate the event.

## After Publishing

Copy both public Square page URLs. Update the GitHub pages only after both URLs work in a private browser window.

Submissions are available under **Websites > Form Submissions**, and conversations appear under **Square Messages**. Export submissions to CSV when a community-count audit is needed.
