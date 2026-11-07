# Hinglish text test — 2026-11-07

All sentences are synthetic (written for testing). No audio, no Gnani calls.

## Findings (7 Nov 2026)

- **First pass** of the new rules: 83 / 85 danger sentences fired, 1 / 20 safe sentences falsely fired.
  Misses: `it smells like burnt plastic` (no bare "burnt"), `panel से jalne की smell` (mixed script inside
  a phrase). False alarm: `current shift mein paanch log hain` (bare "karant" normalised to "current").
  Fixes: added "burnt"; the normaliser maps Hindi helper words (की/का/के/से/में/पर/है) to Latin; kept only
  "karant maar/lag" phrases. Result: 85 / 85 and 0 / 20 (part A below).
- **Real LLM run (part B): Gemini rate-limited 14 of 15 requests (HTTP 429)**, so only 1 sentence was really
  extracted by the LLM; the other 14 were handled by the keyword fallback and are labelled so. The budget
  (15 calls) was used up, so the LLM part was not retried. The rules fired on every danger sentence either way.
- The one part-B failure (`पैकेजिंग मशीन से जलने की बदबू`: no machine, typed as gas) was fixed in the
  fallback: machine names are now matched, M-12 got the aliases "packaging machine" / "पैकेजिंग मशीन",
  and "जलने की" counts as smoke. Part C shows the fallback on the same 15 sentences after the fix.

## A. Safety rules stress test (no Gnani, no LLM)

- Danger sentences that fired the right rule: **85 / 85** (100%)
- Safe sentences that wrongly fired: **0 / 20**

| Rule | Fired / total |
|---|---|
| S1 | 17 / 17 |
| S2 | 17 / 17 |
| S3 | 17 / 17 |
| S4 | 17 / 17 |
| S5 | 17 / 17 |

| Style | Fired / total |
|---|---|
| english | 13 / 13 |
| hindi | 19 / 19 |
| hinglish | 24 / 24 |
| misspelled | 11 / 11 |
| mixed | 11 / 11 |
| stt | 7 / 7 |

## B. Real extractor on 15 representative sentences (Gemini `gemini-3.6-flash`)

- Machine correct (or correctly asked when ambiguous): **14 / 15**
- Incident type correct: **14 / 15**
- Both correct: **14 / 15**
- Real LLM requests made: **15** (cap 15); Gnani calls: 0

