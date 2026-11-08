# Local lecture draft pipeline

The pipeline keeps generated lecture content local until it has been reviewed. It uses the same `Lecture` JSON shape as `public/data/lectures/`; no AI provider, API key, or PDF upload endpoint is involved.

## Prepare and check a lecture

Create a JSON file containing one lecture using the existing schema. Then run:

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
