import { z } from "zod";

export const scenarioIds = [
  "cancel-streamly",
  "book-flight",
  "move-appointment",
  "plan-family-event",
  "hire-contractor",
  "send-client-update",
  "summarize-meeting",
  "build-presentation",
  "update-spreadsheet",
  "research-vendor",
  "return-purchase",
  "dispute-charge",
  "compare-phone-plans",
  "negotiate-renewal",
  "shop-with-budget",
  "suspicious-email",
  "strange-attachment",
  "share-document",
  "app-permissions",
  "verify-agent-work",
] as const;

export const scenarioIdSchema = z.enum(scenarioIds);
export type ScenarioId = z.infer<typeof scenarioIdSchema>;
export type ScenarioCategory = "everyday" | "work" | "money" | "safety";

export type Scenario = {
  id: ScenarioId;
  title: string;
  category: ScenarioCategory;
  featured: boolean;
  glyph: string;
  minutes: number;
  summary: string;
  prompt: string;
  opening: string;
  steps: {
    share: {
      need: string;
      focused: string;
      manual: string;
      broad: string;
      privateThings: string;
    };
    check: {
      trusted: string;
      risky: string;
      clue: string;
    };
    approve: {
      yes: string;
      no: string;
      consequence: string;
      result: string;
    };
    prove: {
      strong: string;
      okay: string;
      reference: string;
      result: string;
    };
  };
  tools: {
    share: string;
    check: string;
    approve: string;
    prove: string;
  };
};

function scenario(value: Scenario) {
  return value;
}