| Sentence | Language | Expected machine / type | Got machine / type | Extractor | Final severity | OK |
|---|---|---|---|---|---|---|
| Machine 14 mein dhuan aa raha hai | hinglish | M-14 / smoke | M-14 / smoke | keyword fallback (fallback: LLM unavailable (RateLimitError after 0.8 s) — used keyword extractor) | critical (safety_rule) | ✅ |
| मशीन 9 की भट्टी बहुत गरम हो गई है | hindi | M-09 / overheating | M-09 / overheating | keyword fallback (fallback: LLM unavailable (RateLimitError after 0.8 s) — used keyword extractor) | high (keyword_fallback) | ✅ |
| Sparks are coming from the LT panel | english | M-13 / sparks_fire | M-13 / sparks_fire | llm:gemini-3.6-flash | critical (safety_rule) | ✅ |
| compressor se khat khat ki awaaz aa rahi hai | hinglish | M-01 / noise | M-01 / noise | keyword fallback (fallback: LLM unavailable (RateLimitError after 0.7 s) — used keyword extractor) | medium (keyword_fallback) | ✅ |
| Hydraulic press ke neeche tel tapak raha hai | hinglish | M-05 / oil_leak | M-05 / oil_leak | keyword fallback (fallback: LLM unavailable (RateLimitError after 0.4 s) — used keyword extractor) | medium (keyword_fallback) | ✅ |
| Conveyor belt bahut zyada hil raha hai | hinglish | M-06 / vibration | M-06 / vibration | keyword fallback (fallback: LLM unavailable (RateLimitError after 0.4 s) — used keyword extractor) | medium (keyword_fallback) | ✅ |
| Chemical mixing tank ke paas gas ki badbu aa rahi hai | hinglish | M-11 / gas_leak | M-11 / gas_leak | keyword fallback (fallback: LLM unavailable (RateLimitError after 0.4 s) — used keyword extractor) | critical (safety_rule) | ✅ |
| पैकेजिंग मशीन से जलने की बदबू आ रही है | hindi | M-12 / overheating/smoke | none → asks: Kaunsi machine? Machine ka number batayiye. / gas_leak | keyword fallback (fallback: LLM unavailable (RateLimitError after 0.4 s) — used keyword extractor) | critical (safety_rule) | ❌ |
| Machine fourteen main dhua aa raha | hinglish (STT-style) | M-14 / smoke | M-14 / smoke | keyword fallback (fallback: LLM unavailable (RateLimitError after 0.7 s) — used keyword extractor) | critical (safety_rule) | ✅ |
| Welding robot cell mein aag lag gayi | hinglish | M-10 / sparks_fire | M-10 / sparks_fire | keyword fallback (fallback: LLM unavailable (RateLimitError after 0.7 s) — used keyword extractor) | critical (safety_rule) | ✅ |
| The cooling tower fan is vibrating badly | english | M-03 / vibration | M-03 / vibration | keyword fallback (fallback: LLM unavailable (RateLimitError after 0.7 s) — used keyword extractor) | medium (keyword_fallback) | ✅ |
| Thermic fluid heater ka temperature bahut badh gaya hai | hinglish | M-40 / overheating | M-40 / overheating | keyword fallback (fallback: LLM unavailable (RateLimitError after 0.7 s) — used keyword extractor) | high (keyword_fallback) | ✅ |
| डीज़ल जनरेटर से तेल लीक हो रहा है | hindi | M-02 / oil_leak | M-02 / oil_leak | keyword fallback (fallback: LLM unavailable (RateLimitError after 0.3 s) — used keyword extractor) | medium (keyword_fallback) | ✅ |
| teen ya tees number wali machine se awaaz aa rahi hai | hinglish (ambiguous) | ask / noise | none → asks: Kaunsi machine? Machine ka number batayiye. / noise | keyword fallback (fallback: LLM unavailable (RateLimitError after 0.3 s) — used keyword extractor) | medium (keyword_fallback) | ✅ |
| grinding machine ke paas chingari nikal rahi hai | hinglish | M-15 / sparks_fire | M-15 / sparks_fire | keyword fallback (fallback: LLM unavailable (RateLimitError after 0.7 s) — used keyword extractor) | critical (safety_rule) | ✅ |

Single run, 15 hand-written synthetic sentences — this is a smoke check, not an accuracy figure.


## C. Keyword fallback alone on the same 15 sentences (offline, no LLM)

- Machine and type both correct: **15 / 15**
- Caveat: the same person wrote these sentences and the keyword lists, so this flatters the fallback.

| Sentence | Expected | Got | OK |
|---|---|---|---|
| Machine 14 mein dhuan aa raha hai | M-14 / smoke | M-14 / smoke | ✅ |
| मशीन 9 की भट्टी बहुत गरम हो गई है | M-09 / overheating | M-09 / overheating | ✅ |
| Sparks are coming from the LT panel | M-13 / sparks_fire | M-13 / sparks_fire | ✅ |
| compressor se khat khat ki awaaz aa rahi hai | M-01 / noise | M-01 / noise | ✅ |
| Hydraulic press ke neeche tel tapak raha hai | M-05 / oil_leak | M-05 / oil_leak | ✅ |
| Conveyor belt bahut zyada hil raha hai | M-06 / vibration | M-06 / vibration | ✅ |
| Chemical mixing tank ke paas gas ki badbu aa rahi hai | M-11 / gas_leak | M-11 / gas_leak | ✅ |
| पैकेजिंग मशीन से जलने की बदबू आ रही है | M-12 / overheating/smoke | M-12 / smoke | ✅ |
| Machine fourteen main dhua aa raha | M-14 / smoke | M-14 / smoke | ✅ |
| Welding robot cell mein aag lag gayi | M-10 / sparks_fire | M-10 / sparks_fire | ✅ |
| The cooling tower fan is vibrating badly | M-03 / vibration | M-03 / vibration | ✅ |
| Thermic fluid heater ka temperature bahut badh gaya hai | M-40 / overheating | M-40 / overheating | ✅ |
| डीज़ल जनरेटर से तेल लीक हो रहा है | M-02 / oil_leak | M-02 / oil_leak | ✅ |
| teen ya tees number wali machine se awaaz aa rahi hai | ask / noise | none (asks) / noise | ✅ |
| grinding machine ke paas chingari nikal rahi hai | M-15 / sparks_fire | M-15 / sparks_fire | ✅ |
