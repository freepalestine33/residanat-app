# Local lecture draft pipeline

The pipeline keeps generated lecture content local until it has been reviewed. It uses the same `Lecture` JSON shape as `public/data/lectures/`. AI calls happen only from the local command line; the API key is never put in the browser. The selected provider receives the extracted PDF text, so only use documents you are allowed to send to that provider.

## Import from a PDF

Add an API key for the provider you want to use to `.env` or `.env.local` (both files are loaded by the command). Set `LECTURE_AI_PROVIDER=openai` with `OPENAI_API_KEY`, `LECTURE_AI_PROVIDER=anthropic` with `ANTHROPIC_API_KEY`, `LECTURE_AI_PROVIDER=xai` with `XAI_API_KEY`, or `LECTURE_AI_PROVIDER=gemini` with `GEMINI_API_KEY`. The defaults use `gpt-6.1-sol`, `claude-sonnet-5`, `grok-4.7`, and `gemini-3.8-flash`; override the model with the matching provider model variable if needed. Never paste a private API key into chat or commit it to Git.

OpenAI API usage is billed separately from a ChatGPT subscription. Check the [current model pricing](https://platform.openai.com/pricing) and your API credit balance before generating a lecture.

The Gemini API has a free tier for some models and quotas, but Google states that content sent through its unpaid services may be used to improve its products. Check the current [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) and [terms](https://ai.google.dev/gemini-api/terms) before sending course documents. Grok's consumer app has a free plan, while the xAI API is usage-billed.

Start the app in another terminal with `npm run dev`, then run:

```powershell
npm run lecture:import -- .\incoming\course.pdf --provider anthropic --otr 12
```

The provider can be selected in `.env`, so this can be shortened to `npm run lecture:import -- .\incoming\course.pdf`. Optional flags include `--id`, `--name`, `--model`, `--max-chars`, `--max-output-tokens`, `--prompt`, and `--no-open`. The command extracts selectable PDF text, asks the configured provider to create the lecture JSON, validates it, stores the original PDF with a local draft, and opens the preview when the local app is running. Scanned image-only PDFs require OCR before import. Long PDFs that exceed the configured character limit must be split or explicitly allowed with `--max-chars`.

The model output is a draft only. It is never published automatically. Review the generated cards, quiz answers, true/false explanations, and source references against the PDF before running `lecture:publish`.

## Prepare and check a lecture

If you already have lecture JSON, you can create a draft without an AI call. Run the checker first:

```powershell
npm run lecture:check -- .\incoming\my-lecture.json
```

The checker validates the lecture schema, unique card/quiz/true-false IDs, and that each quiz and true-false item links to existing cards. It also reports basic completeness warnings, including missing explanations or sources.

## Create a draft

```powershell
npm run lecture:draft -- .\incoming\my-lecture.json --pdf .\incoming\course.pdf --otr 12
```

`--pdf` and `--otr` are optional. `--otr` links the lecture to one of the 43 OTR programme topics. The command writes `data/drafts/<id>.json`; a supplied PDF is copied under `data/drafts/pdfs/`. These local draft files are gitignored.

## Preview and review

Run the Vite app with `npm run dev`, then open `/#/draft/<id>` (the draft command prints the route). The preview displays the lecture’s cards, quiz, and true/false items in read-only form. Review the source material and verify medical answers before publishing.

## Publish after review

```powershell
npm run lecture:publish -- .\data\drafts\my-lecture.json
```

The publisher validates the draft again, rejects duplicate lecture IDs or OTR assignments, writes the lecture to `public/data/lectures/<id>.json`, and registers it in `public/data/index.json`. The reviewed draft is archived under the ignored `data/published-drafts/` folder. An associated source PDF is archived locally and is not made public. Publishing updates the repository files; deploying the app is a separate step.

## Expected lecture shape

Use the same fields as existing lecture files (`id`, `name`, `cards`, `quiz`, `vf`, and any optional metadata). Each card needs a unique `id`, `q`, and `a`. Each quiz and true/false item needs a unique `id` and a non-empty `cards` array whose values are existing card IDs. Quiz options must reference valid option IDs and include at least one correct option.
