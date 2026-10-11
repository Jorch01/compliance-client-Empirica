/**
 * The "What goes here?" guides in English (D79): the same guides as
 * guides-es.ts, part for part (the `GuideTexts` type checks the shape and
 * guides.test.ts the links). Fictitious examples, with no legal grounds,
 * terms or dates: a lawyer decides those case by case.
 */
import type { GuideTexts } from './guides.ts';

export const guidesEn: GuideTexts = {
  ui: {
    button: 'What goes here?',
    dialogTitle: '{{section}}: what goes here',
    purpose: 'What it is for',
    goes: { firm: 'What gets recorded here', client: 'What you can do here' },
    fields: 'What to write in each field',
    example: 'Example',
    notHere: 'Not this? Then it goes in another section',
    goesIn: 'goes in {{section}}',
    back: 'Back to {{section}}',
    goTo: 'Go to {{section}}',
    close: 'Got it',
    whereTitle: { firm: 'Where do I record each thing?', client: 'Where do I find each thing?' },
    whereIntro: {
      firm: 'Pick the situation closest to yours: you will see which section it belongs in, what to write and an example.',
      client:
        'Pick the situation closest to yours: you will see which section it belongs in, what is there and an example.',
    },
    mapTitle: 'How it all connects',
    allTitle: 'The guide to each section',
  },
  firm: {
    requests: {
      title: 'Requests',
      purpose:
        'What the client asks the firm for. Here it is received, classified against the retainer and, if taken on, turned into a matter.',
      goes: [
        'Any new ask from the client, even if it came by email or phone: record it so there is a trail.',
        'Anything you do not yet know is covered by the retainer or needs a quote.',
      ],
      fields: [
        {
          name: 'What do you need?',
          tip: 'The ask in one line, as the client would say it. E.g. "Review the contract with the new supplier".',
        },
        {
          name: 'Details',
          tip: 'The context, the dates the client mentioned and the documents they have.',
        },
        { name: 'Urgency and area', tip: 'They help decide who takes it and when.' },
        {
          name: 'Classify',
          tip: 'Within the retainer, outside it (quoted), accepted or rejected. The client sees each change.',
        },
        {
          name: 'Turn into a matter',
          tip: 'Once accepted: opens the matter with these details and links the two.',
        },
      ],
      example: [
        'The client asks: "We need to review the contract with the new logistics supplier".',
        'You classify it: Within the retainer.',
        'You turn it into a matter and add the tasks there.',
      ],
      notHere: [
        { text: 'It was accepted and there is work to organize', to: 'matters' },
        { text: 'It is a meeting or a call the client asked for', to: 'agenda' },
      ],
    },
    matters: {
      title: 'Matters',
      purpose:
        'A matter is a whole engagement for the client, with a goal and someone in charge. It holds everything else: its tasks, filings, documents and the conversation.',
      goes: [
        'A project with a start and an end: an incorporation, a negotiation, an audit, a defense.',
        'Something split into several steps (the tasks) whose progress the client wants to see.',
        'What comes from a request: turning it into a matter opens it here.',
      ],
      fields: [
        {
          name: 'Title',
          tip: 'The engagement in a few words, as the client would say it. E.g. "Incorporation of the subsidiary".',
        },
        { name: 'Area', tip: 'The one that fits best; used to filter and in the monthly report.' },
        { name: 'Responsible', tip: 'Who answers to the client for the matter.' },
        { name: 'Priority', tip: "How urgent it is next to the client's other matters." },
        {
          name: 'Target date',
          tip: 'When you expect to finish. It is not a legal deadline: those go in a task with a hard deadline, or in the filing.',
        },
        { name: 'Within the retainer', tip: 'Untick it if the engagement is quoted separately.' },
        {
          name: 'Who sees it',
          tip: "Shared if the client should follow it; internal if it is the firm's own work. An internal matter also hides its tasks, comments and documents.",
        },
      ],
      example: [
        'Title: "Review of supplier contracts" · Area: Contracts · Priority: Medium · Shared.',
        'Its tasks: "Send the current contracts" (the client\'s), "Review the penalty clauses" and "Deliver the report" (the firm\'s).',
      ],
      notHere: [
        { text: 'It is a single action with a date, like "send the draft on Friday"', to: 'tasks' },
        {
          text: 'It is a process before an authority, with a file number and stages',
          to: 'filings',
        },
        { text: 'It repeats every month or every year, like a tax return', to: 'compliance' },
        { text: 'It is a signed contract whose term needs watching', to: 'contracts' },
      ],
    },
    tasks: {
      title: 'Tasks',
      purpose:
        'A task is one concrete action, with who must do it and ideally a due date. Tasks are the step by step of a matter.',
      goes: [
        'Something a person can do and mark as done: draft, review, send, gather, sign.',
        'What the client must deliver or do: with "Whose turn: the client" it shows up in their to-dos.',
        'A legal deadline that cannot be extended: mark it as a hard deadline.',
      ],
      fields: [
        {
          name: 'Title',
          tip: 'Start with a verb and say what gets delivered. E.g. "Send the draft minutes", "Sign the powers of attorney".',
        },
        {
          name: 'Matter',
          tip: 'The engagement it belongs to. Leave it without one only if it truly belongs to none.',
        },
        {
          name: 'Whose turn',
          tip: 'Who takes the next step: the firm, the client or both. If the client, they see it in "Your to-dos".',
        },
        {
          name: 'Deadline',
          tip: 'When it must be ready. If it is a legal deadline, also tick "Hard deadline".',
        },
        { name: 'Depends on', tip: 'Another task that must be finished first.' },
        {
          name: 'Checklist',
          tip: 'The small points inside the task; the client can tick them off.',
        },
        {
          name: 'Status',
          tip: '"Waiting on the client" when it is their turn; "In review" when someone delivered it and it needs checking.',
        },
      ],
      example: [
        'Title: "Gather the shareholders\' IDs".',
        'Matter: Incorporation of the subsidiary · Whose turn: the client · Deadline: the one you agreed.',
        'Checklist: one point per shareholder.',
      ],
      notHere: [
        { text: 'It has several steps and a goal of its own', to: 'matters' },
        {
          text: 'It is a whole process before an authority, with a file number and stages',
          to: 'filings',
        },
        { text: 'It is a meeting, an appointment or a hearing', to: 'agenda' },
        { text: 'It comes back every period', to: 'compliance' },
      ],
    },
    filings: {
      title: 'Filings',
      purpose:
        'A filing is a process before an authority that moves through stages: it is prepared, submitted and the authority answers. Here you see its stage, since when and the next date.',
      goes: [
        'Registrations, applications, notices or permits submitted to an authority, with a file or folio number.',
        'Anything with stages the client wants to follow: in preparation, submitted, request from the authority, resolved.',
      ],
      fields: [
        {
          name: 'Title',
          tip: 'What is being filed, in a few words. E.g. "Registration of the trademark".',
        },
        {
          name: 'Template',
          tip: 'Brings the authority and the stages of that kind of filing; the firm defines the templates.',
        },
        { name: 'Authority', tip: 'Who it is filed with, by name or acronym.' },
        {
          name: 'Matter',
          tip: 'The engagement it is part of, so its documents and conversation stay together.',
        },
        {
          name: 'File or case number',
          tip: 'The number the authority gives on submission; it is how the filing is found.',
        },
        {
          name: 'Next step and deadline',
          tip: 'What comes next and the time to answer it, if any. Dates come from the file: never assumed.',
        },
        {
          name: 'Status',
          tip: '"Request from the authority" when it asked for something and an answer is due.',
        },
      ],
      example: [
        'Title: "Registration of the trademark" · Authority: IMPI · Matter: Trademark protection.',
        'Folio: the one on the filing receipt.',
        'Each change of stage records its day.',
      ],
      notHere: [
        {
          text: 'It is what must be done to prepare it, like drafting or gathering signatures',
          to: 'tasks',
        },
        {
          text: 'It is a recurring obligation, like a tax return or a yearly notice',
          to: 'compliance',
        },
        { text: 'It is the whole engagement, which includes more than this filing', to: 'matters' },
      ],
    },
    compliance: {
      title: 'Compliance',
      purpose:
        'The calendar of recurring obligations: what the company must do every month or every year and the evidence that it did. The matrix shows how much was met.',
      goes: [
        'Recurring obligations: tax returns, notices, renewals, corporate books, annual meetings.',
        'Each period closes with its evidence (the receipt, the minutes), which the firm validates.',
      ],
      fields: [
        {
          name: 'From the catalog',
          tip: "Start from a model in the firm's catalog: it brings the name, category and recurrence.",
        },
        {
          name: 'Name',
          tip: 'The obligation as the client knows it. E.g. "Monthly tax return".',
        },
        {
          name: 'Legal basis',
          tip: 'The rule that imposes it. A lawyer writes it: the portal never suggests legal grounds.',
        },
        { name: 'Repeats', tip: 'How often it comes back: monthly or yearly, and on which day.' },
        {
          name: 'Whose turn',
          tip: 'Who fulfils it. If the client, they upload the evidence and the firm validates it.',
        },
        {
          name: 'Required evidence',
          tip: 'Which document proves it was met. E.g. "Filing receipt".',
        },
        { name: 'Risk', tip: 'How serious missing it is; it weighs in the health index.' },
      ],
      example: [
        'Name: "Monthly tax return" · Category: Tax · Repeats: monthly, on the day the lawyer sets.',
        'Whose turn: the client · Required evidence: filing receipt.',
        'Every month the client uploads the receipt and the firm validates it; the matrix counts it as met.',
      ],
      notHere: [
        { text: 'It happens only once', to: 'tasks' },
        {
          text: 'It is a filing before an authority, with a file number and stages',
          to: 'filings',
        },
        { text: 'It is the term or the renewal of a contract', to: 'contracts' },
      ],
    },
    contracts: {
      title: 'Contracts',
      purpose:
        "The record of the client's signed contracts: with whom, until when and whether they renew on their own, to warn before they end.",
      goes: [
        'Signed contracts that need watching: leases, services, licenses, confidentiality.',
        'With the signed document, to have it at hand.',
      ],
      fields: [
        { name: 'Counterparty', tip: 'The other party, by its legal name.' },
        { name: 'Type', tip: 'What kind of contract it is: lease, services, license…' },
        { name: 'In force until', tip: 'The last day of the term, as the contract says.' },
        {
          name: 'Automatic renewal and notice days',
          tip: 'Whether it renews on its own and how many days before notice must be given to stop it; the portal reminds you.',
        },
        { name: 'Document', tip: 'The signed contract.' },
      ],
      example: [
        'Counterparty: "Inmobiliaria Demo, S.A. de C.V." · Type: lease.',
        'Term and notice days: those in the contract · Automatic renewal: yes.',
        'Document: the signed contract, as a PDF.',
      ],
      notHere: [
        { text: 'The contract is still being negotiated or drafted', to: 'matters' },
        {
          text: 'The contract creates a recurring obligation, like a monthly report',
          to: 'compliance',
        },
      ],
    },
    documents: {
      title: 'Documents',
      purpose:
        "All the files of the client's matters and tasks in one place. Each document is uploaded from its matter or task, so it keeps its context.",
      goes: [
        'Drafts, signed versions, receipts, IDs.',
        'They are uploaded from the matter or task they belong to; here you search them all together.',
      ],
      fields: [
        {
          name: 'Name',
          tip: 'What it is and which version. E.g. "Signed articles of incorporation".',
        },
        {
          name: 'Who sees it',
          tip: "The firm's documents start as internal; share them when the client should see them.",
        },
        { name: 'New version', tip: 'To replace a file without losing the previous one.' },
      ],
      example: [
        'In the task "Send the draft minutes", upload "Minutes, draft 2" as internal.',
        'Once reviewed, share it: the client sees it in the task and here.',
      ],
      notHere: [
        { text: 'It is the proof that a recurring obligation was met', to: 'compliance' },
        { text: 'It is a signed contract whose term needs watching', to: 'contracts' },
      ],
    },
    agenda: {
      title: 'Agenda',
      purpose:
        'Every date together: the deadlines of tasks and filings, the deadlines of obligations and contracts, and appointments.',
      goes: [
        'Appointments, meetings and hearings.',
        'The rest arrives on its own: every date you record in another section shows up here.',
      ],
      fields: [
        { name: 'Title', tip: 'What it is and with whom. E.g. "Progress call with the client".' },
        {
          name: 'Type, date and time',
          tip: 'Appointment, meeting or hearing; all day if it has no time.',
        },
        {
          name: 'Your calendar',
          tip: "With your personal link, the agenda shows up in your phone's calendar.",
        },
      ],
      example: [
        'Title: "Signing of the powers of attorney" · Type: Appointment · with date and time.',
        'It shows up in the agenda next to the deadline of the task "Sign the powers of attorney".',
      ],
      notHere: [
        { text: 'It is something to do, not a meeting', to: 'tasks' },
        { text: 'It is a deadline that repeats', to: 'compliance' },
      ],
    },
  },
  client: {
    requests: {
      title: 'Requests',
      purpose:
        'How to ask the firm for something new. Each request is recorded and you see what the firm decided.',
      goes: [
        'Ask for something with "New request": what you need, the details and the urgency.',
        'See whether it is covered by the retainer or the firm will send you a quote.',
        'Once accepted, it becomes a matter you can follow.',
      ],
      fields: [
        {
          name: 'What do you need?',
          tip: 'Your ask in one line. E.g. "Review the contract with the new supplier".',
        },
        {
          name: 'Details',
          tip: 'The context, any dates that matter and which documents you have; you can upload them later in the matter.',
        },
        { name: 'Urgency', tip: 'How soon you need it.' },
      ],
      example: [
        '"We need to review the contract with the new logistics supplier" · Urgency: medium.',
        'The firm classifies it "Within the retainer" and turns it into a matter.',
      ],
      notHere: [
        {
          text: 'There is already an open matter on the subject: write in its comments',
          to: 'matters',
        },
      ],
    },
    matters: {
      title: 'Matters',
      purpose:
        'A matter is an engagement your Fractional Legal Team handles for your company, like an incorporation or a negotiation. It holds its tasks, filings, documents and the conversation.',
      goes: [
        'See the progress: how many tasks are done and what is left.',
        "Write to the firm in the matter's comments.",
        'Upload the documents you are asked for, in the matter or in its task.',
      ],
      fields: [],
      example: [
        '"Incorporation of the subsidiary" · Progress: 3 of 5 tasks done.',
        "The two left say whose turn it is: if one is your company's, it is also in your to-dos.",
      ],
      notHere: [
        { text: 'You need something new from the firm', to: 'requests' },
        { text: 'You are looking for what your company has to do', to: 'tasks' },
      ],
    },
    tasks: {
      title: 'To-dos',
      purpose:
        "Tasks are the steps of each matter. Here are the ones that are your company's turn: deliver a document, sign, answer something.",
      goes: [
        'Press "Start" when you take it and "Mark as ready" when you finish: the firm reviews and closes it.',
        'Tick off the points of its checklist.',
        'Say "It is blocked" if something stops you, and explain it in a comment.',
        'Upload in the task the document you were asked for.',
      ],
      fields: [],
      example: [
        '"Gather the shareholders\' IDs" · Deadline: Friday.',
        'Upload the IDs in the task and mark it as ready.',
      ],
      notHere: [
        { text: 'You want to ask for something new', to: 'requests' },
        { text: 'You must deliver the evidence of a recurring obligation', to: 'compliance' },
      ],
    },
    filings: {
      title: 'Filings',
      purpose:
        'The processes the firm files with authorities for your company. Here you see the stage of each one, since when and the next date.',
      goes: [
        'Follow the stages: the current one, those done and those left.',
        'See whether the authority asked for something ("Request from the authority") and what is needed from you.',
        'Comment and upload documents in the filing.',
      ],
      fields: [],
      example: ['"Registration of the trademark" · Stage 2 of 4 · 12 days in this stage.'],
      notHere: [{ text: 'You need to start a new filing', to: 'requests' }],
    },
    compliance: {
      title: 'Compliance',
      purpose:
        "The calendar of your company's recurring obligations (tax returns, notices, renewals) and the proof they were met.",
      goes: [
        'See what is due soon and what is overdue.',
        'Send the evidence (the receipt, the minutes) of the obligations that are your turn; the firm reviews and validates it.',
        'Read the matrix: how much was met by category and by month.',
      ],
      fields: [],
      example: [
        '"Monthly tax return" · Whose turn: your company.',
        'Send the month\'s receipt: it stays "Under review" until the firm validates it.',
      ],
      notHere: [
        { text: 'It is something done only once', to: 'tasks' },
        { text: 'It is a contract that ends', to: 'contracts' },
      ],
    },
    contracts: {
      title: 'Contracts',
      purpose:
        "Your company's signed contracts the firm keeps an eye on: with whom, until when and whether they renew on their own.",
      goes: [
        'Check terms and download the signed contract.',
        'See in time when notice must be given so it does not renew.',
      ],
      fields: [],
      example: [
        'Lease with "Inmobiliaria Demo" · Automatic renewal: yes.',
        'The last day to give notice that it will not renew shows up in your agenda.',
      ],
      notHere: [{ text: 'You need a new contract or a review of one', to: 'requests' }],
    },
    documents: {
      title: 'Documents',
      purpose:
        'The files you and your Fractional Legal Team share. Each document lives in its matter or task.',
      goes: [
        'Search and download any shared document.',
        'Upload a document from the matter or task it belongs to, so the firm knows what it is for.',
      ],
      fields: [],
      example: [
        'Upload the proof of address in the task "Gather the subsidiary\'s documents": it shows up there and here.',
      ],
      notHere: [{ text: 'It is the evidence of a recurring obligation', to: 'compliance' }],
    },
    agenda: {
      title: 'Agenda',
      purpose:
        'The dates that matter to you, together: deadlines, due dates, renewals and appointments with the firm.',
      goes: [
        'See what is coming this week and this month.',
        "Take the agenda to your phone's calendar with your personal link.",
      ],
      fields: [],
      example: ['Monday: the "Monthly tax return" is due. Thursday: appointment with the firm.'],
      notHere: [{ text: 'You want to ask for an appointment or something new', to: 'requests' }],
    },
  },
  where: {
    firm: [
      { text: 'The client asks for something new', to: 'requests' },
      { text: 'An engagement with several steps: an incorporation, a negotiation', to: 'matters' },
      { text: 'One concrete step: draft, review, send, sign', to: 'tasks' },
      { text: 'Something the client must deliver or do', to: 'tasks' },
      { text: 'A process with a file number before an authority', to: 'filings' },
      { text: 'Something that repeats every month or every year', to: 'compliance' },
      { text: 'A signed contract that ends or renews', to: 'contracts' },
      { text: 'A file', to: 'documents' },
      { text: 'An appointment, a meeting or a hearing', to: 'agenda' },
    ],
    client: [
      { text: 'I need something from the firm', to: 'requests' },
      { text: 'How is an engagement going?', to: 'matters' },
      { text: 'What do I have to do?', to: 'tasks' },
      { text: 'Where is a filing with an authority?', to: 'filings' },
      { text: 'Send the receipt of a tax return', to: 'compliance' },
      { text: 'When does a contract end?', to: 'contracts' },
      { text: 'Find a file', to: 'documents' },
      { text: 'What dates are coming?', to: 'agenda' },
    ],
  },
  map: {
    firm: [
      "A client's request, once accepted, becomes a matter.",
      'The matter splits into tasks, and into filings if it includes processes before an authority.',
      'Documents and comments are kept in the matter, task or filing they belong to.',
      'Compliance and contracts run on their own: what repeats and what ends.',
      'Every date reaches the agenda, the bell and the monthly report.',
    ],
    client: [
      'You ask for something in a request; if the firm accepts it, it becomes a matter.',
      "The matter moves forward with tasks; those that are your company's turn are in your to-dos.",
      'Filings with authorities show their stage; compliance, what repeats; contracts, what ends.',
      'Every date reaches the agenda and the bell.',
    ],
  },
  hints: {
    matterTitle:
      'The whole engagement, as the client would say it. E.g. "Incorporation of the subsidiary". A single action fits better as a task.',
    matterTarget: 'When you expect to finish. Legal deadlines go in tasks or filings.',
    taskTitle: 'Start with a verb and say what gets delivered. E.g. "Send the draft minutes".',
    taskSide: 'If it is the client, they will see it in their to-dos.',
    filingTitle: 'What is being filed. E.g. "Registration of the trademark".',
    filingAuthority: 'Who it is filed with, by name or acronym.',
    filingFolio: 'The number the authority gives on submission.',
    obligationName:
      'As the client knows it. E.g. "Monthly tax return". If it happens only once, it is a task.',
    obligationEvidence: 'Which document proves it was met. E.g. "Filing receipt".',
    contractCounterpart: 'The other party, by its legal name.',
    requestTitle: 'The ask in one line. E.g. "Review the contract with the new supplier".',
    requestDetails: 'The context, the dates that matter and the documents at hand.',
    appointmentTitle: 'What it is and with whom. E.g. "Progress call with the client".',
  },
};