export const scenarioCatalog: Scenario[] = [
  scenario({
    id: "cancel-streamly",
    title: "Cancel a subscription",
    category: "everyday",
    featured: true,
    glyph: "S",
    minutes: 4,
    summary: "Stop a free trial without handing AI your whole inbox.",
    prompt: "Cancel my Streamly trial before I get charged.",
    opening: "I can help. First I need the renewal email. You choose what I can see.",
    steps: {
      share: {
        need: "the Streamly renewal email",
        focused: "Only Streamly emails",
        manual: "I’ll paste the email",
        broad: "Everything in my inbox",
        privateThings: "payroll, health, and family emails",
      },
      check: {
        trusted: "account.streamly.example",
        risky: "streamly-cancel.example.net",
        clue: "The real account address matches the company that sent the bill.",
      },
      approve: {
        yes: "Yes, cancel it",
        no: "No, stop here",
        consequence: "Streamly Premium ends July 18. The $18.99 renewal will not happen.",
        result: "The trial is cancelled and access ends July 18.",
      },
      prove: {
        strong: "Confirmation email · ST-4821",
        okay: "The account page says Cancelled",
        reference: "ST-4821",
        result: "Streamly confirmed the cancellation and final service date.",
      },
    },
    tools: {
      share: "search_mail",
      check: "open_verified_link",
      approve: "cancel_subscription",
      prove: "check_confirmation",
    },
  }),
  scenario({
    id: "book-flight",
    title: "Book a flight",
    category: "everyday",
    featured: true,
    glyph: "↗",
    minutes: 5,
    summary: "Let AI shop for a trip without letting it overspend.",
    prompt: "Find me a flight to Denver next Friday for under $350.",
    opening: "I can compare flights. Tell me what trip details I may use first.",
    steps: {
      share: {
        need: "your trip dates and budget",
        focused: "Only this trip’s dates and budget",
        manual: "I’ll type the details here",
        broad: "My full calendar and purchase history",
        privateThings: "private appointments and unrelated purchases",
      },
      check: {
        trusted: "flyfrontier.example",
        risky: "denver-fares-now.example.net",
        clue: "The airline address matches the seller shown on the fare.",
      },
      approve: {
        yes: "Yes, buy the $312 ticket",
        no: "No, keep looking",
        consequence: "Charge $312 for the 9:10 AM flight. One carry-on is included.",
        result: "The Denver flight is booked for $312.",
      },
      prove: {
        strong: "Airline confirmation · FF-2084",
        okay: "The booking page says Complete",
        reference: "FF-2084",
        result: "The airline issued a confirmation and itinerary.",
      },
    },
    tools: {
      share: "read_trip_details",
      check: "open_airline",
      approve: "purchase_flight",
      prove: "check_itinerary",
    },
  }),
  scenario({
    id: "move-appointment",
    title: "Move an appointment",
    category: "everyday",
    featured: false,
    glyph: "19",
    minutes: 4,
    summary: "Reschedule one visit while keeping the rest of your calendar private.",
    prompt: "Move my dentist appointment to next week.",
    opening: "I can do that. I only need the appointment and the times you are free.",
    steps: {
      share: {
        need: "the dentist visit and your free times",
        focused: "Only the dentist visit and free times",
        manual: "I’ll tell you when I’m free",
        broad: "My entire calendar",
        privateThings: "every other personal and work event",
      },
      check: {
        trusted: "northside-dental.example",
        risky: "fast-reschedule.example.net",
        clue: "The office address matches the appointment reminder.",
      },
      approve: {
        yes: "Yes, move it to Tuesday at 2",
        no: "No, leave it alone",
        consequence: "Cancel Monday at 9 and reserve Tuesday at 2 with the same dentist.",
        result: "The appointment moved to Tuesday at 2 PM.",
      },
      prove: {
        strong: "New office confirmation · ND-771",
        okay: "My calendar shows Tuesday at 2",
        reference: "ND-771",
        result: "The dentist confirmed the new time.",
      },
    },
    tools: { share: "read_calendar", check: "open_provider", approve: "move_appointment", prove: "check_confirmation" },
  }),
  scenario({
    id: "plan-family-event",
    title: "Plan a family event",
    category: "everyday",
    featured: false,
    glyph: "✦",
    minutes: 5,
    summary: "Coordinate a dinner without sharing everyone’s private messages.",
    prompt: "Help me plan Mom’s birthday dinner for eight people.",
    opening: "Fun. I need the date, headcount, food needs, and budget—not every family chat.",
    steps: {
      share: {
        need: "the date, headcount, food needs, and budget",
        focused: "Only the event details",
        manual: "I’ll type the details",
        broad: "All of our family messages",
        privateThings: "photos, arguments, and unrelated family conversations",
      },
      check: {
        trusted: "table-eight.example",
        risky: "instant-party-deals.example.net",
        clue: "The restaurant address matches its verified listing.",
      },
      approve: {
        yes: "Yes, reserve the table",
        no: "No, show me another option",
        consequence: "Reserve Table Eight for eight people Saturday at 6:30 PM. $40 deposit.",
        result: "The birthday table is reserved.",
      },
      prove: {
        strong: "Restaurant confirmation · T8-640",
        okay: "The reservation page says Booked",
        reference: "T8-640",
        result: "The restaurant confirmed the table and deposit.",
      },
    },
    tools: { share: "read_event_details", check: "open_restaurant", approve: "book_table", prove: "check_booking" },
  }),
  scenario({
    id: "hire-contractor",
    title: "Find a contractor",
    category: "everyday",
    featured: false,
    glyph: "⌂",
    minutes: 5,
    summary: "Compare home-repair quotes without exposing more than needed.",
    prompt: "Find someone to fix the leak under my kitchen sink.",
    opening: "I can compare local plumbers. A photo and your ZIP code are enough to begin.",
    steps: {
      share: {
        need: "a photo of the leak and your ZIP code",
        focused: "Only the leak photo and ZIP code",
        manual: "I’ll describe the problem",
        broad: "All my home photos and exact location history",
        privateThings: "private home photos and past locations",
      },
      check: {
        trusted: "clearpipe.example",
        risky: "cheap-plumber-today.example.net",
        clue: "The licensed business address matches the estimate.",
      },
      approve: {
        yes: "Yes, request the $95 visit",
        no: "No, do not contact them",
        consequence: "Request a $95 diagnostic visit Tuesday between 1 and 3 PM.",
        result: "The diagnostic visit is requested.",
      },
      prove: {
        strong: "Contractor confirmation · CP-119",
        okay: "The request page says Sent",
        reference: "CP-119",
        result: "ClearPipe confirmed the visit window and price.",
      },
    },
    tools: { share: "read_job_details", check: "open_business", approve: "request_visit", prove: "check_request" },
  }),
  scenario({
    id: "send-client-update",
    title: "Send a client update",
    category: "work",
    featured: true,
    glyph: "@",
    minutes: 4,
    summary: "Draft and send a clear update without leaking internal notes.",
    prompt: "Tell Acme the launch is moving to August 4.",
    opening: "I can draft that. I need the approved update, not every internal conversation.",
    steps: {
      share: {
        need: "the approved timeline and client contact",
        focused: "Only the approved update and contact",
        manual: "I’ll paste the approved facts",
        broad: "All project messages and documents",
        privateThings: "internal debate, budgets, and employee comments",
      },
      check: {
        trusted: "sam@acme.example",
        risky: "sam.acme@client-mail.example.net",
        clue: "The saved client address matches the project contact.",
      },
      approve: {
        yes: "Yes, send this email",
        no: "No, keep it as a draft",
        consequence: "Send the approved August 4 launch update to Sam at Acme.",
        result: "The client update was sent.",
      },
      prove: {
        strong: "Sent message · MSG-804",
        okay: "The composer says Sent",
        reference: "MSG-804",
        result: "The mail service recorded the recipient and sent time.",
      },
    },
    tools: { share: "read_approved_notes", check: "check_recipient", approve: "send_email", prove: "check_sent_mail" },
  }),
  scenario({
    id: "summarize-meeting",
    title: "Summarize a meeting",
    category: "work",
    featured: false,
    glyph: "≡",
    minutes: 4,
    summary: "Turn one transcript into action items without scanning every file.",
    prompt: "Summarize today’s product meeting and list the action items.",
    opening: "Send me today’s transcript. I do not need access to your whole drive.",
    steps: {
      share: {
        need: "today’s product meeting transcript",
        focused: "Only today’s transcript",
        manual: "I’ll upload the transcript",
        broad: "My entire company drive",
        privateThings: "contracts, reviews, and unrelated team documents",
      },
      check: {
        trusted: "Product sync · July 18",
        risky: "Product sync · June 18",
        clue: "The date and attendees match today’s meeting.",
      },
      approve: {
        yes: "Yes, create the summary",
        no: "No, let me check the transcript",
        consequence: "Create a summary with decisions, owners, and due dates from this transcript only.",
        result: "The meeting summary is ready.",
      },
      prove: {
        strong: "Compare three action items to the transcript",
        okay: "The summary looks polished",
        reference: "3 matched items",
        result: "Each action item is supported by the transcript.",
      },
    },
    tools: { share: "read_transcript", check: "check_source", approve: "create_summary", prove: "verify_quotes" },
  }),
  scenario({
    id: "build-presentation",
    title: "Build a presentation",
    category: "work",
    featured: false,
    glyph: "▤",
    minutes: 5,
    summary: "Create slides from approved facts and catch invented claims.",
    prompt: "Make five slides for Friday’s leadership update.",
    opening: "I can build the deck from the approved metrics and project notes you choose.",
    steps: {
      share: {
        need: "approved metrics and project notes",
        focused: "Only the approved metrics and notes",
        manual: "I’ll paste the source material",
        broad: "Every leadership file",
        privateThings: "draft strategy, compensation, and board materials",
      },
      check: {
        trusted: "Leadership update · approved data",
        risky: "Leadership brainstorm · rough ideas",
        clue: "The approved source is labeled final and has an owner.",
      },
      approve: {
        yes: "Yes, build the five slides",
        no: "No, show me the outline first",
        consequence: "Create five slides using only the approved metrics and named sources.",
        result: "The five-slide update is ready.",
      },
      prove: {
        strong: "Check every number against its source",
        okay: "The slides look professional",
        reference: "8 of 8 facts matched",
        result: "Every number in the deck matches an approved source.",
      },
    },
    tools: { share: "read_sources", check: "check_approval", approve: "create_slides", prove: "verify_facts" },
  }),
  scenario({
    id: "update-spreadsheet",
    title: "Update a spreadsheet",
    category: "work",
    featured: false,
    glyph: "#",
    minutes: 4,
    summary: "Let AI edit the right cells—and nothing else.",
    prompt: "Add the July sales numbers to our forecast sheet.",
    opening: "I need the July numbers and permission to edit one table, not the whole workbook.",
    steps: {
      share: {
        need: "July sales data and the forecast table",
        focused: "Only July data and the forecast table",
        manual: "I’ll paste the numbers",
        broad: "The entire finance workbook",
        privateThings: "payroll, margins, and board forecasts",
      },
      check: {
        trusted: "FY26 Forecast · July actuals",
        risky: "FY25 Forecast · archive",
        clue: "The workbook year and table name match the request.",
      },
      approve: {
        yes: "Yes, update these 12 cells",
        no: "No, show me the changes first",
        consequence: "Write July actuals into 12 highlighted cells. Do not change formulas.",
        result: "Twelve July cells were updated.",
      },
      prove: {
        strong: "Review the 12-cell change list",
        okay: "The total looks reasonable",
        reference: "12 cells · 0 formulas",
        result: "The change list shows 12 values and no formula edits.",
      },
    },
    tools: { share: "read_table", check: "check_workbook", approve: "update_cells", prove: "review_changes" },
  }),
  scenario({
    id: "research-vendor",
    title: "Research a vendor",
    category: "work",
    featured: false,
    glyph: "?",
    minutes: 5,
    summary: "Compare options while separating facts from sales claims.",
    prompt: "Compare three payroll vendors for our 40-person company.",
    opening: "I can research that using your requirements and reliable public sources.",
    steps: {
      share: {
        need: "company size, needs, and budget range",
        focused: "Only our requirements and budget range",
        manual: "I’ll type the requirements",
        broad: "All employee and payroll records",
        privateThings: "employee pay, tax IDs, and bank information",
      },
      check: {
        trusted: "Vendor pricing and support pages",
        risky: "Anonymous best-payroll list",
        clue: "The vendor pages identify the source and date of each claim.",
      },
      approve: {
        yes: "Yes, create the comparison",
        no: "No, add better sources",
        consequence: "Compare price, support, integrations, and migration using cited sources.",
        result: "The three-vendor comparison is ready.",
      },
      prove: {
        strong: "Open each source beside the claim",
        okay: "The recommendation sounds confident",
        reference: "11 cited claims",
        result: "Every important fact has a source you can open and check.",
      },
    },
    tools: { share: "read_requirements", check: "check_sources", approve: "build_comparison", prove: "verify_citations" },
  }),
  scenario({
    id: "return-purchase",
    title: "Return a purchase",
    category: "money",
    featured: false,
    glyph: "↩",
    minutes: 4,
    summary: "Start a return without exposing your full shopping history.",
    prompt: "Return the blue headphones I bought last week.",
    opening: "I need that order and the reason for the return—not every purchase you made.",
    steps: {
      share: {
        need: "the headphone order and return reason",
        focused: "Only the headphone order",
        manual: "I’ll paste the receipt",
        broad: "My full order history",
        privateThings: "gifts, addresses, and unrelated purchases",
      },
      check: {
        trusted: "orders.northmart.example",
        risky: "northmart-refunds.example.net",
        clue: "The order address matches the store where you paid.",
      },
      approve: {
        yes: "Yes, start the return",
        no: "No, leave the order alone",
        consequence: "Return the blue headphones for a $79 refund to the original card.",
        result: "The $79 return is started.",
      },
      prove: {
        strong: "Return label and refund ID · NM-771",
        okay: "The order page says Return started",
        reference: "NM-771",
        result: "The store issued a label and refund ID.",
      },
    },
    tools: { share: "read_order", check: "open_store", approve: "start_return", prove: "check_refund" },
  }),
  scenario({
    id: "dispute-charge",
    title: "Dispute a charge",
    category: "money",
    featured: false,
    glyph: "$",
    minutes: 5,
    summary: "Challenge one charge without sharing your whole bank account.",
    prompt: "I don’t recognize this $64.20 charge from MetroCloud.",
    opening: "I can help check and dispute that one charge. Keep the rest of your account private.",
    steps: {
      share: {
        need: "the MetroCloud transaction",
        focused: "Only the MetroCloud charge",
        manual: "I’ll paste the transaction",
        broad: "My full bank history",
        privateThings: "income, rent, medical, and every other transaction",
      },
      check: {
        trusted: "secure.riverbank.example",
        risky: "riverbank-disputes.example.net",
        clue: "The secure address is inside your bank’s real domain.",
      },
      approve: {
        yes: "Yes, dispute $64.20",
        no: "No, do not file it",
        consequence: "File one fraud claim for $64.20. The card may be temporarily locked.",
        result: "The $64.20 dispute is filed.",
      },
      prove: {
        strong: "Bank case number · RB-9031",
        okay: "The page says Submitted",
        reference: "RB-9031",
        result: "The bank opened a case and recorded the amount.",
      },
    },
    tools: { share: "read_transaction", check: "open_bank", approve: "file_dispute", prove: "check_case" },
  }),
  scenario({
    id: "compare-phone-plans",
    title: "Compare phone plans",
    category: "money",
    featured: false,
    glyph: "▥",
    minutes: 5,
    summary: "Get a useful comparison without sharing your contacts or messages.",
    prompt: "Find a cheaper phone plan with enough data for my family.",
    opening: "I need usage totals, number of lines, and budget—not contacts or messages.",
    steps: {
      share: {
        need: "monthly data totals, number of lines, and budget",
        focused: "Only usage totals, lines, and budget",
        manual: "I’ll type the numbers",
        broad: "My phone backup and contacts",
        privateThings: "contacts, photos, calls, and private messages",
      },
      check: {
        trusted: "Plans from the carrier sites",
        risky: "Limited-time plan pop-up",
        clue: "Carrier pages show the full price after promotional periods.",
      },
      approve: {
        yes: "Yes, save this comparison",
        no: "No, check the hidden fees",
        consequence: "Save three plans with full monthly cost, taxes, and promotion end dates.",
        result: "The plan comparison is saved.",
      },
      prove: {
        strong: "Match each total to the carrier checkout",
        okay: "The cheapest plan is ranked first",
        reference: "3 checkout totals",
        result: "Each monthly total matches a carrier checkout page.",
      },
    },
    tools: { share: "read_usage", check: "check_pricing", approve: "save_comparison", prove: "verify_totals" },
  }),
  scenario({
    id: "negotiate-renewal",
    title: "Negotiate a renewal",
    category: "money",
    featured: false,
    glyph: "%",
    minutes: 5,
    summary: "Prepare a better rate without revealing your maximum budget.",
    prompt: "Ask my internet provider for a better renewal price.",
    opening: "I can draft the request using your current price and service history.",
    steps: {
      share: {
        need: "current price, plan, and service dates",
        focused: "Only my plan, price, and service dates",
        manual: "I’ll paste the latest bill",
        broad: "Every household bill and my maximum budget",
        privateThings: "other bills and the most you are willing to pay",
      },
      check: {
        trusted: "support.citynet.example",
        risky: "citynet-savings.example.net",
        clue: "The support address matches the provider on your bill.",
      },
      approve: {
        yes: "Yes, send the rate request",
        no: "No, keep it as a draft",
        consequence: "Ask CityNet to match its $55 new-customer rate. Do not accept a new contract.",
        result: "The rate request was sent without accepting terms.",
      },
      prove: {
        strong: "Provider reply with offer ID · CN-554",
        okay: "AI says the message was sent",
        reference: "CN-554",
        result: "CityNet replied with a written offer you can review.",
      },
    },
    tools: { share: "read_bill", check: "open_support", approve: "send_request", prove: "check_reply" },
  }),
  scenario({
    id: "shop-with-budget",
    title: "Shop with a budget",
    category: "money",
    featured: false,
    glyph: "◎",
    minutes: 4,
    summary: "Let AI compare products while keeping the final purchase yours.",
    prompt: "Find a good desk chair for under $250.",
    opening: "I can compare chairs using your budget and must-have features.",
    steps: {
      share: {
        need: "budget and chair preferences",
        focused: "Only my budget and chair preferences",
        manual: "I’ll type what I need",
        broad: "My full purchase history and credit profile",
        privateThings: "past purchases and financial information",
      },
      check: {
        trusted: "Product pages with clear sellers",
        risky: "Sponsored best-chair article",
        clue: "The real product page names the seller, return policy, and full price.",
      },
      approve: {
        yes: "Yes, add the $229 chair to cart",
        no: "No, do not add anything",
        consequence: "Add one ErgoSeat chair for $229. Do not place the order.",
        result: "The $229 chair is in the cart, not purchased.",
      },
      prove: {
        strong: "Cart shows one chair · $229 before tax",
        okay: "AI says it stayed under budget",
        reference: "$229 cart total",
        result: "The cart proves the item, quantity, and price.",
      },
    },
    tools: { share: "read_preferences", check: "check_seller", approve: "add_to_cart", prove: "check_cart" },
  }),
  scenario({
    id: "suspicious-email",
    title: "Check a suspicious email",
    category: "safety",
    featured: false,
    glyph: "!",
    minutes: 4,
    summary: "Check a scary message without clicking the trap inside it.",
    prompt: "Is this password-reset email real? It says my account closes today.",
    opening: "Do not click yet. Share the one message and we can check where it really goes.",
    steps: {
      share: {
        need: "the suspicious email",
        focused: "Only this one email",
        manual: "I’ll paste the email text",
        broad: "My entire inbox",
        privateThings: "every unrelated personal and work email",
      },
      check: {
        trusted: "security.openmail.example",
        risky: "openmail-password-help.example.net",
        clue: "The real security address stays inside the service’s domain.",
      },
      approve: {
        yes: "Yes, open the real security page",
        no: "No, close everything",
        consequence: "Open the known security page directly. Do not use the email button.",
        result: "The real security page opened without using the suspicious link.",
      },
      prove: {
        strong: "Security page says no reset is pending",
        okay: "The email logo looks official",
        reference: "No reset pending",
        result: "The account’s real security page shows no reset request.",
      },
    },
    tools: { share: "read_one_email", check: "inspect_link", approve: "open_security_page", prove: "check_account" },
  }),
  scenario({
    id: "strange-attachment",
    title: "Handle a strange attachment",
    category: "safety",
    featured: false,
    glyph: "+",
    minutes: 4,
    summary: "Check an unexpected file before anything opens or runs.",
    prompt: "A vendor sent me an unexpected invoice.zip. What should I do?",
    opening: "Keep it closed. We can check the sender and file details without running it.",
    steps: {
      share: {
        need: "the sender, subject, and file details",
        focused: "Only this email’s sender and file details",
        manual: "I’ll paste the file details",
        broad: "My whole mailbox and downloads folder",
        privateThings: "all mail and unrelated downloaded files",
      },
      check: {
        trusted: "Vendor contact already on file",
        risky: "Reply-to address in the message",
        clue: "A known contact method is safer than details supplied by the suspicious email.",
      },
      approve: {
        yes: "Yes, ask the known contact",
        no: "No, delete the message",
        consequence: "Ask the saved vendor contact whether they sent invoice.zip. Keep it closed.",
        result: "The known contact was asked and the file stayed closed.",
      },
      prove: {
        strong: "Vendor replies: We did not send it",
        okay: "The attachment scanner shows no warning",
        reference: "Sender denied it",
        result: "The real vendor confirmed the attachment was not theirs.",
      },
    },
    tools: { share: "read_file_details", check: "check_known_contact", approve: "send_verification", prove: "check_reply" },
  }),
  scenario({
    id: "share-document",
    title: "Share a document safely",
    category: "safety",
    featured: false,
    glyph: "□",
    minutes: 4,
    summary: "Send the right file to the right person with the right access.",
    prompt: "Share the project brief with our freelance designer.",
    opening: "I can share one brief. Let’s make sure the file and person are correct first.",
    steps: {
      share: {
        need: "the final project brief and designer’s contact",
        focused: "Only the final brief and designer contact",
        manual: "I’ll attach the final brief",
        broad: "The entire client folder",
        privateThings: "contracts, pricing, and internal client notes",
      },
      check: {
        trusted: "maya@northstar-design.example",
        risky: "maya.northstar@gmail.example.net",
        clue: "The saved contract contact matches the project record.",
      },
      approve: {
        yes: "Yes, share as View only",
        no: "No, do not share it",
        consequence: "Share Final Project Brief.pdf with Maya as View only. No folder access.",
        result: "One file was shared as View only.",
      },
      prove: {
        strong: "Access list shows Maya · Viewer · one file",
        okay: "AI says the share worked",
        reference: "1 viewer · 1 file",
        result: "The access list shows exactly one person and one file.",
      },
    },
    tools: { share: "read_one_file", check: "check_contact", approve: "share_file", prove: "check_access" },
  }),
  scenario({
    id: "app-permissions",
    title: "Review an app permission",
    category: "safety",
    featured: false,
    glyph: "⌁",
    minutes: 4,
    summary: "Decide whether a new app is asking for too much.",
    prompt: "This notes app wants my contacts, location, microphone, and photos.",
    opening: "Let’s compare what the app does with what it wants to access.",
    steps: {
      share: {
        need: "the permission request and app purpose",
        focused: "Only the permission request",
        manual: "I’ll list the permissions",
        broad: "Open every requested permission",
        privateThings: "contacts, location, recordings, and photos",
      },
      check: {
        trusted: "App Store privacy details",
        risky: "Developer’s marketing pop-up",
        clue: "The store page lists data use in a standard, reviewable place.",
      },
      approve: {
        yes: "Allow microphone only while recording",
        no: "Deny every permission",
        consequence: "Allow microphone only while making a voice note. Deny contacts, location, and photos.",
        result: "The app received one limited permission.",
      },
      prove: {
        strong: "Phone settings show one permission allowed",
        okay: "The app says privacy matters",
        reference: "1 allowed · 3 denied",
        result: "System settings show exactly which permission is active.",
      },
    },
    tools: { share: "read_permissions", check: "open_privacy_details", approve: "set_permissions", prove: "check_settings" },
  }),
  scenario({
    id: "verify-agent-work",
    title: "Check AI’s finished work",
    category: "safety",
    featured: false,
    glyph: "✓",
    minutes: 5,
    summary: "Learn what to check when AI confidently says it is done.",
    prompt: "AI says it updated all 28 customer records. Can I trust that?",
    opening: "AI saying ‘done’ is not proof. We need a result we can count and check.",
    steps: {
      share: {
        need: "the 28 target records and requested change",
        focused: "Only the 28 target records",
        manual: "I’ll provide the record IDs",
        broad: "The entire customer database",
        privateThings: "unrelated customers and sensitive account data",
      },
      check: {
        trusted: "The saved change request",
        risky: "AI’s memory of the instructions",
        clue: "The saved request is the source of truth for what should change.",
      },
      approve: {
        yes: "Yes, compare the changes",
        no: "No, roll them back first",
        consequence: "Compare the 28 changed records to the saved request. Do not make new edits.",
        result: "The changed records were compared without new edits.",
      },
      prove: {
        strong: "Change report: 27 correct · 1 missed",
        okay: "AI says all 28 were updated",
        reference: "27 correct · 1 missed",
        result: "The report found one record AI missed.",
      },
    },
    tools: { share: "read_target_records", check: "read_change_request", approve: "compare_changes", prove: "count_results" },
  }),
];

export const categoryLabels: Record<ScenarioCategory | "all", string> = {
  all: "All missions",
  everyday: "Everyday life",
  work: "Work",
  money: "Money",
  safety: "Safety",
};

export function getScenario(id: string): Scenario {
  const match = scenarioCatalog.find((item) => item.id === id);
  if (!match) throw new Error(`Unknown mission: ${id}`);
  return match;
}
